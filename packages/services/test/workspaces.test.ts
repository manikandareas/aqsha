import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  AppError,
  ArtifactContentRepo,
  ArtifactEmbeddingRepo,
  ArtifactPaperMetadataRepo,
  ArtifactRepo,
  ArtifactUrlRepo,
  BillingRepo,
  decodeKeysetCursor,
  encodeKeysetCursor,
  FolderRepo,
  UserRepo,
  WorkspaceRepo,
} from "@aqsha/db";
import { resolveAdminOverride } from "../src/billing/snapshot";
import { FolderService } from "../src/folder.service";
import { WorkspaceService } from "../src/workspace.service";

// fakeDb.transaction(fn) menjalankan fn dengan tx=fakeDb; repo di-spy jadi tx tak dipakai.
const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;

const OWNER = "u1";

const makeWorkspace = (over: Record<string, unknown> = {}) =>
  ({
    id: "w1",
    ownerUserId: OWNER,
    name: "Riset",
    emoji: "📚",
    description: null,
    status: "active",
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }) as never;

const makeFolder = (over: Record<string, unknown> = {}) =>
  ({
    id: "f1",
    ownerUserId: OWNER,
    workspaceId: "w1",
    name: "Bab 1",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...over,
  }) as never;

let s: {
  wsFindById: ReturnType<typeof spyOn>;
  wsCount: ReturnType<typeof spyOn>;
  wsInsert: ReturnType<typeof spyOn>;
  wsUpdate: ReturnType<typeof spyOn>;
  fFindById: ReturnType<typeof spyOn>;
  fFindByName: ReturnType<typeof spyOn>;
  fInsert: ReturnType<typeof spyOn>;
  fUpdate: ReturnType<typeof spyOn>;
};

beforeEach(() => {
  s = {
    wsFindById: spyOn(WorkspaceRepo, "findById").mockResolvedValue(makeWorkspace()),
    wsCount: spyOn(WorkspaceRepo, "countActiveByOwner").mockResolvedValue(0),
    wsInsert: spyOn(WorkspaceRepo, "insert").mockResolvedValue(undefined),
    wsUpdate: spyOn(WorkspaceRepo, "update").mockResolvedValue(undefined),
    fFindById: spyOn(FolderRepo, "findById").mockResolvedValue(makeFolder()),
    fFindByName: spyOn(FolderRepo, "findActiveByName").mockResolvedValue(null as never),
    fInsert: spyOn(FolderRepo, "insert").mockResolvedValue(undefined),
    fUpdate: spyOn(FolderRepo, "update").mockResolvedValue(undefined),
  };
  // P3: FolderService.move/remove sekarang fan-out ke artifacts — mock repo-nya.
  spyOn(ArtifactRepo, "listActiveIdsByFolder").mockResolvedValue([]);
  spyOn(ArtifactRepo, "setWorkspaceForFolder").mockResolvedValue(undefined);
  spyOn(ArtifactRepo, "clearFolderForFolder").mockResolvedValue(undefined);
  spyOn(ArtifactContentRepo, "setWorkspaceByArtifactIds").mockResolvedValue(undefined);
  spyOn(ArtifactUrlRepo, "setWorkspaceByArtifactIds").mockResolvedValue(undefined);
  spyOn(ArtifactPaperMetadataRepo, "setWorkspaceByArtifactIds").mockResolvedValue(undefined);
  spyOn(ArtifactEmbeddingRepo, "setWorkspaceByArtifactIds").mockResolvedValue(undefined);
  // P5: capacity check kini resolveEffectivePlanKey (db-aware) — stub billing reads
  // ke "tanpa override/subscription" → plan jatuh ke env-admin allowlist atau 'free'.
  spyOn(BillingRepo, "findLatestSubscriptionByOwner").mockResolvedValue(null);
  spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue(null);
  delete process.env.AQSHA_ADMIN_OWNER_USER_IDS;
  delete process.env.AQSHA_ADMIN_EMAILS;
});

afterEach(() => mock.restore());

async function appErrorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    throw new Error("expected throw, got resolve");
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError).code;
  }
}

