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

export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
