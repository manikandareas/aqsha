import { createDb, type Db } from "@aqsha/db";

/**
 * Singleton Drizzle `Db` untuk tool/step Mastra yang memanggil `@aqsha/services`
 * (billing/quota/workspace/artifact/research/citation). Di-resolve dari dist build
 * `@aqsha/db` lewat exports condition `node` (build:dist wajib). `createDb` lazy
 * (postgres.js) → tak konek saat import.
 */
let serviceDb: Db | null = null;

export function getServiceDb(): Db {
  if (!serviceDb) {
    serviceDb = createDb().db;
  }
  return serviceDb;
}
