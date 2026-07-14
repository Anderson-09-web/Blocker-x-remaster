import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminDocsTable = pgTable("admin_docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAdminDocSchema = createInsertSchema(adminDocsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertAdminDoc = z.infer<typeof insertAdminDocSchema>;
export type AdminDoc = typeof adminDocsTable.$inferSelect;
