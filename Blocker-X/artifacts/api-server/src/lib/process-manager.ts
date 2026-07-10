import { spawn, ChildProcess, execSync } from "child_process";
import { rmSync, mkdirSync, existsSync } from "fs";
import { writeFile, mkdir, readFile, readdir, lstat, realpath } from "fs/promises";
import path from "path";
import { getBxInjectPy, getBxRunPy, getBxConfigPy, getBxDataPy, getBxPreloadJs } from "./bx-scripts";
import { db, botsTable, botLogsTable, envVarsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "./logger";
import { sendDiscordDm, createNotification } from "./notifications";
import { fireWebhooks } from "./webhooks";

const BOT_WORK_DIR = "/tmp/blockerx-bots";

interface BotProcess {
  child: ChildProcess;
  botId: string;
  isStopping: boolean;
  restartCount: number;
  startedAt: Date;
  planTimers: NodeJS.Timeout[];
}

const processes = new Map<string, BotProcess>();

export function getProcessStatus(botId: string): "running" | "stopped" {
  const bp = processes.get(botId);
  if (!bp || bp.child.exitCode !== null || bp.child.killed) return "stopped";
  return "running";
}

export function getRunningBotIds(): string[] {
  return Array.from(processes.keys()).filter(
    (id) => getProcessStatus(id) === "running"
  );
}

/**
 * Force a running bot to immediately re-check its presence config instead of
 * waiting for its own ~3s poll cycle. Used by the "Aplicar ahora" button.
 * Returns false if the bot isn't currently running.
 */
export function forcePresenceCheck(botId: string): boolean {
  const bp = processes.get(botId);
  if (!bp || bp.child.exitCode !== null || bp.child.killed) return false;
  try {
    bp.child.kill("SIGUSR2");
    return true;
  } catch {
    return false;
  }
}

async function addLog(botId: string, level: string, message: string): Promise<void> {
  try {
    await db.insert(botLogsTable).values({ id: randomUUID(), botId, level, message });
  } catch (e) {
    logger.error({ e }, "Failed to write bot log");
  }
}

/**
 * Platform-injected files that must never be uploaded back to R2 —
 * they are regenerated fresh on every start.
 */
const BX_PLATFORM_FILES = new Set([
  "_bx_inject.py",
  "_bx_run.py",
  "bx_config.py",
  "bx_data.py",
  "bx_data.db",
  "_bx_preload.js",
]);

/**
 * Directories whose contents should never be uploaded to R2.
 * These are large/ephemeral dependency directories.
 */
const SKIP_DIRS = new Set([
  "__pycache__",
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "env",
  ".mypy_cache",
  ".pytest_cache",
]);

/**
 * Maximum number of files to upload in a single syncWorkdirToR2 pass.
 * Prevents bots that generate massive guild-data JSON files (one per server)
 * from bloating R2 and slowing down restarts.
 */
const MAX_SYNC_FILES = 150;

/**
 * Returns true for directory names that look like Discord/numeric IDs.
 * These directories are created automatically by bots to store per-guild data
 * (e.g. "1234567890/economy.json") and should not be synced to R2 —
 * use bx_config.py for persistent data instead.
 */
function isNumericIdDir(name: string): boolean {
  // Discord snowflakes are 17–20 digits. Skip directories with these names
  // as they are per-guild data folders, not source code.
  return /^\d{17,20}$/.test(name);
}

/**
 * Walk the bot's working directory and upload every file to R2,
 * skipping platform-injected helpers, dependency caches, and generated artifacts.
 *
 * This is called BEFORE wiping the directory on restart so that any files
 * the bot wrote locally (e.g. data/bienvenida_config.json) survive the restart
 * without requiring any code changes in the bot itself.
 *
 * Returns the number of files that failed to upload so the caller can decide
 * whether to abort or proceed.
 */
async function syncWorkdirToR2(botId: string, r2Prefix: string, workDir: string): Promise<{ uploaded: number; failed: number; skipped: number }> {
  if (!existsSync(workDir)) return { uploaded: 0, failed: 0, skipped: 0 };


  const { r2WriteBuffer } = await import("./r2");
  const prefix = r2Prefix.endsWith("/") ? r2Prefix : r2Prefix + "/";
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;

  // Resolve the real absolute path of workDir once, used to prevent symlink escapes
  let realWorkDir: string;
  try {
    realWorkDir = await realpath(workDir);
  } catch (e) {
    // If we can't resolve workDir itself, treat the entire sync as failed
    logger.error({ e, workDir, botId }, "syncWorkdirToR2: cannot resolve realpath of workDir");
    return { uploaded: 0, failed: 1, skipped: 0 };
  }

  async function walkAndUpload(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = (await readdir(dir)).sort();
    } catch (e) {
      // Treat unreadable directories as failures so operators know data may be missing
      logger.warn({ e, dir }, "syncWorkdirToR2: cannot read directory, treating as failed");
      failed++;
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);

      // Use lstat so we can detect and skip symlinks without following them
      let fileStat: Awaited<ReturnType<typeof lstat>>;
      try {
        fileStat = await lstat(fullPath);
      } catch (e) {
        logger.warn({ e, fullPath }, "syncWorkdirToR2: lstat failed, counting as failed");
        failed++;
        continue;
      }

      // Policy skip: symlinks can point outside workDir — skip, not an error
      if (fileStat.isSymbolicLink()) continue;

      if (fileStat.isDirectory()) {
        // Policy skip: known heavy/ephemeral directories
        if (SKIP_DIRS.has(entry)) continue;
        // Policy skip: numeric-only directory names are Discord guild/user IDs.
        // Bots that store per-guild data in folders like "1234567890/" can
        // generate thousands of files. Use bx_config.py for persistent data instead.
        if (isNumericIdDir(entry)) {
          logger.info({ dir: fullPath, entry }, "syncWorkdirToR2: skipping numeric-ID directory (guild data) — use bx_config.py for persistence");
          continue;
        }
        await walkAndUpload(fullPath);
      } else if (fileStat.isFile()) {
        // Enforce path containment — resolved path must stay inside workDir
        let realFull: string;
        try {
          realFull = await realpath(fullPath);
        } catch (e) {
          logger.warn({ e, fullPath }, "syncWorkdirToR2: realpath failed, counting as failed");
          failed++;
          continue;
        }
        if (!realFull.startsWith(realWorkDir + path.sep) && realFull !== realWorkDir) {
          // Policy skip: path traversal guard — not counted as failure
          logger.warn({ fullPath, realFull, realWorkDir }, "syncWorkdirToR2: file escapes workDir, skipping (policy)");
          continue;
        }

        // Policy skips — not counted as failures (intentional exclusions)
        if (BX_PLATFORM_FILES.has(entry)) continue;
        if (entry.endsWith(".pyc")) continue;
        if (fileStat.size > 50 * 1024 * 1024) {
          logger.warn({ fullPath, size: fileStat.size }, "syncWorkdirToR2: file exceeds 50 MB limit, skipping (policy)");
          continue;
        }

        // Cap total files to avoid bots with massive data sets bloating R2
        if (uploaded >= MAX_SYNC_FILES) {
          skipped++;
          logger.warn({ fullPath, botId, MAX_SYNC_FILES }, "syncWorkdirToR2: file count cap reached, skipping (policy) — use bx_config.py for persistent data");
          continue;
        }

        const relativePath = path.relative(workDir, fullPath).replace(/\\/g, "/");
        const r2Key = prefix + relativePath;

        try {
          const content = await readFile(fullPath);
          await r2WriteBuffer(r2Key, content);
          uploaded++;
        } catch (e) {
          logger.warn({ e, fullPath, r2Key }, "syncWorkdirToR2: upload failed");
          failed++;
        }
      }
    }
  }

  try {
    await walkAndUpload(workDir);
    if (skipped > 0) {
      logger.warn({ botId, uploaded, failed, skipped }, "syncWorkdirToR2: sync complete — some files were skipped (guild data dirs or cap). Use bx_config.py for persistent data.");
    } else {
      logger.info({ botId, uploaded, failed }, "syncWorkdirToR2: sync complete");
    }
  } catch (e) {
    logger.error({ e, botId }, "syncWorkdirToR2: unexpected error during sync");
    failed++;
  }

  return { uploaded, failed, skipped };
}

