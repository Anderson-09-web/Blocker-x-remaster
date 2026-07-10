import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { OWNER_DISCORD_ID } from "../lib/session";
import { requireAuth } from "../lib/auth-middleware";
import { createNotification } from "../lib/notifications";
import { logger } from "../lib/logger";

const router = Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;

function getRedirectUri(req: any): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domains) return `https://${domains}/api/auth/discord/callback`;
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return `https://${devDomain}/api/auth/discord/callback`;
  return `http://localhost:${process.env.PORT || 5000}/api/auth/discord/callback`;
}

router.get("/auth/discord", (req, res): void => {
  const redirectUri = getRedirectUri(req);
  const state = randomUUID();
  (req.session as any).oauthState = state;
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

router.get("/auth/discord/callback", async (req, res): Promise<void> => {
  const { code, state } = req.query;
  const savedState = (req.session as any).oauthState;

  if (!code || (savedState && state !== savedState)) {
    res.redirect("/?error=invalid_state");
    return;
  }

  try {
    const redirectUri = getRedirectUri(req);
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      req.log.error({ status: tokenRes.status }, "Discord token exchange failed");
      res.redirect("/?error=auth_failed");
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string; token_type: string };

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      res.redirect("/?error=user_fetch_failed");
      return;
    }

    const discordUser = await userRes.json() as {
      id: string; username: string; discriminator: string; avatar?: string; email?: string;
    };

    const isOwner = discordUser.id === OWNER_DISCORD_ID;

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.discordId, discordUser.id));

    let user;
    if (existing) {
      const [updated] = await db.update(usersTable).set({
        username: discordUser.username,
        discriminator: discordUser.discriminator || "0",
        avatar: discordUser.avatar || null,
        email: discordUser.email || null,
        lastLogin: new Date(),
        ...(isOwner ? { isAdmin: true, hasInvite: true, isBanned: false } : {}),
      }).where(eq(usersTable.id, existing.id)).returning();
      user = updated;
    } else {
      const userId = randomUUID();
      const [created] = await db.insert(usersTable).values({
        id: userId,
        discordId: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator || "0",
        avatar: discordUser.avatar || null,
        email: discordUser.email || null,
        plan: "free",
        isAdmin: isOwner,
        isBanned: false,
        hasInvite: isOwner,
        lastLogin: new Date(),
      }).returning();
      user = created;

      if (!isOwner) {
        await createNotification({
          userId: user.id,
          title: "Welcome to Blocker X!",
          message: "Please enter an invitation code to access the dashboard.",
          type: "info",
        });
      }
    }

    (req.session as any).userId = user.id;
    delete (req.session as any).oauthState;

    req.log.info({ userId: user.id, isAdmin: user.isAdmin }, "User logged in");

    const frontendUrl = process.env.BASE_PATH || "/";
    const base = frontendUrl.endsWith("/") ? frontendUrl : `${frontendUrl}/`;

    let redirectTarget: string;
    if (user.isBanned) {
      redirectTarget = `${base}?error=banned`;
    } else if (!user.hasInvite && !user.isAdmin) {
      redirectTarget = `${base}invite`;
    } else if (user.isAdmin) {
      redirectTarget = `${base}admin`;
    } else {
      redirectTarget = `${base}dashboard`;
    }

    req.session.save((err) => {
      if (err) {
        req.log.error({ err }, "Session save error after login");
        res.redirect("/?error=server_error");
        return;
      }
      res.redirect(redirectTarget);
    });
  } catch (err) {
    req.log.error({ err }, "Discord OAuth callback error");
    res.redirect("/?error=server_error");
  }
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  req.session.destroy((err) => {
    if (err) req.log.error({ err }, "Session destroy error");
  });
  res.json({ message: "Logged out" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
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
  res.json({
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
  });
});

export default router;
