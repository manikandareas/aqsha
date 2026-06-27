import { PgVector, PostgresStore } from "@mastra/pg";

/**
 * Storage + vector store bersama untuk runtime Mastra Astra (Fase 0).
 *
 * Satu Postgres yang SAMA dengan aplikasi (`DATABASE_URL`). Mastra membuat tabelnya
 * sendiri ber-prefix `mastra_*` (threads/messages/workflow-snapshot/eval) → koeksistensi
 * aman dengan tabel app (`chat_*`, `artifacts`, dst.). Nama tabel TETAP (tak di-namespace
 * oleh `id`), jadi instance store ini DIBAGI antara instance `Mastra` (snapshot workflow,
 * dll.) dan `Memory` (history + semantic recall) — satu instance, tanpa init ganda.
 *
 * `init()` dipanggil otomatis oleh Mastra sebelum operasi pertama (auto-migrate tabel
 * `mastra_*`). Koneksi lazy (pool `pg`) → tak konek saat import.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for the Mastra Astra runtime");
}

export const storage = new PostgresStore({ id: "aqsha", connectionString });

export const vector = new PgVector({ id: "aqsha", connectionString });