async function downloadBotFiles(botId: string, r2Prefix: string): Promise<string> {
  const { r2Client, bucketName } = await import("./r2");
  const { ListObjectsV2Command, GetObjectCommand } = await import("@aws-sdk/client-s3");

  const workDir = path.join(BOT_WORK_DIR, botId);

  // R2 is the source of truth for bot code. User edits are saved directly to R2
  // via the files API. We do NOT sync local → R2 here because that would overwrite
  // intentional user edits made while the bot was running.
  // Bot-generated runtime data (configs, etc.) should use bx_config.py / bx_data.py.
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const prefix = r2Prefix.endsWith("/") ? r2Prefix : r2Prefix + "/";

  let continuationToken: string | undefined;
  const keys: string[] = [];

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const resp = await r2Client.send(cmd);
    for (const obj of resp.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);

  for (const key of keys) {
    const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const resp = await r2Client.send(cmd);
    if (!resp.Body) continue;

    const chunks: Uint8Array[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);

    const relativePath = key.slice(prefix.length);
    if (!relativePath) continue;
    const filePath = path.resolve(workDir, relativePath);
    // Defense-in-depth: ensure resolved path stays inside workDir
    if (!filePath.startsWith(workDir + path.sep) && filePath !== workDir) {
      logger.warn({ key, filePath, workDir }, "Skipping R2 key that resolves outside workDir (path traversal guard)");
      continue;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return workDir;
}

async function getEnvVars(botId: string): Promise<Record<string, string>> {
  const vars = await db.select().from(envVarsTable).where(eq(envVarsTable.botId, botId));
  const env: Record<string, string> = {};
  for (const v of vars) env[v.key] = v.value;
  return env;
}

function runInstallSync(cmd: string, args: string[], cwd: string): { success: boolean; output: string } {
  try {
    const output = execSync([cmd, ...args].join(" "), { cwd, timeout: 120000, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { success: true, output };
  } catch (e: any) {
    return { success: false, output: e.message || "Install failed" };
  }
}

function clearBotTimers(botId: string) {
  const bp = processes.get(botId);
  if (bp) {
    for (const t of bp.planTimers) clearTimeout(t);
    bp.planTimers = [];
  }
}

function scheduleFreeRestarts(botId: string, bot: { id: string; language: string; mainFile: string | null; r2Prefix: string }, userId: string) {
  const bp = processes.get(botId);
  if (!bp) return;

  // Free plan: bot auto-stops after 48 hours. User must restart it manually.
  const STOP_DELAY = 48 * 60 * 60 * 1000;       // 48 h
  const WARN_BEFORE = 30 * 60 * 1000;            // warn 30 min before
  const warnDelay = STOP_DELAY - WARN_BEFORE;

  const tWarn = setTimeout(async () => {
    const current = processes.get(botId);
    if (!current || current.isStopping) return;
    await addLog(botId, "warn", "[System] ⚠️ Free plan: tu bot se apagará automáticamente en 30 minutos. Vuelve a encenderlo cuando quieras.");
  }, warnDelay);

  const tStop = setTimeout(async () => {
    const current = processes.get(botId);
    if (!current || current.isStopping) return;
    await addLog(botId, "warn", "[System] 🔴 Free plan: el bot ha sido detenido automáticamente tras 48 horas. Inícialo manualmente desde el dashboard.");
    await stopBot(botId);
    // Notify user
    try {
      const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (freshUser?.discordId) {
        const [freshBot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
        const botName = freshBot?.name || "Tu bot";
        await sendDiscordDm(freshUser.discordId, {
          title: "Bot detenido — Plan Free",
          message: `**${botName}** se ha apagado automáticamente tras 48 h. Reinícialo desde tu dashboard de BX.`,
          type: "warning",
          throttleKey: `${botId}:free-timeout`,
        });
        await createNotification({
          userId,
          title: `${botName} detenido (plan free)`,
          message: "Tu bot se ha apagado automáticamente tras 48 horas de actividad. Inícialo de nuevo cuando quieras.",
          type: "warning",
        });
      }
    } catch (_) {}
  }, STOP_DELAY);

  bp.planTimers = [tWarn, tStop];
}

async function spawnBotProcess(
  bot: { id: string; language: string; mainFile: string | null; r2Prefix: string },
  userId: string,
  userPlan: string,
  restartCount = 0
): Promise<void> {
  const botId = bot.id;

  try {
    await addLog(botId, "info", "[System] Downloading files from R2...");
    const workDir = await downloadBotFiles(botId, bot.r2Prefix);
    await addLog(botId, "info", `[System] Files ready in ${workDir}`);

    const envVars = await getEnvVars(botId);
    const mainFile = bot.mainFile || (bot.language === "python" ? "main.py" : "index.js");
    let cmd: string;
    let args: string[];

    if (bot.language === "python") {
      // Diagnostic: verify Python availability before attempting install
      const pyCheck = runInstallSync("python3", ["--version"], workDir);
      const pipCheck = runInstallSync("python3", ["-m", "pip", "--version"], workDir);
      await addLog(botId, "info", `[System] Python: ${pyCheck.success ? pyCheck.output.trim() : "NOT FOUND - " + pyCheck.output.slice(0, 100)}`);
      await addLog(botId, "info", `[System] pip: ${pipCheck.success ? pipCheck.output.trim() : "NOT FOUND - " + pipCheck.output.slice(0, 100)}`);

      if (!pyCheck.success) {
        await addLog(botId, "error", "[System] FATAL: python3 is not installed on this server. Contact support.");
        await db.update(botsTable).set({ status: "errored" }).where(eq(botsTable.id, botId));
        return;
      }

      await addLog(botId, "info", "[System] Installing Python dependencies...");

      const { existsSync, readFileSync } = await import("fs");

      const IMPORT_TO_PKG: Record<string, string> = {
        discord: "discord.py",
        nextcord: "nextcord",
        disnake: "disnake",
        interactions: "discord-py-interactions",
        hikari: "hikari",
        lightbulb: "hikari-lightbulb",
        aiohttp: "aiohttp",
        requests: "requests",
        flask: "flask",
        fastapi: "fastapi",
        dotenv: "python-dotenv",
        pymongo: "pymongo",
        motor: "motor",
        sqlalchemy: "SQLAlchemy",
        psycopg2: "psycopg2-binary",
        redis: "redis",
        PIL: "Pillow",
        cv2: "opencv-python",
        numpy: "numpy",
        pandas: "pandas",
      };

      // Read ALL Python files to detect imports (not just main file)
      const detected = new Set<string>(["discord.py"]);
      const { readdirSync } = await import("fs");
      function scanPyFiles(dir: string, depth = 0): void {
        if (depth > 3) return;
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "__pycache__") {
              scanPyFiles(path.join(dir, entry.name), depth + 1);
            } else if (entry.isFile() && entry.name.endsWith(".py")) {
              try {
                const content = readFileSync(path.join(dir, entry.name), "utf-8");
                for (const [imp, pkg] of Object.entries(IMPORT_TO_PKG)) {
                  if (new RegExp(`(^|\\n)\\s*(import ${imp}|from ${imp})`, "m").test(content)) {
                    detected.add(pkg);
                  }
                }
              } catch { /* skip unreadable files */ }
            }
          }
        } catch { /* skip unreadable dirs */ }
      }
      scanPyFiles(workDir);

      // Also install from requirements.txt if it exists
      const reqPath = path.join(workDir, "requirements.txt");
      if (!existsSync(reqPath)) {
        await writeFile(reqPath, Array.from(detected).join("\n") + "\n");
        await addLog(botId, "info", `[System] Auto-created requirements.txt: ${Array.from(detected).join(", ")}`);
      } else {
        // Merge detected packages into existing requirements.txt
        const existing = readFileSync(reqPath, "utf-8");
        const missing = Array.from(detected).filter(pkg =>
          !existing.toLowerCase().includes(pkg.toLowerCase().split(/[>=<]/)[0])
        );
        if (missing.length > 0) {
          await writeFile(reqPath, existing.trimEnd() + "\n" + missing.join("\n") + "\n");
          await addLog(botId, "info", `[System] Added to requirements.txt: ${missing.join(", ")}`);
        }
      }

      // Install using python3 -m pip with --break-system-packages (required on Debian/Ubuntu PEP 668 systems)
      await addLog(botId, "info", `[System] Running: python3 -m pip install -r requirements.txt`);
      const PIP_FLAGS = ["-m", "pip", "install", "-r", "requirements.txt", "--quiet", "--exists-action", "i", "--break-system-packages"];
      const result = runInstallSync("python3", PIP_FLAGS, workDir);
      if (!result.success) {
        // Fallback: pip3 with --break-system-packages
        const result2 = runInstallSync("pip3", ["install", "-r", "requirements.txt", "--quiet", "--exists-action", "i", "--break-system-packages"], workDir);
        if (!result2.success) {
          // Last resort: without --break-system-packages (older systems)
          const result3 = runInstallSync("pip3", ["install", "-r", "requirements.txt", "--quiet", "--exists-action", "i"], workDir);
          if (!result3.success) {
            const errMsg = result3.output.slice(0, 400);
            await addLog(botId, "error", `[System] FATAL: Could not install Python dependencies: ${errMsg}`);
            await db.update(botsTable).set({ status: "errored" }).where(eq(botsTable.id, botId));
            return;
          }
        }
      }
      await addLog(botId, "info", "[System] Python dependencies installed successfully.");

      // Inject BlockerX platform helpers — ver bx-scripts.ts para el contenido y la lógica.
      await writeFile(path.join(workDir, "_bx_inject.py"), getBxInjectPy());
      await writeFile(path.join(workDir, "_bx_run.py"), getBxRunPy(mainFile));
      await writeFile(path.join(workDir, "bx_config.py"), getBxConfigPy());
      await writeFile(path.join(workDir, "bx_data.py"), getBxDataPy());
      await addLog(botId, "info", "[System] Platform helpers injected (_bx_inject.py, bx_config.py, bx_data.py).");
      cmd = "python3";
      args = ["-u", "_bx_run.py"];
    } else {
      await addLog(botId, "info", "[System] Installing Node.js dependencies...");
      const result = runInstallSync("npm", ["install", "--no-fund", "--no-audit", "--prefer-offline"], workDir);
      if (!result.success) {
        await addLog(botId, "warn", `[System] Dependency note: ${result.output.slice(0, 200)}`);
      } else {
        await addLog(botId, "info", "[System] Node.js dependencies installed.");
      }
      // Inject anti-duplicate guard for JS bots via `-r` preload — see bx-scripts.ts.
      // Does not touch the user's own files, only wraps discord.js event emission.
      await writeFile(path.join(workDir, "_bx_preload.js"), getBxPreloadJs());
      cmd = "node";
      args = ["-r", "./_bx_preload.js", mainFile];
    }

    await addLog(botId, "info", `[System] Spawning: ${cmd} ${args.join(" ")}`);

    // Compute the bot-internal HMAC token so the bot can authenticate with
    // /api/bot-internal/config endpoints to persist configuration in R2.
    const { computeBotToken } = await import("../routes/bot-internal");
    const bxInternalToken = computeBotToken(botId);
    const bxApiUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;

    const child = spawn(cmd, args, {
      cwd: workDir,
      env: {
        ...process.env,
        ...envVars,
        BOT_ID: botId,
        BX_BOT_ID: botId,
        BX_INTERNAL_TOKEN: bxInternalToken,
        BX_API_URL: bxApiUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const bp: BotProcess = {
      child,
      botId,
      isStopping: false,
      restartCount,
      startedAt: new Date(),
      planTimers: [],
    };
    processes.set(botId, bp);

    if (userPlan === "free") {
      scheduleFreeRestarts(botId, bot, userId);
    }

    await db.update(botsTable).set({ status: "running" }).where(eq(botsTable.id, botId));
    fireWebhooks(userId, botId, "bot_started").catch(() => {});

    // Notify user when bot comes online — throttled to avoid spam on scheduled restarts
    try {
      const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (freshUser?.discordId) {
        const [freshBot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
        const botName = freshBot?.name || "Tu bot";
        await sendDiscordDm(freshUser.discordId, {
          title: "Bot en línea",
          message: `**${botName}** está conectado y funcionando.`,
          type: "success",
          throttleKey: `${botId}:online`,
        });
        await createNotification({
          userId,
          title: `${botName} en línea`,
          message: `Tu bot está activo y conectado a Discord.`,
          type: "success",
        });
      }
    } catch (_) {}

    child.stdout?.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l) => l.trim());
      for (const line of lines) await addLog(botId, "info", line);
    });

    child.stderr?.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l) => l.trim());
      for (const line of lines) await addLog(botId, "error", line);
    });

    child.on("exit", async (code, signal) => {
      clearBotTimers(botId);
      const current = processes.get(botId);
      if (current?.child !== child) return;

      processes.delete(botId);

      if (current.isStopping) {
        await db.update(botsTable).set({ status: "stopped" }).where(eq(botsTable.id, botId));
        await addLog(botId, "info", "[System] Bot stopped gracefully.");
        fireWebhooks(userId, botId, "bot_stopped").catch(() => {});
        return;
      }

      // Non-zero exit = crash/error → stop completely, don't restart
      if (code !== 0 && code !== null) {
        await db.update(botsTable).set({ status: "errored" }).where(eq(botsTable.id, botId));
        await addLog(botId, "error", `[System] Bot crashed (exit code ${code}). Stopped. Fix the error and restart manually.`);
        fireWebhooks(userId, botId, "bot_crashed", { exitCode: code }).catch(() => {});
        try {
          const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          const [freshBot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
          if (freshUser?.discordId) {
            const botName = freshBot?.name || "Tu bot";
            await sendDiscordDm(freshUser.discordId, {
              title: "Bot detenido por error",
              message: `**${botName}** se cerró inesperadamente (código ${code}).\nRevisa los logs y reinicia manualmente.`,
              type: "error",
              throttleKey: `${botId}:crash`,
            });
            await createNotification({
              userId,
              title: `Error en ${botName}`,
              message: `El bot se cerró con código ${code}. Revisa los logs.`,
              type: "error",
            });
          }
        } catch (_) {}
        return;
      }

      // Exit code 0 = clean exit → just mark as stopped
      if (code === 0) {
        await db.update(botsTable).set({ status: "stopped" }).where(eq(botsTable.id, botId));
        await addLog(botId, "info", "[System] Bot exited cleanly.");
        fireWebhooks(userId, botId, "bot_stopped").catch(() => {});
        return;
      }

      // Killed by signal (not by us) → restart once
      const exitInfo = signal ? `signal ${signal}` : `code ${code}`;
      await addLog(botId, "warn", `[System] Bot terminated by ${exitInfo}. Restarting in 5s...`);
      await db.update(botsTable).set({ status: "starting" }).where(eq(botsTable.id, botId));
      fireWebhooks(userId, botId, "bot_restarted", { reason: exitInfo }).catch(() => {});

      setTimeout(async () => {
        const [freshBot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
        if (!freshBot || freshBot.status === "stopped") return;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        await spawnBotProcess(freshBot as any, userId, user?.plan || "free", (current?.restartCount || 0) + 1);
      }, 5000);
    });
  } catch (err: any) {
    await addLog(botId, "error", `[System] Failed to start bot: ${err.message}`);
    await db.update(botsTable).set({ status: "errored" }).where(eq(botsTable.id, botId));
    logger.error({ err, botId }, "Failed to spawn bot");
  }
}