describe("WorkspaceService.create — capacity per plan", () => {
  test("free plan, under cap → inserts and returns id", async () => {
    s.wsCount.mockResolvedValue(0);
    const res = await WorkspaceService.create(fakeDb, { ownerUserId: OWNER, name: "Baru", kind: "freeform" });
    expect(res.id).toBeString();
    expect(s.wsInsert).toHaveBeenCalledTimes(1);
  });

  test("free plan at cap (1 active) → workspace_limit_reached, no insert", async () => {
    s.wsCount.mockResolvedValue(1);
    const code = await appErrorCode(
      WorkspaceService.create(fakeDb, { ownerUserId: OWNER, name: "Kedua", kind: "freeform" }),
    );
    expect(code).toBe("workspace_limit_reached");
    expect(s.wsInsert).not.toHaveBeenCalled();
  });

  test("admin (env allowlist) → unlimited, skips count, inserts", async () => {
    process.env.AQSHA_ADMIN_OWNER_USER_IDS = OWNER;
    s.wsCount.mockResolvedValue(999);
    const res = await WorkspaceService.create(fakeDb, { ownerUserId: OWNER, name: "Admin ws", kind: "freeform" });
    expect(res.id).toBeString();
    expect(s.wsCount).not.toHaveBeenCalled();
    expect(s.wsInsert).toHaveBeenCalledTimes(1);
  });

  test("empty name diperbolehkan (judul menyusul saat exploration) → tersimpan string kosong", async () => {
    s.wsCount.mockResolvedValue(0);
    const res = await WorkspaceService.create(fakeDb, { ownerUserId: OWNER, name: "   ", kind: "freeform" });
    expect(res.id).toBeString();
    expect(s.wsInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "" }),
    );
  });

  test("name > 120 chars → name_too_long", async () => {
    const long = "a".repeat(121);
    expect(
      await appErrorCode(WorkspaceService.create(fakeDb, { ownerUserId: OWNER, name: long, kind: "freeform" })),
    ).toBe("name_too_long");
  });
});

describe("WorkspaceService.update — rename + emoji guard", () => {
  test("no fields → bad_request", async () => {
    expect(
      await appErrorCode(WorkspaceService.update(fakeDb, { ownerUserId: OWNER, workspaceId: "w1" })),
    ).toBe("bad_request");
  });

  test("not owned → workspace_not_found", async () => {
    s.wsFindById.mockResolvedValue(makeWorkspace({ ownerUserId: "other" }));
    expect(
      await appErrorCode(
        WorkspaceService.update(fakeDb, { ownerUserId: OWNER, workspaceId: "w1", name: "X" }),
      ),
    ).toBe("workspace_not_found");
  });

  test("valid single-grapheme emoji → patches", async () => {
    await WorkspaceService.update(fakeDb, { ownerUserId: OWNER, workspaceId: "w1", emoji: "🚀" });
    expect(s.wsUpdate).toHaveBeenCalledTimes(1);
  });

  test.each(["ab", "👍🏽👍🏽", "a", "👍👎", "📚📚"])(
    "invalid emoji %p → workspace_emoji_invalid",
    async (bad) => {
      expect(
        await appErrorCode(
          WorkspaceService.update(fakeDb, { ownerUserId: OWNER, workspaceId: "w1", emoji: bad }),
        ),
      ).toBe("workspace_emoji_invalid");
    },
  );
});

describe("WorkspaceService.archive — idempotent", () => {
  test("active → archives once", async () => {
    s.wsFindById.mockResolvedValue(makeWorkspace({ status: "active" }));
    await WorkspaceService.archive(fakeDb, { ownerUserId: OWNER, workspaceId: "w1" });
    expect(s.wsUpdate).toHaveBeenCalledTimes(1);
  });

  test("already archived → no rewrite", async () => {
    s.wsFindById.mockResolvedValue(makeWorkspace({ status: "archived" }));
    await WorkspaceService.archive(fakeDb, { ownerUserId: OWNER, workspaceId: "w1" });
    expect(s.wsUpdate).not.toHaveBeenCalled();
  });
});

describe("WorkspaceService.assertWorkspaceOwner", () => {
  test("missing → workspace_not_found", async () => {
    s.wsFindById.mockResolvedValue(null as never);
    expect(await appErrorCode(WorkspaceService.assertWorkspaceOwner(fakeDb, OWNER, "w1"))).toBe(
      "workspace_not_found",
    );
  });

  test("requireActive + archived → workspace_archived", async () => {
    s.wsFindById.mockResolvedValue(makeWorkspace({ status: "archived" }));
    expect(
      await appErrorCode(
        WorkspaceService.assertWorkspaceOwner(fakeDb, OWNER, "w1", { requireActive: true }),
      ),
    ).toBe("workspace_archived");
  });
});

