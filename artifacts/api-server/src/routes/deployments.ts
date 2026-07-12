import { Router } from "express";
import { db, deploymentsTable, botsTable, botLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireInvite } from "../lib/auth-middleware";
import { notifyUser } from "../lib/notifications";
import { fireWebhooks } from "../lib/webhooks";
import { startBot, stopBot } from "../lib/process-manager";

const router = Router();

function formatDeployment(d: any) {
  return {
    id: d.id,
    botId: d.botId,
    botName: d.botName,
    userId: d.userId,
    status: d.status,
    startedAt: d.startedAt.toISOString(),
    finishedAt: d.finishedAt?.toISOString() || null,
    logs: d.logs,
    errorMessage: d.errorMessage,
  };
}

router.get("/deployments", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const deployments = await db.select().from(deploymentsTable)
    .where(eq(deploymentsTable.userId, user.id))
    .orderBy(desc(deploymentsTable.startedAt))
    .limit(50);
  res.json(deployments.map(formatDeployment));
});

router.post("/bots/:botId/deploy", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const botId = Array.isArray(req.params.botId) ? req.params.botId[0] : req.params.botId;
  const [bot] = await db.select().from(botsTable)
    .where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

  const deployId = randomUUID();
  const [deployment] = await db.insert(deploymentsTable).values({
    id: deployId,
    botId,
    botName: bot.name,
    userId: user.id,
    status: "running",
  }).returning();

  await db.update(botsTable).set({ status: "deploying" }).where(eq(botsTable.id, botId));

  setImmediate(async () => {
    try {
      try { await stopBot(botId); } catch (_) {}

      const logLines: string[] = [];
      logLines.push(`[Deploy] Starting deployment for "${bot.name}"`);
      logLines.push(`[Deploy] Language: ${bot.language === "python" ? "Python (discord.py)" : "JavaScript (discord.js)"}`);
      logLines.push(`[Deploy] R2 prefix: ${bot.r2Prefix}`);
      logLines.push(`[Deploy] Launching bot process...`);

      await startBot({ ...bot, userId: user.id });

      logLines.push(`[Deploy] Bot process started successfully.`);
      logLines.push(`[Deploy] Deployment complete.`);
      fireWebhooks(user.id, botId, "bot_deployed", { deploymentId: deployId }).catch(() => {});

      await db.update(deploymentsTable).set({
        status: "success",
        finishedAt: new Date(),
        logs: logLines.join("\n"),
      }).where(eq(deploymentsTable.id, deployId));

      await notifyUser({
        userId: user.id,
        discordId: user.discordId,
        title: "Deployment Successful",
        message: `"${bot.name}" deployed and is now running.`,
        type: "success",
      });
    } catch (err: any) {
      await db.update(deploymentsTable).set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: err.message || "Deployment failed",
        logs: `[Deploy] Error: ${err.message}`,
      }).where(eq(deploymentsTable.id, deployId));

      await db.update(botsTable).set({ status: "errored" }).where(eq(botsTable.id, botId));

      await notifyUser({
        userId: user.id,
        discordId: user.discordId,
        title: "Deployment Failed",
        message: `"${bot.name}" deployment failed: ${err.message}`,
        type: "error",
      });
    }
  });

  req.log.info({ deployId, botId }, "Deployment started");
  res.json(formatDeployment(deployment));
});

router.get("/deployments/:deploymentId", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const deploymentId = Array.isArray(req.params.deploymentId)
    ? req.params.deploymentId[0]
    : req.params.deploymentId;
  const [deployment] = await db.select().from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, deploymentId), eq(deploymentsTable.userId, user.id)));
  if (!deployment) { res.status(404).json({ error: "Deployment not found" }); return; }
  res.json(formatDeployment(deployment));
});

export default router;
