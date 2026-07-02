/**
 * P9 — AccountDeletionService. Dua lapis:
 *
 *  A. unit (spyOn, no db): guard idempoten `request` + urutan/error-path `run`
 *     (Clerk → blob best-effort → DELETE cascade; throw pra-DELETE → 'failed').
 *  B. DB-itest (prefix `itdel_`):
 *     - META: SETIAP FK → users ber-`ON DELETE CASCADE` (catch tabel owner baru
 *       tanpa cascade = bug kelas V1) — bukti completeness tanpa seed 20 tabel.
 *     - MEKANIK: seed 501 baris owner → `run` → cascade hapus semua + user hilang
 *       (bukti DELETE benar-benar cascade + TANPA cap 500).
 */
import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { createDb, UserRepo, users } from "@aqsha/db";
import { AccountDeletionService } from "../src/account-deletion.service";
import * as queueMod from "../src/clients/queue";
import { StorageService } from "../src/storage.service";

const OWNER = "user_1";
const noopDeps = { deleteClerkUser: async () => {} };

// ── A. unit ──────────────────────────────────────────────────────────────────
function fakeDb(rows: Array<Record<string, unknown>>, onDelete: () => void) {
  return {
    select: () => ({ from: () => ({ where: async () => rows }) }),
    delete: () => ({ where: async () => onDelete() }),
  } as never;
}

describe("AccountDeletionService.request — guard idempoten", () => {
  afterEach(() => mock.restore());

  test("user aktif → tombstone 'deleting' + enqueue sekali", async () => {
    spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue({
      ownerUserId: OWNER,
      clerkUserId: OWNER,
      deletionStatus: "active",
    } as never);
    const patch = spyOn(UserRepo, "patch").mockResolvedValue(undefined as never);
    const enq = spyOn(queueMod, "enqueue").mockResolvedValue("job1" as never);

    const r = await AccountDeletionService.request({} as never, OWNER);
    expect(r.status).toBe("deleting");
    expect(patch.mock.calls[0]![2]).toMatchObject({ deletionStatus: "deleting" });
    expect(enq).toHaveBeenCalledTimes(1);
  });

  test("sudah 'deleting' → no-op (tanpa patch/enqueue)", async () => {
    spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue({
      ownerUserId: OWNER,
      deletionStatus: "deleting",
    } as never);
    const patch = spyOn(UserRepo, "patch").mockResolvedValue(undefined as never);
    const enq = spyOn(queueMod, "enqueue").mockResolvedValue("job1" as never);

    const r = await AccountDeletionService.request({} as never, OWNER);
    expect(r.status).toBe("deleting");
    expect(patch).not.toHaveBeenCalled();
    expect(enq).not.toHaveBeenCalled();
  });

  test("user tak ada → 'deleted', tanpa enqueue", async () => {
    spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue(null as never);
    const enq = spyOn(queueMod, "enqueue").mockResolvedValue("job1" as never);
    const r = await AccountDeletionService.request({} as never, OWNER);
    expect(r.status).toBe("deleted");
    expect(enq).not.toHaveBeenCalled();
  });
});

describe("AccountDeletionService.run — urutan + error path", () => {
  afterEach(() => mock.restore());

  test("sukses: hapus Clerk → DELETE cascade dipanggil", async () => {
    spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue({
      ownerUserId: OWNER,
      clerkUserId: "clk_1",
    } as never);
    let deleted = false;
    let clerkArg = "";
    await AccountDeletionService.run(fakeDb([], () => (deleted = true)), {
      deleteClerkUser: async (id) => {
        clerkArg = id;
      },
    }, OWNER);
    expect(clerkArg).toBe("clk_1");
    expect(deleted).toBe(true);
  });

  test("blob gagal TIDAK memblok DELETE", async () => {
    spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue({
      ownerUserId: OWNER,
      clerkUserId: "clk_1",
    } as never);
    const del = spyOn(StorageService, "deleteObject").mockRejectedValue(new Error("s3 down"));
    let deleted = false;
    await AccountDeletionService.run(
      fakeDb([{ k: "blob1" }], () => (deleted = true)),
      noopDeps,
      OWNER,
    );
    expect(del).toHaveBeenCalled();
    expect(deleted).toBe(true); // tetap sampai cascade
  });

  test("Clerk gagal → tandai 'failed' + rethrow (BullMQ retry)", async () => {
    spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue({
      ownerUserId: OWNER,
      clerkUserId: "clk_1",
    } as never);
    const patch = spyOn(UserRepo, "patch").mockResolvedValue(undefined as never);
    let deleted = false;
    await expect(
      AccountDeletionService.run(fakeDb([], () => (deleted = true)), {
        deleteClerkUser: async () => {
          throw new Error("clerk 500");
        },
      }, OWNER),
    ).rejects.toThrow("clerk 500");
    expect(patch.mock.calls[0]![2]).toMatchObject({ deletionStatus: "failed" });
    expect(deleted).toBe(false); // tak sampai DELETE
  });

  test("user sudah hilang → idempoten no-op (Clerk tak dipanggil)", async () => {
    spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue(null as never);
    let clerkCalled = false;
    await AccountDeletionService.run(fakeDb([], () => {}), {
      deleteClerkUser: async () => {
        clerkCalled = true;
      },
    }, OWNER);
    expect(clerkCalled).toBe(false);
  });
});

// ── B. DB-itest ──────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from user_feed_interests where owner_user_id like ${`itdel_${SUFFIX}_%`}`;
  await client`delete from users where owner_user_id like ${`itdel_${SUFFIX}_%`}`;
}
beforeAll(cleanup);

describe("AccountDeletion cascade (DB-itest)", () => {
  itest("META: setiap FK → users ber-ON DELETE CASCADE", async () => {
    const rows = await client<Array<{ tbl: string; del: string }>>`
      select conrelid::regclass::text as tbl, confdeltype as del
      from pg_constraint
      where confrelid = 'users'::regclass and contype = 'f'`;
    expect(rows.length).toBeGreaterThanOrEqual(20);
    const notCascade = rows.filter((r) => r.del !== "c").map((r) => r.tbl);
    expect(notCascade).toEqual([]); // tabel owner tanpa cascade = bug
  });

  itest("MEKANIK: 501 baris owner → run → cascade hapus semua + user hilang", async () => {
    const owner = `itdel_${SUFFIX}_0`;
    await db.insert(users).values({
      ownerUserId: owner,
      clerkUserId: owner,
      createdAt: 1,
      updatedAt: 1,
    } as never);
    // 501 > cap 500 V1 → bukti cascade tanpa batas.
    await client`
      insert into user_feed_interests (owner_user_id, topic, weight, updated_at)
      select ${owner}, 'topic_' || g, 1, 1 from generate_series(1, 501) g`;

    await AccountDeletionService.run(db, { deleteClerkUser: async () => {} }, owner);

    const left = await client`select count(*)::int as n from user_feed_interests where owner_user_id = ${owner}`;
    expect(left[0]!.n).toBe(0);
    const user = await UserRepo.findByOwnerUserId(db, owner);
    expect(user).toBeNull();
  });
});
