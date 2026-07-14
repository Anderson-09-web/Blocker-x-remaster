import { Router } from "express";
import { db, usersTable, inviteCodesTable, redeemedCodesTable, deploymentsTable, botsTable, auditLogsTable, notificationsTable, aiUsageTable } from "@workspace/db";
import { eq, count, desc, like, sql, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireAdmin } from "../lib/auth-middleware";

const router = Router();

function formatUser(u: any) {
  return {
    id: u.id, discordId: u.discordId, username: u.username, discriminator: u.discriminator,
    avatar: u.avatar, email: u.email, plan: u.plan, isAdmin: u.isAdmin, isBanned: u.isBanned,
    hasInvite: u.hasInvite, createdAt: u.createdAt.toISOString(), lastLogin: u.lastLogin?.toISOString() || null,
  };
}

router.get("/admin/stats", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const [totalUsersRes] = await db.select({ count: count() }).from(usersTable);
  const premiumUsers = await db.select().from(usersTable).where(or(eq(usersTable.plan, "plus"), eq(usersTable.plan, "blockerx")));
  const bannedUsers = await db.select().from(usersTable).where(eq(usersTable.isBanned, true));
  const [totalBotsRes] = await db.select({ count: count() }).from(botsTable);
  const runningBots = await db.select().from(botsTable).where(eq(botsTable.status, "running"));
  const [totalDeploymentsRes] = await db.select({ count: count() }).from(deploymentsTable);
  const activeInvites = await db.select().from(inviteCodesTable).where(eq(inviteCodesTable.isActive, true));
  const [totalAIRes] = await db.select({ count: count() }).from(aiUsageTable);
  res.json({
    totalUsers: Number(totalUsersRes?.count || 0),
    premiumUsers: premiumUsers.length,
    bannedUsers: bannedUsers.length,
    totalBots: Number(totalBotsRes?.count || 0),
    runningBots: runningBots.length,
    totalDeployments: Number(totalDeploymentsRes?.count || 0),
    activeInviteCodes: activeInvites.length,
    totalAIRequests: Number(totalAIRes?.count || 0),
    onlineUsers: 0,
  });
});

router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const search = req.query.search as string;
  const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 200);
  const offset = parseInt(req.query.offset as string || "0", 10);
  let query = db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);
  const allUsers = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  const filtered = search
    ? allUsers.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || u.discordId.includes(search))
    : allUsers;
  const paginated = filtered.slice(offset, offset + limit);
  res.json({ users: paginated.map(formatUser), total: filtered.length });
});

router.patch("/admin/users/:userId/ban", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, userId));
  await db.insert(auditLogsTable).values({ id: randomUUID(), userId: (req as any).user.id, action: "ban_user", target: userId });
  res.json({ message: "User banned" });
});

router.patch("/admin/users/:userId/unban", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.id, userId));
  await db.insert(auditLogsTable).values({ id: randomUUID(), userId: (req as any).user.id, action: "unban_user", target: userId });
  res.json({ message: "User unbanned" });
});

router.delete("/admin/users/:userId/delete", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await db.insert(auditLogsTable).values({ id: randomUUID(), userId: (req as any).user.id, action: "delete_user", target: userId });
  res.json({ message: "User deleted" });
});

router.patch("/admin/users/:userId/upgrade", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const plan = ["free", "plus", "blockerx"].includes((req.body as any)?.plan) ? (req.body as any).plan : "blockerx";
  await db.update(usersTable).set({ plan }).where(eq(usersTable.id, userId));
  await db.insert(auditLogsTable).values({ id: randomUUID(), userId: (req as any).user.id, action: "upgrade_user", target: userId });
  res.json({ message: `User upgraded to ${plan}` });
});

router.patch("/admin/users/:userId/downgrade", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db.update(usersTable).set({ plan: "free" }).where(eq(usersTable.id, userId));
  res.json({ message: "User downgraded to free" });
});

