import { createDb, type Db } from "@aqsha/db";
import postgres from "postgres";

let sql: postgres.Sql | null = null;
let serviceDb: Db | null = null;

/**
 * Singleton postgres.js untuk PROSES eve — path proyeksi 6.1 (`agent/lib/store.ts`
 * raw SQL). Tetap dipakai apa adanya (jangan churn kode 6.1 yang sudah jalan).
 *
 * eve = proses Node v25 TERPISAH; `postgres` (npm terkompilasi) bundle-able. Lazy →
 * tak konek saat import.
 */
export function getSql(): postgres.Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required for eve chat projection");
    sql = postgres(url);
  }
  return sql;
}

/**
 * Singleton Drizzle `Db` untuk PROSES eve — path SERVICE (Slice 6.2, keputusan D-E).
 * Kode baru 6.2+ memanggil `@aqsha/services` (billing/quota/…) yang menuntut `Db` Drizzle,
 * di-resolve dari dist build `@aqsha/db` (`externalDependencies` di `agent.ts`). Mewarisi
 * `DATABASE_URL`; `createDb` lazy (postgres.js) → tak konek saat import.
 */
export function getServiceDb(): Db {
  if (!serviceDb) {
    serviceDb = createDb().db;
  }
  return serviceDb;
}
