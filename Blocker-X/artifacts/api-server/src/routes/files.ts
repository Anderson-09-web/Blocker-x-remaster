import { Router } from "express";
import { db, botsTable, botSharesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { rmSync } from "fs";
import path from "path";
import { deflateRawSync } from "zlib";
import { requireAuth, requireInvite } from "../lib/auth-middleware";
import { r2ListFiles, r2ListAllFiles, r2ReadFile, r2ReadFileBuffer, r2WriteFile, r2WriteBuffer, r2DeleteFile, r2RenameFile, r2DeletePrefix } from "../lib/r2";

// ---------------------------------------------------------------------------
// Minimal ZIP builder (no external deps — uses Node built-in zlib)
// ---------------------------------------------------------------------------
function _makeCrc32Table(): number[] {
  const t: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : c >>> 1;
    t[i] = c;
  }
  return t;
}
const _CRC_TABLE = _makeCrc32Table();
function _crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ _CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
/** Sanitize a ZIP entry name to prevent Zip Slip attacks. */
function sanitizeZipName(name: string): string {
  // Normalize to POSIX, strip leading slashes, reject or collapse ".." segments
  return name
    .replace(/\\/g, "/")       // backslash → forward slash
    .replace(/^\/+/, "")       // strip leading slashes
    .split("/")
    .filter(seg => seg !== "" && seg !== "..")
    .join("/");
}

function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const d = new Date();
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const file of files) {
    const name = Buffer.from(file.name, "utf-8");
    const comp = deflateRawSync(file.data, { level: 6 });
    const crc = _crc32(file.data);
    // Local file header
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28); name.copy(local, 30);
    // Central directory header
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(file.data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    parts.push(local, comp); centrals.push(central);
    offset += local.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, eocd]);
}

const BOT_WORK_DIR = "/tmp/blockerx-bots";

const router = Router();

/**
 * Resolves the R2 prefix for a bot if the requesting user is the owner OR
 * an invited collaborator. Returns null if the user has no access.
 */
async function getBotR2Prefix(botId: string, userId: string): Promise<string | null> {
  // Try owner first (most common path)
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) return null;
  if (bot.userId === userId) return bot.r2Prefix;

  // Not owner — check collaborator table
  try {
    const [share] = await db.select({ id: botSharesTable.id })
      .from(botSharesTable)
      .where(and(eq(botSharesTable.botId, botId), eq(botSharesTable.collaboratorId, userId)));
    if (share) return bot.r2Prefix;
  } catch {
    // bot_shares table may not exist in older deployments
  }

  return null;
}

router.get("/files/:botId/list", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const dirPath = (req.query.dirPath as string) || "/";
  const recursive = req.query.recursive === "true";
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  try {
    const fullPrefix = dirPath === "/" ? prefix : `${prefix}/${dirPath.replace(/^\//, "")}`;
    if (recursive) {
      const files = await r2ListAllFiles(fullPrefix);
      res.json(files);
    } else {
      const files = await r2ListFiles(fullPrefix);
      res.json(files);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to list files");
    res.json([]);
  }
});

router.post("/files/:botId/upload", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const { path: filePath, name, content, encoding } = req.body;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  try {
    const key = `${prefix}/${(filePath || "").replace(/^\//, "")}${name ? `/${name}` : ""}`.replace(/\/\//g, "/");
    if (encoding === "base64") {
      // Always write base64-decoded content as raw bytes to avoid UTF-8 corruption
      const buf = Buffer.from(content, "base64");
      const isText = /\.(txt|py|js|ts|json|yaml|yml|toml|ini|cfg|md|env|sh|bat|css|html|xml|csv|log|gitignore|gitkeep)$/i.test(name || "");
      if (isText) {
        await r2WriteFile(key, buf.toString("utf-8"));
      } else {
        const contentType = (name || "").endsWith(".zip") ? "application/zip" : "application/octet-stream";
        await r2WriteBuffer(key, buf, contentType);
      }
    } else {
      await r2WriteFile(key, content);
    }
    res.json({ name: name || filePath.split("/").pop(), path: key, type: "file" as const });
  } catch (err) {
    req.log.error({ err }, "Upload failed");
    res.status(500).json({ error: "Upload failed" });
  }
});

// GET /files/:botId/download?path=... — download a single file from R2
router.get("/files/:botId/download", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  // Security: path must be under this bot's R2 prefix
  if (!filePath.startsWith(prefix + "/") && filePath !== prefix) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  try {
    const buf = await r2ReadFileBuffer(filePath);
    const fileName = filePath.split("/").pop() || "file";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const MIME: Record<string, string> = {
      zip: "application/zip", json: "application/json", py: "text/x-python",
      js: "text/javascript", ts: "text/typescript", md: "text/markdown",
      txt: "text/plain", html: "text/html", css: "text/css", yaml: "text/yaml", yml: "text/yaml",
    };
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", buf.length);
    res.end(buf);
  } catch (err) {
    req.log.error({ err }, "Download failed");
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});