router.get("/admin/invites", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const search = req.query.search as string;
  const all = await db.select().from(inviteCodesTable).orderBy(desc(inviteCodesTable.createdAt));
  const filtered = search ? all.filter(c => c.code.toLowerCase().includes(search.toLowerCase())) : all;
  res.json(filtered.map(c => ({
    id: c.id, code: c.code, maxUses: c.maxUses, usesCount: c.usesCount,
    expiresAt: c.expiresAt?.toISOString() || null, isActive: c.isActive,
    grantsPremium: c.grantsPremium, grantsPlan: (c as any).grantsPlan ?? null,
    createdBy: c.createdBy, createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/admin/invites", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { maxUses, expiresAt, customCode, grantsPremium, grantsPlan } = req.body;
  const validPlans = ["plus", "blockerx"];
  const resolvedPlan: string | null = validPlans.includes(grantsPlan) ? grantsPlan : null;
  const resolvedGrantsPremium = !!resolvedPlan || !!grantsPremium;
  const code = (customCode?.toString().trim().toUpperCase()) || Math.random().toString(36).substring(2, 10).toUpperCase();
  try {
    const [invite] = await db.insert(inviteCodesTable).values({
      id: randomUUID(), code, maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true, grantsPremium: resolvedGrantsPremium, grantsPlan: resolvedPlan, createdBy: user.id,
    } as any).returning();
    try {
      await db.insert(auditLogsTable).values({ id: randomUUID(), userId: user.id, action: resolvedGrantsPremium ? "create_premium_key" : "create_invite", target: code });
    } catch (_) { /* non-critical */ }
    res.status(201).json({
      id: invite.id, code: invite.code, maxUses: invite.maxUses, usesCount: invite.usesCount,
      expiresAt: invite.expiresAt?.toISOString() || null, isActive: invite.isActive,
      grantsPremium: invite.grantsPremium, grantsPlan: (invite as any).grantsPlan ?? null,
      createdBy: invite.createdBy, createdAt: invite.createdAt.toISOString(),
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create invite code");
    if (err.code === "23505") {
      res.status(409).json({ error: "That code already exists. Try a different one." });
    } else {
      res.status(500).json({ error: "Failed to create code. Check server logs." });
    }
  }
});

router.delete("/admin/invites/:inviteId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const inviteId = Array.isArray(req.params.inviteId) ? req.params.inviteId[0] : req.params.inviteId;
  await db.delete(inviteCodesTable).where(eq(inviteCodesTable.id, inviteId));
  res.json({ message: "Invite code deleted" });
});

router.patch("/admin/invites/:inviteId/toggle", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const inviteId = Array.isArray(req.params.inviteId) ? req.params.inviteId[0] : req.params.inviteId;
  const [current] = await db.select().from(inviteCodesTable).where(eq(inviteCodesTable.id, inviteId));
  if (!current) { res.status(404).json({ error: "Invite not found" }); return; }
  const [updated] = await db.update(inviteCodesTable).set({ isActive: !current.isActive }).where(eq(inviteCodesTable.id, inviteId)).returning();
  res.json({
    id: updated.id, code: updated.code, maxUses: updated.maxUses, usesCount: updated.usesCount,
    expiresAt: updated.expiresAt?.toISOString() || null, isActive: updated.isActive,
    createdBy: updated.createdBy, createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/admin/broadcast", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { title, message, type = "announcement" } = req.body;
  if (!title || !message) { res.status(400).json({ error: "Title and message are required" }); return; }
  const allUsers = await db.select({ id: usersTable.id, discordId: usersTable.discordId }).from(usersTable);
  // Save in-app notifications for everyone
  await Promise.all(allUsers.map(u =>
    db.insert(notificationsTable).values({ id: randomUUID(), userId: u.id, title, message, type, isRead: false })
  ));
  await db.insert(auditLogsTable).values({ id: randomUUID(), userId: user.id, action: "broadcast", details: title });
  // Send Discord DMs in background — don't block the response
  res.json({ message: `Announcement sent to ${allUsers.length} users` });
  // Fire DMs after responding — allSettled so one failure never aborts the rest
  (async () => {
    const { sendDiscordDm } = await import("../lib/notifications");
    const chunks: typeof allUsers[] = [];
    for (let i = 0; i < allUsers.length; i += 5) chunks.push(allUsers.slice(i, i + 5));
    let sent = 0, failed = 0;
    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(u => sendDiscordDm(u.discordId, { title, message, type: type as any }))
      );
      for (const r of results) r.status === "fulfilled" ? sent++ : failed++;
      await new Promise(r => setTimeout(r, 300)); // throttle: 5 DMs per 300ms
    }
    if (failed > 0) console.warn(`[broadcast] DM results: ${sent} sent, ${failed} failed`);
  })().catch(err => console.error("[broadcast] DM loop crashed:", err));
});

router.get("/admin/deployments", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const deployments = await db.select().from(deploymentsTable).orderBy(desc(deploymentsTable.startedAt)).limit(100);
  res.json(deployments.map(d => ({
    id: d.id, botId: d.botId, botName: d.botName, userId: d.userId, status: d.status,
    startedAt: d.startedAt.toISOString(), finishedAt: d.finishedAt?.toISOString() || null, logs: d.logs, errorMessage: d.errorMessage,
  })));
});

router.get("/admin/logs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(req.query.logLimit as string || "100", 10), 500);
  const logs = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  res.json(logs.map(l => ({
    id: l.id, userId: l.userId, action: l.action, target: l.target, details: l.details, ip: l.ip,
    createdAt: l.createdAt.toISOString(),
  })));
});

export default router;
