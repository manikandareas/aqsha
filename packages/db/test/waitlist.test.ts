import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb, runMigrations, WaitlistRepo } from "@aqsha/db";

const DATABASE_URL = process.env.DATABASE_URL;
const dbTest = DATABASE_URL ? test : test.skip;
const email = `waitlist_${Math.floor(Math.random() * 1e9)}@example.com`;

beforeAll(async () => {
  if (DATABASE_URL) await runMigrations(DATABASE_URL);
});

afterAll(async () => {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from waitlist_entries where email=${email}`;
  await client.end();
});

describe("waitlist repository", () => {
  dbTest("insert, find, update token, dan confirm pending", async () => {
    const { db, client } = createDb(DATABASE_URL!);
    const inserted = await WaitlistRepo.insert(db, {
      id: crypto.randomUUID(),
      email,
      companyOrUniversity: "Universitas Test",
      status: "pending",
      verificationTokenHash: "hash_a",
      verificationExpiresAt: Date.now() + 86_400_000,
      verifiedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(inserted).toBe(true);
    expect((await WaitlistRepo.findByEmail(db, email))?.status).toBe("pending");
    expect((await WaitlistRepo.findPendingByTokenHash(db, "hash_a"))?.email).toBe(email);
    expect(
      await WaitlistRepo.confirmPending(db, (await WaitlistRepo.findByEmail(db, email))!.id, Date.now()),
    ).toBe(true);
    expect((await WaitlistRepo.findByEmail(db, email))?.status).toBe("confirmed");
    await client.end();
  });
});