export async function startBot(
  bot: { id: string; language: string; mainFile: string | null; r2Prefix: string; userId: string }
): Promise<void> {
  const botId = bot.id;

  const existing = processes.get(botId);
  if (existing && !existing.isStopping && existing.child.exitCode === null) {
    throw new Error("Bot is already running");
  }

  await db.update(botsTable).set({ status: "starting" }).where(eq(botsTable.id, botId));
  await addLog(botId, "info", "[System] Bot start requested.");

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, bot.userId));
  const plan = user?.plan || "free";

  spawnBotProcess(bot, bot.userId, plan, 0).catch((err) => {
    logger.error({ err, botId }, "spawnBotProcess error");
  });
}

export async function stopBot(botId: string): Promise<void> {
  const bp = processes.get(botId);
  if (!bp) {
    await db.update(botsTable).set({ status: "stopped" }).where(eq(botsTable.id, botId));
    await addLog(botId, "info", "[System] Bot stopped.");
    return;
  }

  bp.isStopping = true;
  clearBotTimers(botId);
  await addLog(botId, "info", "[System] Stopping bot...");

  bp.child.kill("SIGTERM");

  setTimeout(() => {
    if (bp.child.exitCode === null && !bp.child.killed) {
      bp.child.kill("SIGKILL");
    }
  }, 5000);
}

