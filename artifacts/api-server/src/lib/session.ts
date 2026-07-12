import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgSession = connectPgSimple(session);

const OWNER_DISCORD_ID = "1237892993013387307";

export function createSessionMiddleware() {
  return session({
    store: new PgSession({
      pool,
      tableName: "pg_sessions",
      schemaName: "public",
      createTableIfMissing: false, // created in runStartupMigrations on startup
    }),
    secret: process.env.SESSION_SECRET ?? (() => { throw new Error("SESSION_SECRET environment variable is required"); })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  });
}

export { OWNER_DISCORD_ID };
