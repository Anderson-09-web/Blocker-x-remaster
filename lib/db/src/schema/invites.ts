import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inviteCodesTable = pgTable("invitation_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses"),
  usesCount: integer("uses_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  grantsPremium: boolean("grants_premium").notNull().default(false),
  grantsPlan: text("grants_plan"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const redeemedCodesTable = pgTable("redeemed_codes", {
  id: text("id").primaryKey(),
  codeId: text("code_id").notNull(),
  userId: text("user_id").notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInviteCodeSchema = createInsertSchema(inviteCodesTable).omit({ createdAt: true, usesCount: true });
export type InsertInviteCode = z.infer<typeof insertInviteCodeSchema>;
export type InviteCode = typeof inviteCodesTable.$inferSelect;
