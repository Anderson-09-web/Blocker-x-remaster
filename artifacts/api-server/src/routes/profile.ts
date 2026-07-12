import { Router } from "express";
import { db, usersTable, botsTable, deploymentsTable, aiUsageTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAuth, requireInvite } from "../lib/auth-middleware";
import { r2GetPrefixSize } from "../lib/r2";

const router = Router();

router.get("/profile", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;

  const [botCountResult] = await db.select({ count: count() }).from(botsTable).where(eq(botsTable.userId, user.id));
  const [deployCountResult] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));
  const [aiCountResult] = await db.select({ count: count() }).from(aiUsageTable).where(eq(aiUsageTable.userId, user.id));

  let storageUsedBytes = 0;
  try {
    const r2Stats = await r2GetPrefixSize(`users/${user.discordId}/`);
    storageUsedBytes = r2Stats.size;
  } catch {}

  const aiUsageCount = Number(aiCountResult?.count || 0);
  const aiUsageLimit = user.plan === "blockerx" ? null : user.plan === "plus" ? 50 : 10;

  res.json({
    user: {
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      email: user.email,
      plan: user.plan,
      isAdmin: user.isAdmin,
      isBanned: user.isBanned,
      hasInvite: user.hasInvite,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin?.toISOString() || null,
    },
    botCount: Number(botCountResult?.count || 0),
    storageUsedBytes,
    aiUsageCount,
    aiUsageLimit,
    deploymentCount: Number(deployCountResult?.count || 0),
  });
});

router.patch("/profile", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  res.json({
    user: {
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      email: user.email,
      plan: user.plan,
      isAdmin: user.isAdmin,
      isBanned: user.isBanned,
      hasInvite: user.hasInvite,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin?.toISOString() || null,
    },
    botCount: 0,
    storageUsedBytes: 0,
    aiUsageCount: 0,
    deploymentCount: 0,
  });
});

export default router;
