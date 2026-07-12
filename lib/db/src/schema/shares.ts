import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const botSharesTable = pgTable("bot_shares", {
  id: text("id").primaryKey(),
  botId: text("bot_id").notNull(),
  ownerId: text("owner_id").notNull(),
  collaboratorId: text("collaborator_id").notNull(),
  canEditFiles: boolean("can_edit_files").notNull().default(true),
  canViewLogs: boolean("can_view_logs").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BotShare = typeof botSharesTable.$inferSelect;
