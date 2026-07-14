import { createHmac } from "crypto";
import { db, webhooksTable, botsTable } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { logger } from "./logger";
import type { WebhookEvent } from "@workspace/db";
import { lookup } from "dns/promises";

export interface WebhookPayload {
  event: WebhookEvent;
  botId: string;
  botName?: string;
  userId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/**
 * SSRF guard: blocks private/loopback/link-local/metadata destinations.
 * Throws if the URL is not safe to fetch server-side.
 */
const PRIVATE_RANGES: Array<(ip: string) => boolean> = [
  // IPv4 loopback
  (ip) => /^127\./.test(ip),
  // RFC1918 private
  (ip) => /^10\./.test(ip),
  (ip) => /^192\.168\./.test(ip),
  (ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip),
  // Link-local / APIPA
  (ip) => /^169\.254\./.test(ip),
  // "This" network
  (ip) => /^0\./.test(ip),
  // Multicast / broadcast
  (ip) => /^(224|225|226|227|228|229|230|231|232|233|234|235|236|237|238|239|255)\./.test(ip),
  // IPv6 loopback and private
  (ip) => ip === "::1" || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd") || ip.toLowerCase().startsWith("fe80"),
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((fn) => fn(ip));
}

export async function validateWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Solo se permiten URLs http o https.");
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block raw IP literals that are private
  // Simple check: if hostname is an IP address, validate it directly
  const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Re.test(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("La URL apunta a una dirección IP privada o reservada.");
    }
    return; // Public IP literal — OK
  }

  // Block localhost by name
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("No se permiten URLs que apunten a hosts internos.");
  }

  // For DNS hostnames: resolve and check all returned IPs
  try {
    const addresses = await lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        throw new Error("La URL resuelve a una dirección IP privada o interna.");
      }
    }
  } catch (err: any) {
    if (err.message?.startsWith("La URL")) throw err;
    // DNS resolution failure = host doesn't exist → reject
    throw new Error("No se pudo resolver el hostname del webhook.");
  }
}

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

async function deliverWebhook(url: string, secret: string, payload: WebhookPayload): Promise<void> {
  // Re-validate at delivery time (in case IPs changed or URL was saved before guard existed)
  try {
    await validateWebhookUrl(url);
  } catch {
    logger.warn({ url }, "Webhook delivery blocked by SSRF guard");
    return;
  }

  const body = JSON.stringify(payload);
  const sig = sign(secret, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BX-Signature": sig,
        "X-BX-Event": payload.event,
        "User-Agent": "BX-Platform/1.0",
      },
      body,
      signal: controller.signal,
      // Disable redirect following to prevent redirect-based SSRF bypass
      redirect: "error",
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status, event: payload.event }, "Webhook delivery non-2xx");
    }
  } catch (err) {
    logger.warn({ url, err, event: payload.event }, "Webhook delivery failed");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire all webhooks for a given user+bot+event combination.
 * Bot-specific webhooks AND user-global webhooks (botId IS NULL) are both fired.
 */
export async function fireWebhooks(
  userId: string,
  botId: string,
  event: WebhookEvent,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const hooks = await db
      .select()
      .from(webhooksTable)
      .where(
        and(
          eq(webhooksTable.userId, userId),
          eq(webhooksTable.enabled, true),
          or(eq(webhooksTable.botId, botId), isNull(webhooksTable.botId))
        )
      );

    if (hooks.length === 0) return;

    let botName: string | undefined;
    try {
      const [bot] = await db.select({ name: botsTable.name }).from(botsTable).where(eq(botsTable.id, botId));
      botName = bot?.name;
    } catch {}

    const payload: WebhookPayload = {
      event,
      botId,
      botName,
      userId,
      timestamp: new Date().toISOString(),
      data,
    };

    await Promise.all(
      hooks
        .filter((h) => h.events.includes(event))
        .map((h) => deliverWebhook(h.url, h.secret, payload))
    );
  } catch (err) {
    logger.error({ err }, "fireWebhooks error");
  }
}