/**
 * Reinstall: stop (with wait), wipe ONLY venv/node_modules (not user files), then start.
 * User's bot code and configs survive untouched.
 */
export async function reinstallBot(
  bot: { id: string; language: string; mainFile: string | null; r2Prefix: string; userId: string },
  userId: string
): Promise<void> {
  const botId = bot.id;

  const bp = processes.get(botId);
  if (bp) {
    bp.isStopping = true;
    clearBotTimers(botId);
    bp.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { bp.child.kill("SIGKILL"); resolve(); }, 5000);
      bp.child.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
    processes.delete(botId);
  }

  // Only wipe dependency dirs — user's code and config are safe
  const workDir = path.join(BOT_WORK_DIR, botId);
  const depDirs = ["venv", "node_modules", ".venv", "__pycache__"];
  for (const dir of depDirs) {
    rmSync(path.join(workDir, dir), { recursive: true, force: true });
  }

  await db.update(botsTable).set({ status: "starting" }).where(eq(botsTable.id, botId));
  await addLog(botId, "info", "[System] Reinstalando paquetes (tus archivos no fueron modificados)...");

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const plan = user?.plan || "free";

  spawnBotProcess(bot as any, userId, plan, 0).catch((err) => {
    logger.error({ err, botId }, "spawnBotProcess error on reinstall");
  });
}

