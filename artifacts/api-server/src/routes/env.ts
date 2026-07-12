import { Router } from "express";
import { db, envVarsTable, botsTable, botSharesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireInvite } from "../lib/auth-middleware";

const router = Router();

router.get("/env/:botId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (bot.userId !== user.id) {
    try {
      const [share] = await db.select({ id: botSharesTable.id }).from(botSharesTable)
        .where(and(eq(botSharesTable.botId, botId), eq(botSharesTable.collaboratorId, user.id)));
      if (!share) { res.status(404).json({ error: "Bot not found" }); return; }
    } catch { res.status(404).json({ error: "Bot not found" }); return; }
  }
  const vars = await db.select().from(envVarsTable).where(eq(envVarsTable.botId, botId));
  res.json(vars.map(v => ({ id: v.id, botId: v.botId, key: v.key, value: v.value, createdAt: v.createdAt.toISOString() })));
});

router.post("/env/:botId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  const { key, value } = req.body;
  if (!key) { res.status(400).json({ error: "Key is required" }); return; }
  const existing = await db.select().from(envVarsTable).where(and(eq(envVarsTable.botId, botId), eq(envVarsTable.key, key)));
  let envVar;
  if (existing.length > 0) {
    const [updated] = await db.update(envVarsTable).set({ value }).where(eq(envVarsTable.id, existing[0].id)).returning();
    envVar = updated;
  } else {
    const [created] = await db.insert(envVarsTable).values({ id: randomUUID(), botId, key, value }).returning();
    envVar = created;
  }
  res.json({ id: envVar.id, botId: envVar.botId, key: envVar.key, value: envVar.value, createdAt: envVar.createdAt.toISOString() });
});

router.delete("/env/:botId/:varId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const varId = Array.isArray(req.params.varId) ? req.params.varId[0] : req.params.varId;
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  await db.delete(envVarsTable).where(and(eq(envVarsTable.id, varId), eq(envVarsTable.botId, botId)));
  res.json({ message: "Variable deleted" });
});

export default router;
