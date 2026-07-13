import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Please configure your PostgreSQL connection string.",
  );
}

const sslConfig = connectionString.includes("neon.tech")
  ? { rejectUnauthorized: false }
  : connectionString.includes("sslmode=disable") || connectionString.includes("helium")
    ? false
    : false;

// Keep the pool small — Render's free plan (512MB RAM) and Neon's free plan
// both have limited headroom for concurrent connections/memory.
export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
  max: Number(process.env.DB_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