/**
 * Rebuild: stop (with wait), wipe local workdir to force fresh dep install, then start.
 * Exported so the bots route can call it directly without duplicating lifecycle logic.
 */
export async function rebuildBot(
  bot: { id: string; language: string; mainFile: string | null; r2Prefix: string; userId: string },
  userId: string
): Promise<void> {
  const botId = bot.id;

  // Wait for existing process to fully exit (same pattern as restartBot)
  const bp = processes.get(botId);
  if (bp) {
    bp.isStopping = true;
    clearBotTimers(botId);
    bp.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { bp.child.kill("SIGKILL"); resolve(); }, 5000);
      bp.child.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
    processes.delete(botId);
  }

  // Wipe local workdir — forces fresh pip/npm install on next start
  const workDir = path.join(BOT_WORK_DIR, botId);
  rmSync(workDir, { recursive: true, force: true });

  await db.update(botsTable).set({ status: "starting" }).where(eq(botsTable.id, botId));
  await addLog(botId, "info", "[System] Rebuild: workdir cleared, reinstalando dependencias...");

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const plan = user?.plan || "free";

  spawnBotProcess(bot as any, userId, plan, 0).catch((err) => {
    logger.error({ err, botId }, "spawnBotProcess error on rebuild");
  });
}

export async function restartBot(
  bot: { id: string; language: string; mainFile: string | null; r2Prefix: string },
  userId: string
): Promise<void> {
  const bp = processes.get(bot.id);
  if (bp) {
    bp.isStopping = true;
    clearBotTimers(bot.id);
    bp.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      bp.child.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
    processes.delete(bot.id);
  }

  await db.update(botsTable).set({ status: "starting" }).where(eq(botsTable.id, bot.id));
  await addLog(bot.id, "info", "[System] Restarting bot...");

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const plan = user?.plan || "free";

  spawnBotProcess(bot as any, userId, plan, 0).catch((err) => {
    logger.error({ err, botId: bot.id }, "spawnBotProcess error on restart");
  });
}

export async function resetStaleProcesses(): Promise<void> {
  await db.update(botsTable)
    .set({ status: "stopped" })
    .where(eq(botsTable.status, "running" as any));
  await db.update(botsTable)
    .set({ status: "stopped" })
    .where(eq(botsTable.status, "starting" as any));
  logger.info("Reset stale bot statuses to stopped");
}
