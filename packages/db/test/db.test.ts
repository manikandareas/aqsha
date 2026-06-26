import { describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { runMigrations } from "../src/migrator";

// Test ini butuh Postgres live (DATABASE_URL). Tanpa env, di-skip supaya
// `bun test` tetap hijau di lingkungan tanpa DB.
const DATABASE_URL = process.env.DATABASE_URL;
const dbTest = DATABASE_URL ? test : test.skip;

describe("packages/db", () => {
  dbTest("createDb() bisa menjalankan SELECT 1", async () => {
    const { client } = createDb(DATABASE_URL!);
    const rows = await client`select 1 as one`;
    expect(Number(rows[0]!.one)).toBe(1);
    await client.end();
  });

  dbTest("migrasi idempotent & membuat tabel users", async () => {
    await runMigrations(DATABASE_URL!);
    await runMigrations(DATABASE_URL!); // re-run = no-op
    const { client } = createDb(DATABASE_URL!);
    const rows = await client`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'users'
    `;
    expect(rows.length).toBe(1);
    await client.end();
  });
});
