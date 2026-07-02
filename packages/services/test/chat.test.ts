import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AppError, ChatThreadRepo, ResearchSourceRepo } from "@aqsha/db";
import { ThreadService } from "../src/chat";

// fakeDb.transaction(fn) menjalankan fn dengan tx=fakeDb; repo di-spy jadi tx tak dipakai.
const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;

const OWNER = "user_1";
const SID = "astra:sess-1";

const makeThread = (over: Record<string, unknown> = {}) =>
  ({
    id: SID,
    ownerUserId: OWNER,
    title: null,
    titleStatus: null,
    status: "idle",
    agentKind: "lite",
    lastMessagePreview: null,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }) as never;

let s: {
  findById: ReturnType<typeof spyOn>;
  update: ReturnType<typeof spyOn>;
  deleteById: ReturnType<typeof spyOn>;
  listByOwner: ReturnType<typeof spyOn>;
  srcDelete: ReturnType<typeof spyOn>;
};

beforeEach(() => {
  s = {
    findById: spyOn(ChatThreadRepo, "findById").mockResolvedValue(makeThread()),
    update: spyOn(ChatThreadRepo, "update").mockResolvedValue(undefined),
    deleteById: spyOn(ChatThreadRepo, "deleteById").mockResolvedValue(undefined),
    listByOwner: spyOn(ChatThreadRepo, "listByOwner").mockResolvedValue({
      items: [],
      nextCursor: null,
    } as never),
    srcDelete: spyOn(ResearchSourceRepo, "deleteByThread").mockResolvedValue(undefined),
  };
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

describe("ThreadService.get / assertOwner", () => {
  test("get cross-owner → null", async () => {
    s.findById.mockResolvedValue(makeThread({ ownerUserId: "other" }));
    expect(await ThreadService.get(fakeDb, OWNER, SID)).toBeNull();
  });
  test("assertOwner missing → thread_not_found", async () => {
    s.findById.mockResolvedValue(null as never);
    expect(await appErrorCode(ThreadService.assertOwner(fakeDb, OWNER, SID))).toBe("thread_not_found");
  });
  test("assertOwner cross-owner → thread_not_found", async () => {
    s.findById.mockResolvedValue(makeThread({ ownerUserId: "other" }));
    expect(await appErrorCode(ThreadService.assertOwner(fakeDb, OWNER, SID))).toBe("thread_not_found");
  });
});

describe("ThreadService.list", () => {
  test("delegates keyset to repo", async () => {
    await ThreadService.list(fakeDb, OWNER, { limit: 10 });
    expect(s.listByOwner).toHaveBeenCalledTimes(1);
    const args = s.listByOwner.mock.calls[0][1] as { ownerUserId: string; limit: number };
    expect(args.ownerUserId).toBe(OWNER);
    expect(args.limit).toBe(10);
  });
});

describe("ThreadService.rename", () => {
  test("empty title → bad_request, no update", async () => {
    expect(
      await appErrorCode(ThreadService.rename(fakeDb, { ownerUserId: OWNER, threadId: SID, title: "  " })),
    ).toBe("bad_request");
    expect(s.update).not.toHaveBeenCalled();
  });
  test("valid → titleStatus ready", async () => {
    await ThreadService.rename(fakeDb, { ownerUserId: OWNER, threadId: SID, title: " Riset ku " });
    const patch = s.update.mock.calls[0][2] as Record<string, unknown>;
    expect(patch.title).toBe("Riset ku");
    expect(patch.titleStatus).toBe("ready");
  });
  test("cross-owner → thread_not_found", async () => {
    s.findById.mockResolvedValue(makeThread({ ownerUserId: "other" }));
    expect(
      await appErrorCode(ThreadService.rename(fakeDb, { ownerUserId: OWNER, threadId: SID, title: "X" })),
    ).toBe("thread_not_found");
  });
});

describe("ThreadService.remove", () => {
  test("deletes research sources then thread (FK no-cascade)", async () => {
    await ThreadService.remove(fakeDb, { ownerUserId: OWNER, threadId: SID });
    expect(s.srcDelete).toHaveBeenCalledTimes(1);
    expect(s.deleteById).toHaveBeenCalledTimes(1);
  });
  test("cross-owner → thread_not_found, no delete", async () => {
    s.findById.mockResolvedValue(makeThread({ ownerUserId: "other" }));
    expect(
      await appErrorCode(ThreadService.remove(fakeDb, { ownerUserId: OWNER, threadId: SID })),
    ).toBe("thread_not_found");
    expect(s.deleteById).not.toHaveBeenCalled();
  });
});
