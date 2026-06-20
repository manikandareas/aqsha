/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { exploreCacheKey } from "../convex/explore/model";

const modules = import.meta.glob("../convex/**/*.ts");

// In an action, requireCurrentUser resolves user._id to identity.tokenIdentifier
// (currentUserFromIdentity), the same owner key getFeed/onboarding use to store
// userFeedInterests — so seeding interests by tokenIdentifier is sufficient.
function seedResponse(generatedAt: number) {
  return {
    items: [],
    mode: "recommendations" as const,
    query: "",
    providerStatus: [],
    generatedAt,
    cached: false,
  };
}

async function primeCache(
  t: ReturnType<typeof convexTest>,
  cacheKey: string,
  generatedAt: number,
) {
  await t.mutation(internal.agent.providers.externalProviders.putCache, {
    provider: "explore",
    cacheKey,
    status: "ready",
    valueJson: JSON.stringify(seedResponse(generatedAt)),
  });
}

describe("interest-seeded recommendations cache isolation", () => {
  it("serves each user their own interest-keyed cache and never another's", async () => {
    const t = convexTest(schema, modules);
    const ownerA = "owner-reco-a";
    const ownerB = "owner-reco-b";
    const now = 1_700_000_000_000;

    await t.run(async (ctx) => {
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: ownerA,
        topic: "medicine",
        weight: 5,
        updatedAt: now,
      });
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: ownerB,
        topic: "physics",
        weight: 5,
        updatedAt: now,
      });
    });

    // The seed (top interest topics) is folded into the cache key, so the two
    // profiles resolve to distinct keys.
    const keyA = exploreCacheKey({
      mode: "recommendations",
      query: "",
      limit: 12,
      seed: "medicine",
    });
    const keyB = exploreCacheKey({
      mode: "recommendations",
      query: "",
      limit: 12,
      seed: "physics",
    });
    expect(keyA).not.toBe(keyB);

    const MARKER_A = 111;
    const MARKER_B = 222;
    await primeCache(t, keyA, MARKER_A);
    await primeCache(t, keyB, MARKER_B);

    // Each user, in recommendations mode (empty query, interestSeed default-on),
    // reads ONLY their own interest-keyed cache entry.
    const resultA = await t
      .withIdentity({ tokenIdentifier: ownerA, subject: ownerA })
      .action(api.explore.searchPapers, {});
    expect(resultA.cached).toBe(true);
    expect(resultA.generatedAt).toBe(MARKER_A);

    const resultB = await t
      .withIdentity({ tokenIdentifier: ownerB, subject: ownerB })
      .action(api.explore.searchPapers, {});
    expect(resultB.cached).toBe(true);
    expect(resultB.generatedAt).toBe(MARKER_B);
  });

  it("keeps cold-start users on the generic (seed-less) cache key", async () => {
    const t = convexTest(schema, modules);
    const owner = "owner-reco-cold";

    // A user with no interests → no seed → the generic recommendation key.
    const genericKey = exploreCacheKey({
      mode: "recommendations",
      query: "",
      limit: 12,
    });
    const seededKey = exploreCacheKey({
      mode: "recommendations",
      query: "",
      limit: 12,
      seed: "medicine",
    });
    expect(genericKey).not.toBe(seededKey);

    const MARKER_GENERIC = 333;
    await primeCache(t, genericKey, MARKER_GENERIC);

    const result = await t
      .withIdentity({ tokenIdentifier: owner, subject: owner })
      .action(api.explore.searchPapers, {});
    expect(result.cached).toBe(true);
    expect(result.generatedAt).toBe(MARKER_GENERIC);
  });

  it("does not seed the cache key when interestSeed is disabled", async () => {
    const t = convexTest(schema, modules);
    const owner = "owner-reco-optout";
    const now = 1_700_000_000_000;

    await t.run(async (ctx) => {
      await ctx.db.insert("userFeedInterests", {
        ownerUserId: owner,
        topic: "medicine",
        weight: 5,
        updatedAt: now,
      });
    });

    // interestSeed:false bypasses the interest fetch entirely, so even a user
    // WITH interests resolves to the generic key.
    const genericKey = exploreCacheKey({
      mode: "recommendations",
      query: "",
      limit: 12,
    });
    const MARKER = 444;
    await primeCache(t, genericKey, MARKER);

    const result = await t
      .withIdentity({ tokenIdentifier: owner, subject: owner })
      .action(api.explore.searchPapers, { interestSeed: false });
    expect(result.cached).toBe(true);
    expect(result.generatedAt).toBe(MARKER);
  });
});
