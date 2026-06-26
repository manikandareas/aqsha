import type { Db } from "./client";

/**
 * Handle yang diterima setiap repo/service: koneksi root `Db` ATAU transaksi
 * in-flight. Repo menerima ini sebagai argumen pertama supaya service bisa
 * mengomposisi beberapa repo dalam satu `db.transaction(...)` (atomik).
 *
 * Tipe tx diturunkan dari parameter pertama callback `db.transaction(fn)`.
 */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
