/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

const OWNER = "owner-explore-exa";
const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

// Exa was removed from the explore fallback chain, but the "Exa" literal stays
// in exploreProviderValidator (additive) so previously-cached explorePapers rows
// keep validating. This guards against an accidental validator narrowing, which
// would surface as a ReturnsValidationError on getPaper for a legacy row.
describe("explore Exa backward-compat", () => {
  it("getPaper still reads a stored provider:'Exa' explorePapers row", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        ownerUserId: OWNER,
        clerkUserId: OWNER,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("explorePapers", {
        key: "url:example.com/legacy-exa",
        title: "Legacy Exa paper",
        snippet: "Stored before Exa was removed from explore.",
        url: "https://example.com/legacy-exa",
        provider: "Exa",
        sourceLabel: "example.com",
        authors: [],
        topics: [],
        lastSeenAt: 0,
      });
    });

    const paper = await t
      .withIdentity(IDENTITY)
      .query(api.explore.getPaper, { key: "url:example.com/legacy-exa" });
    expect(paper?.provider).toBe("Exa");
    expect(paper?.title).toBe("Legacy Exa paper");
  });
});
