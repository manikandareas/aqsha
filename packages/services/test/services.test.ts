import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AppError, InterestRepo, OnboardingRepo, UserRepo, WorkspaceRepo } from "@aqsha/db";
import { InterestService } from "../src/interest.service";
import { OnboardingService } from "../src/onboarding.service";
import { UserService } from "../src/user.service";

// fakeDb.transaction(fn) menjalankan fn dengan tx=fakeDb; repo di-spy jadi tx tak dipakai.
const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;
const identity = { ownerUserId: "u1", clerkUserId: "u1", email: "a@b.com" };

const makeUser = (over: Record<string, unknown> = {}) =>
  ({
    ownerUserId: "u1",
    clerkUserId: "u1",
    email: "a@b.com",
    emailVerified: true,
    name: null,
    image: null,
    createdAt: 1,
    updatedAt: 1,
    deletionRequestedAt: null,
    deletionCompletedAt: null,
    ...over,
  }) as never;

let s: {
  userFind: ReturnType<typeof spyOn>;
  userFindClerk: ReturnType<typeof spyOn>;
  userInsert: ReturnType<typeof spyOn>;
  userPatch: ReturnType<typeof spyOn>;
  wsFind: ReturnType<typeof spyOn>;
  wsInsert: ReturnType<typeof spyOn>;
  obFind: ReturnType<typeof spyOn>;
  obUpsert: ReturnType<typeof spyOn>;
  interestUpsert: ReturnType<typeof spyOn>;
};