describe("FolderService", () => {
  test("create dedupe: active duplicate → folder_name_exists", async () => {
    s.fFindByName.mockResolvedValue(makeFolder());
    expect(
      await appErrorCode(
        FolderService.create(fakeDb, { ownerUserId: OWNER, workspaceId: "w1", name: "Bab 1" }),
      ),
    ).toBe("folder_name_exists");
    expect(s.fInsert).not.toHaveBeenCalled();
  });

  test("create unique → inserts", async () => {
    s.fFindByName.mockResolvedValue(null as never);
    const res = await FolderService.create(fakeDb, {
      ownerUserId: OWNER,
      workspaceId: "w1",
      name: "Bab Baru",
    });
    expect(res.id).toBeString();
    expect(s.fInsert).toHaveBeenCalledTimes(1);
  });

  test("create in archived workspace → workspace_archived", async () => {
    s.wsFindById.mockResolvedValue(makeWorkspace({ status: "archived" }));
    expect(
      await appErrorCode(
        FolderService.create(fakeDb, { ownerUserId: OWNER, workspaceId: "w1", name: "X" }),
      ),
    ).toBe("workspace_archived");
  });

  test("move to same workspace → no-op (no patch)", async () => {
    s.fFindById.mockResolvedValue(makeFolder({ workspaceId: "w1" }));
    await FolderService.move(fakeDb, { ownerUserId: OWNER, folderId: "f1", targetWorkspaceId: "w1" });
    expect(s.fUpdate).not.toHaveBeenCalled();
  });

  test("move with dup name in target → folder_name_exists", async () => {
    s.fFindById.mockResolvedValue(makeFolder({ workspaceId: "w1" }));
    s.fFindByName.mockResolvedValue(makeFolder({ id: "other" }));
    expect(
      await appErrorCode(
        FolderService.move(fakeDb, { ownerUserId: OWNER, folderId: "f1", targetWorkspaceId: "w2" }),
      ),
    ).toBe("folder_name_exists");
    expect(s.fUpdate).not.toHaveBeenCalled();
  });

  test("move to distinct empty target → re-parents folder", async () => {
    s.fFindById.mockResolvedValue(makeFolder({ workspaceId: "w1" }));
    s.fFindByName.mockResolvedValue(null as never);
    await FolderService.move(fakeDb, { ownerUserId: OWNER, folderId: "f1", targetWorkspaceId: "w2" });
    expect(s.fUpdate).toHaveBeenCalledTimes(1);
  });

  test("remove → soft-deletes", async () => {
    await FolderService.remove(fakeDb, { ownerUserId: OWNER, folderId: "f1" });
    expect(s.fUpdate).toHaveBeenCalledTimes(1);
  });

  test("assertFolderOwner: deleted folder → folder_not_found", async () => {
    s.fFindById.mockResolvedValue(makeFolder({ status: "deleted" }));
    expect(await appErrorCode(FolderService.assertFolderOwner(fakeDb, OWNER, "f1"))).toBe(
      "folder_not_found",
    );
  });
});

describe("resolveAdminOverride — users.role + env bootstrap", () => {
  const makeUser = (over: Record<string, unknown> = {}) =>
    ({
      ownerUserId: OWNER,
      clerkUserId: OWNER,
      email: "user@aqsha.test",
      role: "user",
      ...over,
    }) as never;

  test("users.role = admin → admin (tanpa env)", async () => {
    (UserRepo.findByOwnerUserId as ReturnType<typeof spyOn>).mockResolvedValue(
      makeUser({ role: "admin" }),
    );
    const r = await resolveAdminOverride(fakeDb, OWNER);
    expect(r.isAdmin).toBe(true);
    expect(r.email).toBe("user@aqsha.test");
  });

  test("users.role = user, tanpa env → bukan admin", async () => {
    (UserRepo.findByOwnerUserId as ReturnType<typeof spyOn>).mockResolvedValue(makeUser());
    const r = await resolveAdminOverride(fakeDb, OWNER, "a@b.com");
    expect(r.isAdmin).toBe(false);
  });

  test("bootstrap env: owner id di allowlist → admin tanpa query users", async () => {
    process.env.AQSHA_ADMIN_OWNER_USER_IDS = "x, u1 ,y";
    const r = await resolveAdminOverride(fakeDb, OWNER);
    expect(r.isAdmin).toBe(true);
    expect(UserRepo.findByOwnerUserId).not.toHaveBeenCalled();
  });

  test("bootstrap env: email allowlist case-insensitive → admin", async () => {
    process.env.AQSHA_ADMIN_EMAILS = "Boss@Aqsha.app";
    const r = await resolveAdminOverride(fakeDb, OWNER, "boss@aqsha.app");
    expect(r.isAdmin).toBe(true);
  });

  test("email hanya di users table + env allowlist → admin (fallback email)", async () => {
    process.env.AQSHA_ADMIN_EMAILS = "user@aqsha.test";
    (UserRepo.findByOwnerUserId as ReturnType<typeof spyOn>).mockResolvedValue(makeUser());
    const r = await resolveAdminOverride(fakeDb, OWNER);
    expect(r.isAdmin).toBe(true);
  });
});

describe("keyset cursor round-trip", () => {
  test("encode → decode preserves (u,i)", () => {
    const c = { u: 1718900000000, i: "abc-123" };
    expect(decodeKeysetCursor(encodeKeysetCursor(c))).toEqual(c);
  });

  test("garbage / empty → null", () => {
    expect(decodeKeysetCursor("not-base64-json")).toBeNull();
    expect(decodeKeysetCursor(null)).toBeNull();
    expect(decodeKeysetCursor("")).toBeNull();
  });
});
