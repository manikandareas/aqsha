import postgres from "postgres";

let sql: postgres.Sql | null = null;

/**
 * Singleton postgres.js untuk PROSES eve (hook proyeksi + onMessage ownership).
 *
 * eve = proses Node TERPISAH yang di-bundle Rolldown; ia TAK bisa mengonsumsi paket
 * workspace TS-mentah (`@aqsha/db`/`@aqsha/services`) — jadi koneksi DB di sini pakai
 * driver `postgres` (npm terkompilasi, bundle-able) langsung, mewarisi `DATABASE_URL`
 * dari env web-v2 (`.env.local`). postgres.js lazy → tak konek saat import.
 */
export function getSql(): postgres.Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required for eve chat projection");
    sql = postgres(url);
  }
  return sql;
}
