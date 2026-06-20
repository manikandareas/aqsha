import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

/**
 * Buat koneksi Drizzle di atas postgres.js (driver yang cocok untuk Bun).
 * Mengembalikan `db` (instance Drizzle, satu-satunya yang dipakai repository/service)
 * dan `client` (handle postgres.js mentah, untuk `client.end()` di test/teardown).
 */
export function createDb(url: string = requireDatabaseUrl(), options?: postgres.Options<{}>) {
  const client = postgres(url, options);
  const db = drizzle(client, { schema });
  return { db, client };
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to create a database connection");
  return url;
}
