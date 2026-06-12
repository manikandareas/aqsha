import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import { BUILTIN_SKILL_DOCS } from "./builtin";
import { findActivatableSkill, loadCatalogSkills } from "./skillRegistry";
import { parseSkillMarkdown, skillChecksum } from "./skillParser";

function readVersion(metadataJson: string | undefined): string {
  if (!metadataJson) return "1.0";
  try {
    const meta = JSON.parse(metadataJson) as { version?: unknown };
    return typeof meta.version === "string" ? meta.version : "1.0";
  } catch {
    return "1.0";
  }
}

// Read the routing-hint keywords persisted inside metadataJson (the parser folds
// frontmatter `metadata.triggerKeywords` into metadata). Used by listCatalog so
// the deterministic domain-pack scorer can match Indonesian prompts against an
// English catalog description. Returns [] when absent/malformed.
function readTriggerKeywords(metadataJson: string | undefined): string[] {
  if (!metadataJson) return [];
  try {
    const meta = JSON.parse(metadataJson) as { triggerKeywords?: unknown };
    return Array.isArray(meta.triggerKeywords)
      ? meta.triggerKeywords.filter((k): k is string => typeof k === "string")
      : [];
  } catch {
    return [];
  }
}

// Bounded read of builtin skill rows — the curated builtin set is small (≤ tens),
// so this scoped scan stays well within limits (mirrors loadCatalogSkills).
const BUILTIN_SCAN_LIMIT = 100;

// Seed/refresh builtin skills from the bundled SKILL.md constants. Idempotent:
// inserts new skills, patches changed ones (checksum compare), and PRUNES builtin
// rows whose name is no longer in the bundle (so a skill rename doesn't orphan the
// old name in the catalog). Safe to run on every deploy. Run via:
// npx convex run agent/skills/skills:seedBuiltinSkills
export const seedBuiltinSkills = internalMutation({
  args: {},
  returns: v.object({
    seeded: v.number(),
    updated: v.number(),
    skipped: v.number(),
    pruned: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let seeded = 0;
    let updated = 0;
    let skipped = 0;
    let pruned = 0;
    const desiredNames = new Set<string>();
    for (const doc of BUILTIN_SKILL_DOCS) {
      const parsed = parseSkillMarkdown(doc);
      if (!parsed || !parsed.name) {
        continue; // invalid builtin — skip (parser already enforces description)
      }
      desiredNames.add(parsed.name);
      const version = readVersion(parsed.metadataJson);
      const checksum = skillChecksum(
        // triggerKeywords ride in metadataJson; fold it in so keyword-only edits re-seed.
        `${parsed.name}:${version}:${parsed.description}:${parsed.body}:${parsed.metadataJson ?? ""}`,
      );
      const existing = await ctx.db
        .query("skills")
        .withIndex("by_scope_name", (q) =>
          q.eq("scope", "builtin").eq("name", parsed.name),
        )
        .unique();
      const value = {
        scope: "builtin" as const,
        name: parsed.name,
        description: parsed.description,
        version,
        checksum,
        enabled: true,
        bodyText: parsed.body,
        resourcesJson: "[]",
        hasScripts: false,
        metadataJson: parsed.metadataJson,
        updatedAt: now,
      };
      if (!existing) {
        await ctx.db.insert("skills", { ...value, createdAt: now });
        seeded += 1;
      } else if (existing.checksum !== checksum) {
        await ctx.db.patch("skills", existing._id, value);
        updated += 1;
      } else {
        skipped += 1;
      }
    }
    // Prune renamed/removed builtins. The index scopes the scan to scope="builtin",
    // so user/workspace skills (by_owner_enabled) are never reached; the defensive
    // guard keeps it true even if the query changes. Dangling skillActivations
    // degrade silently (loadActiveSkillBodies null-guards ctx.db.get), and renamed
    // skills get a fresh _id on re-insert so historical activations still reference
    // the old methodology version (provenance preserved, not corrupted).
    const builtinRows = await ctx.db
      .query("skills")
      .withIndex("by_scope_name", (q) => q.eq("scope", "builtin"))
      .take(BUILTIN_SCAN_LIMIT);
    for (const row of builtinRows) {
      if (row.scope !== "builtin") continue;
      if (!desiredNames.has(row.name)) {
        await ctx.db.delete("skills", row._id);
        pruned += 1;
      }
    }
    return { seeded, updated, skipped, pruned };
  },
});

// Tier-1 catalog for the per-turn enum + (separately) the context block.
export const listCatalog = internalQuery({
  args: { ownerUserId: v.string() },
  handler: async (ctx, args) => {
    const skills = await loadCatalogSkills(ctx, args.ownerUserId);
    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      triggerKeywords: readTriggerKeywords(skill.metadataJson),
      hasScripts: skill.hasScripts,
    }));
  },
});

// Resolve a skill the model asked to activate (owner-scoped: builtin or owned).
export const getActivatable = internalQuery({
  args: { ownerUserId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const skill = await findActivatableSkill(ctx, args.ownerUserId, args.name);
    if (!skill) return null;
    return {
      skillId: skill._id,
      name: skill.name,
      version: skill.version,
      bodyText: skill.bodyText,
      hasScripts: skill.hasScripts,
      resourcesJson: skill.resourcesJson,
    };
  },
});

// Record an activation (dedup per thread) + a provenance event so the report can
// cite which methodology version was used.
export const recordActivation = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    skillId: v.id("skills"),
    skillName: v.string(),
    skillVersion: v.string(),
    activatedBy: v.union(v.literal("model"), v.literal("user")),
  },
  returns: v.object({ deduped: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("skillActivations")
      .withIndex("by_owner_thread", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId),
      )
      .take(100);
    const already = existing.some((row) => row.skillId === args.skillId);
    if (already) {
      return { deduped: true };
    }
    const now = Date.now();
    await ctx.db.insert("skillActivations", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      skillId: args.skillId,
      skillVersion: args.skillVersion,
      activatedBy: args.activatedBy,
      createdAt: now,
    });
    if (args.runId) {
      await ctx.db.insert("agentRunEvents", {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        eventType: "skill_activated",
        title: "Skill diaktifkan",
        summary: `Mengaktifkan "${args.skillName}" (v${args.skillVersion})`,
        createdAt: now,
      });
    }
    return { deduped: false };
  },
});

// Resolve a skill resource manifest entry (references/assets). Builtin skills
// ship no resources in v1, so this returns null until user skills upload them.
export const getResource = internalQuery({
  args: { ownerUserId: v.string(), name: v.string(), path: v.string() },
  returns: v.union(
    v.null(),
    v.object({ storageId: v.id("_storage"), kind: v.string() }),
  ),
  handler: async (ctx, args) => {
    const skill = await findActivatableSkill(ctx, args.ownerUserId, args.name);
    if (!skill) return null;
    try {
      const manifest = JSON.parse(skill.resourcesJson) as Array<{
        path?: unknown;
        storageId?: unknown;
        kind?: unknown;
      }>;
      const entry = manifest.find((item) => item.path === args.path);
      if (
        !entry ||
        typeof entry.storageId !== "string" ||
        typeof entry.kind !== "string"
      ) {
        return null;
      }
      return {
        storageId: entry.storageId as import("../../_generated/dataModel").Id<"_storage">,
        kind: entry.kind,
      };
    } catch {
      return null;
    }
  },
});
