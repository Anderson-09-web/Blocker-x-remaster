import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deploymentsTable = pgTable("deployments", {
  id: text("id").primaryKey(),
  botId: text("bot_id").notNull(),
  botName: text("bot_name").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  logs: text("logs"),
  errorMessage: text("error_message"),
});

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({ startedAt: true });
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;
