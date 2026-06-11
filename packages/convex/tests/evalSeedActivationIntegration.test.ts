/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { BUILTIN_SKILL_DOCS } from "../convex/agent/skills/builtin";

// Layer-B-in-process integration eval (Slice 3.3), mirroring usageRollup.test.ts:
// exercise the real seed -> catalog -> activate -> dedup path against an in-memory
// Convex schema (convex-test) — no live preview deployment needed. The live
// preview job in CI is reserved for `convex dev --once` schema validation + a
// non-blocking mocked smoke.

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-skills-eval";

describe("skills seed -> catalog -> activate -> dedup", () => {
  it("seeds every builtin and is idempotent by checksum", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.agent.skills.skills.seedBuiltinSkills, {});
    expect(first.seeded).toBe(BUILTIN_SKILL_DOCS.length);
    expect(first.updated).toBe(0);

    const second = await t.mutation(internal.agent.skills.skills.seedBuiltinSkills, {});
    expect(second).toEqual({ seeded: 0, updated: 0, skipped: BUILTIN_SKILL_DOCS.length });
  });

  it("lists the seeded builtins in the tier-1 catalog", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.agent.skills.skills.seedBuiltinSkills, {});
    const catalog = await t.query(internal.agent.skills.skills.listCatalog, {
      ownerUserId: OWNER,
    });
    expect(catalog.length).toBe(BUILTIN_SKILL_DOCS.length);
    const names = catalog.map((c) => c.name);
    expect(names).toContain("stat-verification");
    expect(names).toContain("citation-verification");
    expect(names).toContain("deep-research-guide");
  });

  it("activates a skill once per thread and dedups the repeat", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.agent.skills.skills.seedBuiltinSkills, {});
    const skill = await t.query(internal.agent.skills.skills.getActivatable, {
      ownerUserId: OWNER,
      name: "stat-verification",
    });
    expect(skill).not.toBeNull();
    const threadId = "thread-eval-1";
    const activate = () =>
      t.mutation(internal.agent.skills.skills.recordActivation, {
        ownerUserId: OWNER,
        threadId,
        skillId: skill!.skillId,
        skillName: skill!.name,
        skillVersion: skill!.version,
        activatedBy: "model" as const,
      });

    expect(await activate()).toEqual({ deduped: false });
    expect(await activate()).toEqual({ deduped: true });
  });

  it("resolves null for an unknown skill name", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.agent.skills.skills.seedBuiltinSkills, {});
    const missing = await t.query(internal.agent.skills.skills.getActivatable, {
      ownerUserId: OWNER,
      name: "does-not-exist",
    });
    expect(missing).toBeNull();
  });
});
