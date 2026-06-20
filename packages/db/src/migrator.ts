import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Terapkan migrasi Drizzle secara programatik (reusable di `db:migrate` + test).
 * Idempotent: drizzle melacak migrasi yang sudah diterapkan; re-run = no-op.
 */
export async function runMigrations(url: string = requireDatabaseUrl()): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    const db = drizzle(sql);
    const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
    await migrate(db, { migrationsFolder });
  } finally {
    await sql.end();
  }
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run migrations");
  return url;
}
