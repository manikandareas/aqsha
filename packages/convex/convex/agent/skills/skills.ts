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

// Seed/refresh builtin skills from the bundled SKILL.md constants. Idempotent:
// only inserts new skills or patches changed ones (checksum compare), so it is
// safe to run on every deploy. Run via: npx convex run agent/skills/skills:seedBuiltinSkills
export const seedBuiltinSkills = internalMutation({
  args: {},
  returns: v.object({
    seeded: v.number(),
    updated: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let seeded = 0;
    let updated = 0;
    let skipped = 0;
    for (const doc of BUILTIN_SKILL_DOCS) {
      const parsed = parseSkillMarkdown(doc);
      if (!parsed || !parsed.name) {
        continue; // invalid builtin — skip (parser already enforces description)
      }
      const version = readVersion(parsed.metadataJson);
      const checksum = skillChecksum(
        `${parsed.name}:${version}:${parsed.description}:${parsed.body}`,
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
    return { seeded, updated, skipped };
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