// GET /files/:botId/export — download all bot files as a ZIP archive
router.get("/files/:botId/export", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  try {
    const allFiles = await r2ListAllFiles(prefix, 500);
    if (allFiles.length === 0) {
      res.status(404).json({ error: "No hay archivos para exportar" }); return;
    }
    const fileBuffers = await Promise.all(
      allFiles
        .map(async (f) => ({ name: sanitizeZipName(f.name), data: await r2ReadFileBuffer(f.path) }))
    );
    const zipBuf = buildZip(fileBuffers);
    // Try to get bot name from DB for a nicer filename
    const [bot] = await db.select({ name: botsTable.name }).from(botsTable).where(eq(botsTable.id, botId)).catch(() => []);
    const safeName = ((bot as any)?.name || botId).replace(/[^a-z0-9_-]/gi, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-project.zip"`);
    res.setHeader("Content-Length", zipBuf.length);
    res.end(zipBuf);
  } catch (err) {
    req.log.error({ err }, "Export failed");
    res.status(500).json({ error: "Export failed" });
  }
});

router.delete("/files/:botId/delete", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const { path: filePath } = req.body;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!filePath?.startsWith(prefix)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await r2DeleteFile(filePath);

    // Also remove the file from the bot's running temp directory so the bot
    // doesn't recreate it in R2 on next restart via syncWorkdirToR2.
    try {
      const normalizedPrefix = prefix.endsWith("/") ? prefix : prefix + "/";
      // Boundary-safe: filePath must start with prefix + "/" (not just prefix)
      if (filePath.startsWith(normalizedPrefix)) {
        const relPath = filePath.slice(normalizedPrefix.length);
        // Resolve to an absolute path and verify it stays inside the bot's temp dir
        const botTempDir = path.resolve(BOT_WORK_DIR, botId);
        const candidate = path.resolve(botTempDir, relPath);
        if (candidate.startsWith(botTempDir + path.sep) || candidate === botTempDir) {
          rmSync(candidate, { force: true });
        }
      }
    } catch { /* ignore — temp dir may not exist if bot is stopped */ }

    res.json({ message: "File deleted" });
  } catch (err) {
    req.log.error({ err }, "Delete failed");
    res.status(500).json({ error: "Delete failed" });
  }
});

router.patch("/files/:botId/rename", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const { oldPath, newPath } = req.body;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!oldPath?.startsWith(prefix) || !newPath?.startsWith(prefix)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await r2RenameFile(oldPath, newPath);
    res.json({ message: "File renamed" });
  } catch (err) {
    req.log.error({ err }, "Rename failed");
    res.status(500).json({ error: "File renamed" });
  }
});

router.get("/files/:botId/read", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const filePath = req.query.filePath as string;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!filePath?.startsWith(prefix)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const content = await r2ReadFile(filePath);
    res.json({ path: filePath, content, encoding: "utf-8" });
  } catch (err) {
    req.log.error({ err }, "Read failed");
    res.status(500).json({ error: "File read failed" });
  }
});

router.put("/files/:botId/write", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const { path: filePath, content } = req.body;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!filePath?.startsWith(prefix)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await r2WriteFile(filePath, content);
    res.json({ message: "File saved" });
  } catch (err) {
    req.log.error({ err }, "Write failed");
    res.status(500).json({ error: "File write failed" });
  }
});

router.delete("/files/:botId/rmdir", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const { path: dirPath } = req.body;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!dirPath?.startsWith(prefix)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await r2DeletePrefix(dirPath);
    res.json({ message: "Folder deleted" });
  } catch (err) {
    req.log.error({ err }, "Rmdir failed");
    res.status(500).json({ error: "Folder deletion failed" });
  }
});

router.post("/files/:botId/mkdir", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const { path: dirPath } = req.body;
  const prefix = await getBotR2Prefix(botId, user.id);
  if (!prefix) { res.status(404).json({ error: "Bot not found" }); return; }
  try {
    const key = `${prefix}/${dirPath.replace(/^\//, "")}/.gitkeep`;
    await r2WriteFile(key, "");
    res.json({ message: "Folder created" });
  } catch (err) {
    req.log.error({ err }, "Mkdir failed");
    res.status(500).json({ error: "Folder creation failed" });
  }
});

export default router;
