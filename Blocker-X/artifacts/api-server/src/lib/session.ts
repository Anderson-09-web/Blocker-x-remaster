import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgSession = connectPgSimple(session);

const OWNER_DISCORD_ID = process.env.DISCORD_OWNER_ID ?? "1237892993013387307";

// Whether we're running behind a real HTTPS host (Replit deployment or
// Render) rather than local dev. Don't rely on NODE_ENV alone — Render
// doesn't set it by default, and if it's missing the cookie falls back to
// sameSite:"lax", which browsers refuse to send on cross-site fetch/XHR
// calls (frontend and API are on two different onrender.com domains). That
// makes the login *look* like it worked (the redirect itself is same-site
// navigation, which Lax still allows) but every subsequent API call comes
// in with no cookie, so the user gets bounced straight back out.
const isHttpsHost = Boolean(
  process.env.NODE_ENV === "production" ||
  process.env.REPLIT_DEPLOYMENT ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.RENDER_APP_URL,
);

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
    proxy: isHttpsHost,
    cookie: {
      secure: isHttpsHost,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: isHttpsHost ? "none" : "lax",
    },
  });
}

export { OWNER_DISCORD_ID };
