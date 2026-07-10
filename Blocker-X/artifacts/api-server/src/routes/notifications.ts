import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireInvite } from "../lib/auth-middleware";

const router = Router();

function formatNotif(n: any) {
  return { id: n.id, userId: n.userId, title: n.title, message: n.message, type: n.type, isRead: n.isRead, createdAt: n.createdAt.toISOString() };
}

router.get("/notifications", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const notifs = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, user.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(notifs.map(formatNotif));
});

router.patch("/notifications/:notificationId/read", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const notificationId = Array.isArray(req.params.notificationId) ? req.params.notificationId[0] : req.params.notificationId;
  await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, user.id)));
  res.json({ message: "Marked as read" });
});

router.patch("/notifications/read-all", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, user.id));
  res.json({ message: "All notifications marked as read" });
});

export default router;