beforeEach(() => {
  s = {
    userFind: spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue(makeUser()),
    userFindClerk: spyOn(UserRepo, "findByClerkUserId").mockResolvedValue(null as never),
    userInsert: spyOn(UserRepo, "insert").mockResolvedValue(undefined),
    userPatch: spyOn(UserRepo, "patch").mockResolvedValue(undefined),
    wsFind: spyOn(WorkspaceRepo, "findNewestByOwner").mockResolvedValue({ id: "w1" } as never),
    wsInsert: spyOn(WorkspaceRepo, "insert").mockResolvedValue(undefined),
    obFind: spyOn(OnboardingRepo, "findByOwner").mockResolvedValue(null as never),
    obUpsert: spyOn(OnboardingRepo, "upsert").mockResolvedValue(undefined),
    interestUpsert: spyOn(InterestRepo, "upsertRaiseOnly").mockResolvedValue(undefined),
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

const validComplete = {
  background: "peneliti",
  interests: ["ai_cs", "biologi", "fisika"],
  heardAboutSource: "teman",
};

describe("OnboardingService.complete validation", () => {
  test("tolak background tidak valid", async () => {
    expect(
      await appErrorCode(
        OnboardingService.complete(fakeDb, identity, { ...validComplete, background: "astronaut" }),
      ),
    ).toBe("onboarding_background_invalid");
  });

  test("tolak <3 interest setelah dedup + filter id invalid", async () => {
    expect(
      await appErrorCode(
        OnboardingService.complete(fakeDb, identity, {
          ...validComplete,
          // ai_cs duplikat + 2 id tak dikenal → hanya 1 valid → < MIN_INTERESTS
          interests: ["ai_cs", "ai_cs", "tidak_ada", "ngawur"],
        }),
      ),
    ).toBe("interests_too_few");
  });

  test("tolak sumber tidak valid", async () => {
    expect(
      await appErrorCode(
        OnboardingService.complete(fakeDb, identity, { ...validComplete, heardAboutSource: "koran" }),
      ),
    ).toBe("source_invalid");
  });

  test("tolak source=lainnya tanpa heardAboutOther", async () => {
    expect(
      await appErrorCode(
        OnboardingService.complete(fakeDb, identity, {
          ...validComplete,
          heardAboutSource: "lainnya",
          heardAboutOther: "   ",
        }),
      ),
    ).toBe("source_other_required");
  });

  test("happy path: upsert onboarding + seed topics weight 2", async () => {
    const res = await OnboardingService.complete(fakeDb, identity, validComplete);
    expect(res).toEqual({ ok: true });
    expect(s.obUpsert).toHaveBeenCalledTimes(1);
    // ai_cs(3) + biologi(2) + fisika(1) = 6 topic unik
    const topics = s.interestUpsert.mock.calls.map((c: unknown[]) => (c[1] as { topic: string }).topic);
    expect(topics.sort()).toEqual(
      [
        "artificial intelligence",
        "machine learning",
        "computer science",
        "biology",
        "genetics",
        "physics",
      ].sort(),
    );
    expect((s.interestUpsert.mock.calls[0]![1] as { weight: number }).weight).toBe(2);
  });
});

describe("InterestService.seedFeedInterests", () => {
  test("dedup + normalize sebelum upsert", async () => {
    await InterestService.seedFeedInterests(
      fakeDb,
      "u1",
      ["physics", "Physics", " physics ", "biology"],
      2,
    );
    const topics = s.interestUpsert.mock.calls.map((c: unknown[]) => (c[1] as { topic: string }).topic);
    expect(topics).toEqual(["physics", "biology"]);
  });
});

describe("UserService.ensureCurrentUser", () => {
  test("idempotent: workspace tidak dibuat dua kali bila sudah ada", async () => {
    await UserService.ensureCurrentUser(fakeDb, identity);
    expect(s.wsInsert).not.toHaveBeenCalled();
  });

  test("buat default workspace bila belum ada", async () => {
    s.wsFind.mockResolvedValue(null as never);
    await UserService.ensureCurrentUser(fakeDb, identity);
    expect(s.wsInsert).toHaveBeenCalledTimes(1);
  });

  test("pertahankan name yang sudah di-set saat patch", async () => {
    s.userFind.mockResolvedValue(makeUser({ name: "Vito" }));
    await UserService.ensureCurrentUser(fakeDb, identity);
    const patchArg = s.userPatch.mock.calls[0]![2] as { name?: string };
    expect(patchArg.name).toBe("Vito");
  });

  test("insert user baru bila belum ada", async () => {
    s.userFind.mockResolvedValue(null as never);
    await UserService.ensureCurrentUser(fakeDb, identity);
    expect(s.userInsert).toHaveBeenCalledTimes(1);
  });
});

describe("UserService profile + display name", () => {
  test("getCurrentUserProfile 409 bila row tak ada", async () => {
    s.userFind.mockResolvedValue(null as never);
    try {
      await UserService.getCurrentUserProfile(fakeDb, "u1");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("user_not_synced");
      expect((e as AppError).status).toBe(409);
    }
  });

  test("updateDisplayName tolak kosong", async () => {
    expect(await appErrorCode(UserService.updateDisplayName(fakeDb, "u1", "   "))).toBe(
      "display_name_required",
    );
  });

  test("updateDisplayName tolak > 120 karakter", async () => {
    expect(await appErrorCode(UserService.updateDisplayName(fakeDb, "u1", "x".repeat(121)))).toBe(
      "display_name_too_long",
    );
  });

  test("updateDisplayName trim + patch", async () => {
    const res = await UserService.updateDisplayName(fakeDb, "u1", "  Vito  ");
    expect(res).toEqual({ ok: true });
    expect((s.userPatch.mock.calls[0]![2] as { name: string }).name).toBe("Vito");
  });
});

describe("UserService.applyClerkUserUpsert (webhook)", () => {
  test("user ada: patch email saja (name tidak ditimpa)", async () => {
    s.userFindClerk.mockResolvedValue(makeUser({ name: "Vito" }));
    await UserService.applyClerkUserUpsert(fakeDb, { clerkUserId: "u1", email: "new@b.com" });
    const patchArg = s.userPatch.mock.calls[0]![2] as Record<string, unknown>;
    expect(patchArg.email).toBe("new@b.com");
    expect("name" in patchArg).toBe(false);
  });

  test("user belum ada: insert minimal (ownerUserId == clerkUserId)", async () => {
    s.userFindClerk.mockResolvedValue(null as never);
    await UserService.applyClerkUserUpsert(fakeDb, { clerkUserId: "u9", email: null });
    const insertArg = s.userInsert.mock.calls[0]![1] as { ownerUserId: string; clerkUserId: string };
    expect(insertArg.ownerUserId).toBe("u9");
    expect(insertArg.clerkUserId).toBe("u9");
  });
});
