import { Router } from "express";
import { db, webhooksTable, botsTable, WEBHOOK_EVENTS } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import { requireAuth, requireInvite } from "../lib/auth-middleware";
import { fireWebhooks, validateWebhookUrl } from "../lib/webhooks";

const router = Router();

function getUserId(req: any): string {
  return (req as any).user.id;
}

// GET /webhooks — list all webhooks for the authed user
router.get("/webhooks", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const hooks = await db.select().from(webhooksTable).where(eq(webhooksTable.userId, userId));
  res.json({ webhooks: hooks });
});

// POST /webhooks — create a new webhook
router.post("/webhooks", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { botId, url, events, enabled } = req.body as {
    botId?: string;
    url: string;
    events: string[];
    enabled?: boolean;
  };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "URL requerida." });
    return;
  }
  try {
    await validateWebhookUrl(url);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  const validEvents = events?.filter((e): e is any => (WEBHOOK_EVENTS as readonly string[]).includes(e)) ?? [];
  if (validEvents.length === 0) {
    res.status(400).json({ error: "Selecciona al menos un evento." });
    return;
  }

  // If botId provided, verify it belongs to user
  if (botId) {
    const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, userId)));
    if (!bot) {
      res.status(404).json({ error: "Bot no encontrado." });
      return;
    }
  }

  const secret = randomBytes(24).toString("hex");
  const id = randomUUID();

  await db.insert(webhooksTable).values({
    id,
    userId,
    botId: botId ?? null,
    url: url.trim(),
    secret,
    events: validEvents,
    enabled: enabled !== false,
  });

  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  res.status(201).json({ webhook: hook });
});

// PUT /webhooks/:id — update url, events, enabled, botId
router.put("/webhooks/:id", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { id } = req.params;

  const [existing] = await db.select().from(webhooksTable).where(and(eq(webhooksTable.id, id), eq(webhooksTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Webhook no encontrado." });
    return;
  }

  const { url, events, enabled, botId } = req.body as {
    url?: string;
    events?: string[];
    enabled?: boolean;
    botId?: string | null;
  };

  const update: Partial<typeof existing> = {};

  if (url !== undefined) {
    try {
      await validateWebhookUrl(url);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }
    update.url = url.trim();
  }

  if (events !== undefined) {
    const valid = events.filter((e): e is any => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (valid.length === 0) {
      res.status(400).json({ error: "Selecciona al menos un evento." });
      return;
    }
    update.events = valid;
  }

  if (enabled !== undefined) update.enabled = enabled;
  if (botId !== undefined) update.botId = botId ?? null;

  await db.update(webhooksTable).set(update).where(eq(webhooksTable.id, id));
  const [updated] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  res.json({ webhook: updated });
});

// DELETE /webhooks/:id
router.delete("/webhooks/:id", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { id } = req.params;

  const [existing] = await db.select().from(webhooksTable).where(and(eq(webhooksTable.id, id), eq(webhooksTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Webhook no encontrado." });
    return;
  }

  await db.delete(webhooksTable).where(eq(webhooksTable.id, id));
  res.json({ ok: true });
});

// POST /webhooks/:id/test — fire a test ping event
router.post("/webhooks/:id/test", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { id } = req.params;

  const [hook] = await db.select().from(webhooksTable).where(and(eq(webhooksTable.id, id), eq(webhooksTable.userId, userId)));
  if (!hook) {
    res.status(404).json({ error: "Webhook no encontrado." });
    return;
  }

  if (!hook.enabled) {
    res.status(400).json({ error: "El webhook está desactivado." });
    return;
  }

  // Deliver a test ping directly (bypass event filter so it always fires)
  const { createHmac } = await import("crypto");
  const payload = {
    event: "ping",
    botId: hook.botId ?? "test",
    botName: "Test Bot",
    userId,
    timestamp: new Date().toISOString(),
    data: { message: "This is a test ping from BX Platform." },
  };
  const body = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", hook.secret).update(body).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let statusCode = 0;
  let ok = false;
  let error: string | undefined;

  try {
    const resp = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BX-Signature": sig,
        "X-BX-Event": "ping",
        "User-Agent": "BX-Platform/1.0",
      },
      body,
      signal: controller.signal,
    });
    statusCode = resp.status;
    ok = resp.ok;
  } catch (e: any) {
    error = e?.message ?? "Connection error";
  } finally {
    clearTimeout(timeout);
  }

  res.json({ ok, statusCode, error });
});

// GET /webhooks/events — list all available event types
router.get("/webhooks/events", requireAuth, async (_req, res): Promise<void> => {
  res.json({ events: WEBHOOK_EVENTS });
});

export default router;
