import { Router } from "express";
import { db, botsTable, deploymentsTable, botLogsTable, envVarsTable, botSharesTable, usersTable } from "@workspace/db";
import { eq, and, desc, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireInvite } from "../lib/auth-middleware";
import { createNotification, notifyUser } from "../lib/notifications";
import { startBot, stopBot, restartBot, reinstallBot, getProcessStatus, forcePresenceCheck } from "../lib/process-manager";
import { presenceStore } from "./bot-internal";
import { r2WriteFile, r2DeletePrefix } from "../lib/r2";
import { PYTHON_MAIN, PYTHON_REQUIREMENTS, JS_MAIN, JS_PACKAGE_JSON } from "../lib/templates";

const router = Router();

function formatBot(bot: any) {
  return {
    id: bot.id,
    name: bot.name,
    description: bot.description,
    language: bot.language,
    status: bot.status,
    userId: bot.userId,
    mainFile: bot.mainFile,
    r2Prefix: bot.r2Prefix,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
  };
}

function getBotId(req: any): string {
  return Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
}

// GET /bots/:botId/check-intents — reads stored token from DB, calls Discord, returns actual intent flags
router.get("/bots/:botId/check-intents", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const botId = getBotId(req);
  const bot = await requireBotAccess(req, res, botId);
  if (!bot) return;

  // Find the Discord token from the bot's stored env vars
  let tokenValue: string | undefined;
  try {
    const vars = await db.select().from(envVarsTable).where(eq(envVarsTable.botId, botId));
    const row = vars.find(v => ["DISCORD_TOKEN", "BOT_TOKEN", "TOKEN"].includes(v.key.toUpperCase()));
    tokenValue = row?.value?.trim();
  } catch (err) {
    req.log.warn({ err }, "Failed to read env vars for intent check");
  }

  if (!tokenValue) {
    res.json({ ok: false, error: "No se encontró DISCORD_TOKEN en las variables de entorno del bot." });
    return;
  }

  try {
    const response = await fetch("https://discord.com/api/v10/applications/@me", {
      headers: { Authorization: `Bot ${tokenValue}` },
    });
    if (!response.ok) {
      res.json({ ok: false, error: "Token inválido o sin permisos de acceso." });
      return;
    }
    const data = await response.json() as { id: string; name: string; flags: number; icon: string | null };
    const flags = data.flags || 0;
    // Privileged intent flag bits (limited = <100 guilds approved, full = verified/approved for all)
    const HAS_PRESENCE        = (flags & (4096 | 8192)) !== 0;
    const HAS_SERVER_MEMBERS  = (flags & (16384 | 32768)) !== 0;
    const HAS_MESSAGE_CONTENT = (flags & (262144 | 524288)) !== 0;
    res.json({
      ok: true,
      botName: data.name,
      botId: data.id,
      avatar: data.icon ? `https://cdn.discordapp.com/app-icons/${data.id}/${data.icon}.png` : null,
      intents: {
        presence: HAS_PRESENCE,
        serverMembers: HAS_SERVER_MEMBERS,
        messageContent: HAS_MESSAGE_CONTENT,
      },
    });
  } catch (err) {
    req.log.warn({ err }, "Failed to check Discord intents");
    res.status(500).json({ ok: false, error: "No se pudo conectar con Discord." });
  }
});

