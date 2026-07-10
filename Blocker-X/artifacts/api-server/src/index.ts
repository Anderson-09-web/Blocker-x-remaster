import app from "./app";
import { logger } from "./lib/logger";
import { resetStaleProcesses } from "./lib/process-manager";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    // Create any tables that drizzle-kit push may have skipped due to TTY constraints.
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_shares (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        collaborator_id TEXT NOT NULL,
        can_edit_files BOOLEAN NOT NULL DEFAULT TRUE,
        can_view_logs BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS bot_shares_collaborator_idx
        ON bot_shares (collaborator_id)
    `);

    // Add columns that were added to existing tables after initial deploy.
    await client.query(`
      ALTER TABLE invitation_codes
        ADD COLUMN IF NOT EXISTS grants_premium BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Session table for connect-pg-simple — use public. prefix so it lands in
    // the right schema regardless of the connection's default search_path.
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.pg_sessions (
        sid  VARCHAR NOT NULL,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT pg_sessions_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pg_sessions_expire" ON public.pg_sessions (expire)
    `);

    // grants_plan column for invite codes (3-tier plan system)
    await client.query(`
      ALTER TABLE invitation_codes
        ADD COLUMN IF NOT EXISTS grants_plan TEXT
    `);

    logger.info("Startup migrations applied");
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await runStartupMigrations();
  } catch (err) {
    logger.warn({ err }, "Startup migrations failed — continuing anyway.");
  }

  try {
    await resetStaleProcesses();
  } catch (err) {
    logger.warn({ err }, "resetStaleProcesses failed — DB may not be migrated yet. Continuing startup.");
  }

  app.listen(port, "0.0.0.0", (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening on 0.0.0.0");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
