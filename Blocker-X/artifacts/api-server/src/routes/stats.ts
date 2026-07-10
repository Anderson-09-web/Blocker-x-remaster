import { Router } from "express";
import { db, botsTable, deploymentsTable, botLogsTable, aiUsageTable } from "@workspace/db";
import { eq, count, desc, sql } from "drizzle-orm";
import { requireAuth, requireInvite } from "../lib/auth-middleware";
import { r2GetPrefixSize } from "../lib/r2";

const router = Router();

router.get("/stats/dashboard", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const [totalBotsRes] = await db.select({ count: count() }).from(botsTable).where(eq(botsTable.userId, user.id));
  const runningBots = await db.select().from(botsTable)
    .where(sql`${botsTable.userId} = ${user.id} AND ${botsTable.status} = 'running'`);
  const [totalDeploymentsRes] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));
  const [aiCountRes] = await db.select({ count: count() }).from(aiUsageTable).where(eq(aiUsageTable.userId, user.id));

  const recentDeployments = await db.select().from(deploymentsTable)
    .where(eq(deploymentsTable.userId, user.id))
    .orderBy(desc(deploymentsTable.startedAt)).limit(5);
  const recentLogs = await db.select().from(botLogsTable)
    .orderBy(desc(botLogsTable.timestamp)).limit(10);

  let storageUsedBytes = 0;
  try {
    const r2 = await r2GetPrefixSize(`users/${user.discordId}/`);
    storageUsedBytes = r2.size;
  } catch {}

  res.json({
    totalBots: Number(totalBotsRes?.count || 0),
    runningBots: runningBots.length,
    totalDeployments: Number(totalDeploymentsRes?.count || 0),
    storageUsedBytes,
    aiUsageCount: Number(aiCountRes?.count || 0),
    recentDeployments: recentDeployments.map(d => ({
      id: d.id, botId: d.botId, botName: d.botName, userId: d.userId, status: d.status,
      startedAt: d.startedAt.toISOString(), finishedAt: d.finishedAt?.toISOString() || null, logs: d.logs, errorMessage: d.errorMessage,
    })),
    recentLogs: recentLogs.map(l => ({ id: l.id, botId: l.botId, level: l.level, message: l.message, timestamp: l.timestamp.toISOString() })),
  });
});

router.get("/stats/storage", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const bots = await db.select().from(botsTable).where(eq(botsTable.userId, user.id));
  const storageLimit = user.plan === "blockerx" ? 5 * 1024 * 1024 * 1024 : user.plan === "plus" ? 2 * 1024 * 1024 * 1024 : 512 * 1024 * 1024;

  let totalUsed = 0;
  const botStorage = await Promise.all(bots.map(async (bot) => {
    let usedBytes = 0;
    try { const s = await r2GetPrefixSize(bot.r2Prefix); usedBytes = s.size; } catch {}
    totalUsed += usedBytes;
    return { botId: bot.id, botName: bot.name, usedBytes };
  }));

  let fileCount = 0;
  try { const s = await r2GetPrefixSize(`users/${user.discordId}/`); fileCount = s.count; } catch {}

  res.json({ usedBytes: totalUsed, limitBytes: storageLimit, fileCount, bots: botStorage });
});

export default router;
