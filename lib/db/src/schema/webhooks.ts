import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const WEBHOOK_EVENTS = [
  "bot_started",
  "bot_stopped",
  "bot_crashed",
  "bot_deployed",
  "bot_restarted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const webhooksTable = pgTable("webhooks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  botId: text("bot_id"), // null = fires for all bots of that user
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWebhookSchema = createInsertSchema(webhooksTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooksTable.$inferSelect;
