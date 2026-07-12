import { Router } from "express";
import { db, botLogsTable, botsTable, botSharesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireInvite } from "../lib/auth-middleware";

const router = Router();

router.get("/logs/:botId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const limit = Math.min(parseInt(req.query.logLimit as string || "100", 10), 500);
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (bot.userId !== user.id) {
    try {
      const [share] = await db.select({ id: botSharesTable.id }).from(botSharesTable)
        .where(and(eq(botSharesTable.botId, botId), eq(botSharesTable.collaboratorId, user.id)));
      if (!share) { res.status(404).json({ error: "Bot not found" }); return; }
    } catch { res.status(404).json({ error: "Bot not found" }); return; }
  }
  const logs = await db.select().from(botLogsTable)
    .where(eq(botLogsTable.botId, botId))
    .orderBy(desc(botLogsTable.timestamp))
    .limit(limit);
  res.json(logs.map(l => ({
    id: l.id,
    botId: l.botId,
    level: l.level,
    message: l.message,
    timestamp: l.timestamp.toISOString(),
  })).reverse());
});

export default router;