router.post("/bots/verify-token", requireAuth, async (req, res): Promise<void> => {
  const { token } = req.body;
  if (!token) { res.status(400).json({ error: "Token is required" }); return; }
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token.trim()}` },
    });
    if (!response.ok) {
      res.status(400).json({ error: "Token inválido" });
      return;
    }
    const data = await response.json() as { id: string; username: string; avatar: string | null };
    res.json({
      id: data.id,
      username: data.username,
      avatar: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : null,
    });
  } catch (err) {
    req.log.warn({ err }, "Failed to verify Discord token");
    res.status(500).json({ error: "No se pudo verificar el token" });
  }
});

router.get("/bots", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const ownedBots = await db.select().from(botsTable)
    .where(eq(botsTable.userId, user.id))
    .orderBy(desc(botsTable.createdAt));

  // Also include bots shared with this user (table may not exist yet in older deployments)
  let sharedBots: typeof ownedBots = [];
  try {
    const sharedEntries = await db.select({ botId: botSharesTable.botId })
      .from(botSharesTable)
      .where(eq(botSharesTable.collaboratorId, user.id));
    const sharedBotIds = sharedEntries.map(s => s.botId);
    if (sharedBotIds.length > 0) {
      sharedBots = await db.select().from(botsTable)
        .where(or(
          ...sharedBotIds.map(id => eq(botsTable.id, id))
        ));
    }
  } catch (err) {
    req.log.warn({ err }, "bot_shares query failed — table may not exist yet");
  }

  const all = [...ownedBots, ...sharedBots.filter(sb => !ownedBots.find(ob => ob.id === sb.id))];
  const result = all.map((bot) => ({
    ...formatBot(bot),
    status: getProcessStatus(bot.id) === "running" ? "running" : bot.status,
    isShared: !ownedBots.find(ob => ob.id === bot.id),
  }));
  res.json(result);
});

router.post("/bots", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { name, description, language, token, clientId, clientSecret } = req.body;

  if (!name || !language) {
    res.status(400).json({ error: "Name and language are required" });
    return;
  }
  if (!["python", "javascript"].includes(language)) {
    res.status(400).json({ error: "Language must be python or javascript" });
    return;
  }
  if (!token) {
    res.status(400).json({ error: "Bot token is required" });
    return;
  }
  if (!clientId) {
    res.status(400).json({ error: "Client ID is required" });
    return;
  }
  if (!clientSecret) {
    res.status(400).json({ error: "Client Secret is required" });
    return;
  }

  // Enforce bot limits per plan
  const botLimit = user.plan === "blockerx" ? null : user.plan === "plus" ? 5 : 2;
  if (botLimit !== null) {
    const existing = await db.select().from(botsTable).where(eq(botsTable.userId, user.id));
    if (existing.length >= botLimit) {
      const planName = user.plan === "plus" ? "Plus" : "Free";
      res.status(403).json({ error: `Has alcanzado el límite de ${botLimit} bots del plan ${planName}. Actualiza tu plan para crear más.` });
      return;
    }
  }

  const botId = randomUUID();
  const r2Prefix = `users/${user.discordId}/bots/${botId}`;
  const mainFile = language === "python" ? "main.py" : "index.js";

  const [bot] = await db.insert(botsTable).values({
    id: botId,
    name,
    description: description || null,
    language,
    status: "stopped",
    userId: user.id,
    mainFile,
    r2Prefix,
  }).returning();

  try {
    if (language === "python") {
      await r2WriteFile(`${r2Prefix}/main.py`, PYTHON_MAIN, "text/x-python");
      await r2WriteFile(`${r2Prefix}/requirements.txt`, PYTHON_REQUIREMENTS, "text/plain");
    } else {
      await r2WriteFile(`${r2Prefix}/index.js`, JS_MAIN, "application/javascript");
      await r2WriteFile(`${r2Prefix}/package.json`, JS_PACKAGE_JSON, "application/json");
    }
  } catch (err) {
    req.log.warn({ err, botId }, "Failed to upload default templates to R2");
  }

  const envEntries = [
    { key: "DISCORD_TOKEN", value: token },
    { key: "DISCORD_CLIENT_ID", value: clientId },
    { key: "DISCORD_CLIENT_SECRET", value: clientSecret },
  ];

  for (const entry of envEntries) {
    try {
      await db.insert(envVarsTable).values({ id: randomUUID(), botId, key: entry.key, value: entry.value });
    } catch (err) {
      req.log.warn({ err }, `Failed to save env var ${entry.key}`);
    }
  }

  await createNotification({
    userId: user.id,
    title: "Bot Created",
    message: `Your bot "${name}" has been created successfully.`,
    type: "success",
  });

  req.log.info({ botId, userId: user.id, language }, "Bot created");
  res.status(201).json(formatBot(bot));
});

router.get("/bots/:botId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

  const isOwner = bot.userId === user.id;
  if (!isOwner) {
    // Allow if user is a collaborator
    try {
      const [share] = await db.select({ id: botSharesTable.id })
        .from(botSharesTable)
        .where(and(eq(botSharesTable.botId, botId), eq(botSharesTable.collaboratorId, user.id)));
      if (!share) { res.status(404).json({ error: "Bot not found" }); return; }
    } catch {
      res.status(404).json({ error: "Bot not found" }); return;
    }
  }

  res.json({ ...formatBot(bot), status: getProcessStatus(botId) === "running" ? "running" : bot.status, isOwner });
});

router.patch("/bots/:botId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const { name, description, mainFile } = req.body;
  const [bot] = await db.update(botsTable).set({
    ...(name && { name }),
    ...(description !== undefined && { description }),
    ...(mainFile && { mainFile }),
  }).where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id))).returning();
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  res.json(formatBot(bot));
});

router.delete("/bots/:botId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const [bot] = await db.select().from(botsTable)
    .where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

  try { await stopBot(botId); } catch (_) {}

  try { await r2DeletePrefix(bot.r2Prefix); } catch (err) {
    req.log.warn({ err }, "Failed to delete R2 files");
  }

  await db.delete(botsTable).where(eq(botsTable.id, botId));
  req.log.info({ botId }, "Bot deleted");
  res.json({ message: "Bot deleted successfully" });
});

/** Allow owner OR collaborator to control a bot. Returns the bot or sends 404. */
async function requireBotAccess(req: any, res: any, botId: string): Promise<typeof botsTable.$inferSelect | null> {
  const user = req.user;
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return null; }
  if (bot.userId === user.id) return bot;
  try {
    const [share] = await db.select({ id: botSharesTable.id }).from(botSharesTable)
      .where(and(eq(botSharesTable.botId, botId), eq(botSharesTable.collaboratorId, user.id)));
    if (share) return bot;
  } catch { /* bot_shares may not exist in older deployments */ }
  res.status(404).json({ error: "Bot not found" }); return null;
}

router.post("/bots/:botId/start", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const bot = await requireBotAccess(req, res, botId);
  if (!bot) return;

  try {
    await startBot({ ...bot, userId: bot.userId });
    await createNotification({
      userId: user.id,
      title: "Bot Starting",
      message: `"${bot.name}" is starting up. You'll get a DM when it's fully online.`,
      type: "info",
    });
    req.log.info({ botId }, "Bot start requested");
    res.json({ message: "Bot is starting" });
  } catch (err: any) {
    res.status(409).json({ error: err.message || "Failed to start bot" });
  }
});

router.post("/bots/:botId/stop", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const bot = await requireBotAccess(req, res, botId);
  if (!bot) return;

  await stopBot(botId);
  // In-app notification only — no DM for manual stop (user initiated it themselves)
  await createNotification({
    userId: user.id,
    title: `${bot.name} detenido`,
    message: `El bot fue detenido manualmente.`,
    type: "info",
  });
  res.json({ message: "Bot stopped" });
});

router.post("/bots/:botId/restart", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const bot = await requireBotAccess(req, res, botId);
  if (!bot) return;

  await restartBot({ ...bot, userId: bot.userId } as any, bot.userId);
  // In-app notification only — the "online" DM fires automatically when the bot reconnects
  await createNotification({
    userId: user.id,
    title: `${bot.name} reiniciando`,
    message: `El bot se está reiniciando. Recibirás una notificación cuando esté en línea.`,
    type: "info",
  });
  res.json({ message: "Bot restarting" });
});

// POST /bots/:botId/presence — apply new presence to running bot without restart (~10s)
router.post("/bots/:botId/presence", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const botId = getBotId(req);
  const bot = await requireBotAccess(req, res, botId);
  if (!bot) return;

  const { status = "online", activityType = "none", activityText = "" } = req.body;
  const presenceData = { status, activityType, activityText, updatedAt: Date.now() };
  presenceStore.set(botId, presenceData);

  // Respond immediately — the bot picks this up from the in-memory store on its
  // next poll (~3s), so the request shouldn't wait on R2. R2 persistence below is
  // best-effort backup only (used if the API server restarts before the bot re-polls).
  res.json({ ok: true });

  const r2Prefix = bot.r2Prefix as string | undefined;
  if (r2Prefix) {
    import("../lib/r2")
      .then(({ r2WriteFile }) => r2WriteFile(`${r2Prefix}/_bx_presence.json`, JSON.stringify(presenceData)))
      .catch(() => {
        // Non-fatal — in-memory store is still set, bot already has the update
      });
  }
});

// POST /bots/:botId/presence/apply-now — force the bot to re-check presence immediately
// instead of waiting for its own ~3s poll cycle. Bounded response so the UI never hangs.
router.post("/bots/:botId/presence/apply-now", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const botId = getBotId(req);
  const bot = await requireBotAccess(req, res, botId);
  if (!bot) return;

  if (getProcessStatus(botId) !== "running") {
    res.status(409).json({ ok: false, message: "El bot no está en línea." });
    return;
  }

  const sent = forcePresenceCheck(botId);
  res.json({ ok: sent });
});

router.post("/bots/:botId/reinstall", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const bot = await requireBotAccess(req, res, botId);
  if (!bot) return;

  // Reinstall: stop, wipe only venv/node_modules (not user files), then restart
  await reinstallBot({ ...bot, userId: bot.userId } as any, bot.userId).catch((err: any) => {
    req.log.error({ err, botId }, "Reinstall failed");
  });

  await createNotification({
    userId: user.id,
    title: `${bot.name} — reinstalando paquetes`,
    message: `Los paquetes se están reinstalando. Tus archivos no fueron modificados.`,
    type: "info",
  });

  res.json({ message: "Reinstall started" });
});

// Share routes
router.get("/bots/:botId/shares", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  const sharesList = await db.select({
    id: botSharesTable.id,
    botId: botSharesTable.botId,
    collaboratorId: botSharesTable.collaboratorId,
    canEditFiles: botSharesTable.canEditFiles,
    canViewLogs: botSharesTable.canViewLogs,
    createdAt: botSharesTable.createdAt,
    collaboratorUsername: usersTable.username,
    collaboratorDiscordId: usersTable.discordId,
  }).from(botSharesTable)
    .leftJoin(usersTable, eq(botSharesTable.collaboratorId, usersTable.id))
    .where(eq(botSharesTable.botId, botId));
  res.json(sharesList.map(s => ({ ...s, createdAt: s.createdAt?.toISOString() })));
});

router.post("/bots/:botId/share", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  const { discordId } = req.body;
  if (!discordId) { res.status(400).json({ error: "discordId is required" }); return; }
  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.discordId, discordId));
  if (!targetUser) { res.status(404).json({ error: "User not found. They must have logged in at least once." }); return; }
  if (targetUser.id === user.id) { res.status(400).json({ error: "You cannot share with yourself." }); return; }
  const [existing] = await db.select().from(botSharesTable)
    .where(and(eq(botSharesTable.botId, botId), eq(botSharesTable.collaboratorId, targetUser.id)));
  if (existing) { res.status(409).json({ error: "This user already has access." }); return; }
  const [share] = await db.insert(botSharesTable).values({
    id: randomUUID(), botId, ownerId: user.id, collaboratorId: targetUser.id,
    canEditFiles: true, canViewLogs: true,
  }).returning();
  res.status(201).json({
    id: share.id, botId: share.botId, collaboratorId: share.collaboratorId,
    collaboratorUsername: targetUser.username, collaboratorDiscordId: targetUser.discordId,
    canEditFiles: share.canEditFiles, canViewLogs: share.canViewLogs,
    createdAt: share.createdAt.toISOString(),
  });
});

router.delete("/bots/:botId/shares/:shareId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const shareId = Array.isArray(req.params.shareId) ? req.params.shareId[0] : req.params.shareId;
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  await db.delete(botSharesTable).where(and(eq(botSharesTable.id, shareId), eq(botSharesTable.botId, botId)));
  res.json({ message: "Access removed" });
});

router.get("/bots/:botId/status", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = getBotId(req);
  const [bot] = await db.select().from(botsTable)
    .where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  const liveStatus = getProcessStatus(botId);
  res.json({
    botId,
    status: liveStatus === "running" ? "running" : bot.status,
    uptime: null,
    memoryMB: null,
    lastStarted: null,
    lastStopped: null,
  });
});

export default router;
