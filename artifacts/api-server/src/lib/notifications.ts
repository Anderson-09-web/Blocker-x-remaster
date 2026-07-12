import { db, notificationsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { logger } from "./logger";

export async function createNotification(params: {
  userId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error" | "announcement";
}) {
  await db.insert(notificationsTable).values({
    id: randomUUID(),
    userId: params.userId,
    title: params.title,
    message: params.message,
    type: params.type || "info",
    isRead: false,
  });
}

function typeToColor(type?: string): number {
  switch (type) {
    case "success": return 0x22c55e;
    case "error":   return 0xef4444;
    case "warning": return 0xeab308;
    case "announcement": return 0x8b5cf6;
    default: return 0x3b82f6;
  }
}

function typeToEmoji(type?: string): string {
  switch (type) {
    case "success": return "✅";
    case "error":   return "❌";
    case "warning": return "⚠️";
    default: return "ℹ️";
  }
}

/**
 * In-memory throttle: at most 1 DM per bot per DM_COOLDOWN_MS.
 * Prevents spam when a bot enters a restart loop or is restarted frequently.
 * The key is `${botId}:${eventKey}` so start and crash events are tracked separately.
 */
const _dmCooldowns = new Map<string, number>();
const DM_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per event per bot

function _isDmThrottled(key: string): boolean {
  const last = _dmCooldowns.get(key) ?? 0;
  if (Date.now() - last < DM_COOLDOWN_MS) return true;
  _dmCooldowns.set(key, Date.now());
  return false;
}

export async function sendDiscordDm(discordId: string, params: {
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error" | "announcement";
  /** Optional throttle key — if provided, DMs are rate-limited to 1 per 5 min */
  throttleKey?: string;
}): Promise<void> {
  if (params.throttleKey && _isDmThrottled(params.throttleKey)) {
    logger.debug({ throttleKey: params.throttleKey }, "DM throttled — skipping");
    return;
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return;

  try {
    const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordId }),
    });

    if (!dmRes.ok) {
      logger.warn({ status: dmRes.status }, "Failed to open DM channel");
      return;
    }

    const dmChannel = (await dmRes.json()) as { id: string };

    const embed = {
      title: `${typeToEmoji(params.type)} ${params.title}`,
      description: params.message,
      color: typeToColor(params.type),
      footer: { text: "Blocker X • blockerx.app" },
      timestamp: new Date().toISOString(),
    };

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!msgRes.ok) {
      logger.warn({ status: msgRes.status }, "Failed to send Discord DM");
    }
  } catch (err) {
    logger.error({ err }, "Discord DM error");
  }
}

export async function notifyUser(params: {
  userId: string;
  discordId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error" | "announcement";
  discord?: boolean;
  throttleKey?: string;
}) {
  await createNotification({ userId: params.userId, title: params.title, message: params.message, type: params.type });
  if (params.discord !== false) {
    await sendDiscordDm(params.discordId, {
      title: params.title,
      message: params.message,
      type: params.type,
      throttleKey: params.throttleKey,
    });
  }
}
