import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const OWNER_DISCORD_ID = "1237892993013387307";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const isOwner = user.discordId === OWNER_DISCORD_ID;
  if (user.isBanned && !isOwner) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }
  if (isOwner && (!user.isAdmin || user.isBanned)) {
    await db.update(usersTable).set({ isAdmin: true, isBanned: false, hasInvite: true }).where(eq(usersTable.id, user.id));
    user.isAdmin = true;
    user.isBanned = false;
    user.hasInvite = true;
  }
  (req as any).user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (req as any).user;
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export async function requireInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (req as any).user;
  if (!user?.hasInvite && !user?.isAdmin) {
    res.status(403).json({ error: "Invitation required" });
    return;
  }
  next();
}
