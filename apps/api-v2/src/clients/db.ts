import { createDb } from "@aqsha/db";

let conn: ReturnType<typeof createDb> | null = null;

/**
 * Lazy singleton koneksi DB. Tidak konek saat import (postgres.js lazy);
 * `createDb()` baru dipanggil saat pertama dibutuhkan (mis. /healthz), sehingga
 * route yang tak butuh DB (mis. /ping) tetap jalan tanpa DATABASE_URL.
 */
export function getDb() {
  if (!conn) conn = createDb();
  return conn;
}
