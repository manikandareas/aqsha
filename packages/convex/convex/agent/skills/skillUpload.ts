import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { requireCurrentUser } from "../../auth";
import { throwAppError } from "../../lib/appError";
import { parseSkillMarkdown, skillChecksum, type ParsedSkill } from "./skillParser";

// User / workspace Agent Skill upload (Phase 3, Slice 3.4 PART A). A user pastes
// or uploads a SKILL.md (agentskills.io); we parse + validate it with the same
// pure parser the builtins use, store the body INLINE (so the MutationCtx context
// assembler can re-inject it), and scope it to the user or a workspace they own.
//
// v1 is TEXT-ONLY: a pasted SKILL.md has no scripts/ folder, so hasScripts is
// always false and no script runs in Convex. Resource/script upload (and its
// informed-consent gate at activation time, already wired in skillTools.ts) is a
// follow-up once blob upload lands. The apps/web Settings "Skills" route is the
// deferred frontend that drives these mutations.

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const OWNED_SCAN = 200;

function readVersion(metadataJson: string | undefined): string {
  if (!metadataJson) return "1.0";
  try {
    const meta = JSON.parse(metadataJson) as { version?: unknown };
    return typeof meta.version === "string" ? meta.version : "1.0";
  } catch {
    return "1.0";
  }
}

function validateUpload(skillMarkdown: string): ParsedSkill {
  const parsed = parseSkillMarkdown(skillMarkdown);
  if (!parsed || !parsed.name) {
    throwAppError({
      code: "invalid_skill",
      message: "SKILL.md tidak valid: butuh frontmatter dengan name dan description.",
      severity: "error",
    });
    throw new Error("unreachable");
  }
  if (parsed.name.length > NAME_MAX) {
    throwAppError({ code: "invalid_skill", message: `Nama skill maksimal ${NAME_MAX} karakter.`, field: "name" });
  }
  if (parsed.description.length > DESCRIPTION_MAX) {
    throwAppError({
      code: "invalid_skill",
      message: `Deskripsi skill maksimal ${DESCRIPTION_MAX} karakter.`,
      field: "description",
    });
  }
  return parsed;
}

async function ownedSkills(ctx: MutationCtx, ownerUserId: string): Promise<Doc<"skills">[]> {
  return ctx.db
    .query("skills")
    .withIndex("by_owner_enabled", (q) => q.eq("ownerUserId", ownerUserId))
    .take(OWNED_SCAN);
}

async function assertNameFree(ctx: MutationCtx, ownerUserId: string, name: string) {
  const existing = await ownedSkills(ctx, ownerUserId);
  if (existing.some((skill) => skill.name === name)) {
    throwAppError({
      code: "skill_exists",
      message: `Kamu sudah punya skill bernama "${name}". Hapus atau ganti nama dulu.`,
      field: "name",
    });
  }
}

export const createOwnerSkill = mutation({
  args: { skillMarkdown: v.string() },
  returns: v.object({ skillId: v.id("skills") }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const parsed = validateUpload(args.skillMarkdown);
    await assertNameFree(ctx, user._id, parsed.name);
    const version = readVersion(parsed.metadataJson);
    const now = Date.now();
    const skillId = await ctx.db.insert("skills", {
      ownerUserId: user._id,
      scope: "user",
      name: parsed.name,
      description: parsed.description,
      version,
      checksum: skillChecksum(`${parsed.name}:${version}:${parsed.description}:${parsed.body}`),
      enabled: true,
      bodyText: parsed.body,
      resourcesJson: "[]",
      hasScripts: false,
      metadataJson: parsed.metadataJson,
      createdAt: now,
      updatedAt: now,
    });
    return { skillId };
  },
});

export const createWorkspaceSkill = mutation({
  args: { workspaceId: v.id("workspaces"), skillMarkdown: v.string() },
  returns: v.object({ skillId: v.id("skills") }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace || workspace.ownerUserId !== user._id) {
      throwAppError({ code: "workspace_not_found", message: "Workspace tidak ditemukan.", severity: "error" });
    }
    const parsed = validateUpload(args.skillMarkdown);
    await assertNameFree(ctx, user._id, parsed.name);
    const version = readVersion(parsed.metadataJson);
    const now = Date.now();
    const skillId = await ctx.db.insert("skills", {
      ownerUserId: user._id,
      scope: "workspace",
      workspaceId: args.workspaceId,
      name: parsed.name,
      description: parsed.description,
      version,
      checksum: skillChecksum(`${parsed.name}:${version}:${parsed.description}:${parsed.body}`),
      enabled: true,
      bodyText: parsed.body,
      resourcesJson: "[]",
      hasScripts: false,
      metadataJson: parsed.metadataJson,
      createdAt: now,
      updatedAt: now,
    });
    return { skillId };
  },
});

async function assertOwnedSkill(ctx: MutationCtx, skillId: Doc<"skills">["_id"], ownerUserId: string) {
  const skill = await ctx.db.get("skills", skillId);
  if (!skill || skill.scope === "builtin" || skill.ownerUserId !== ownerUserId) {
    throwAppError({ code: "skill_not_found", message: "Skill tidak ditemukan.", severity: "error" });
    throw new Error("unreachable");
  }
  return skill;
}

export const setSkillEnabled = mutation({
  args: { skillId: v.id("skills"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertOwnedSkill(ctx, args.skillId, user._id);
    await ctx.db.patch("skills", args.skillId, { enabled: args.enabled, updatedAt: Date.now() });
    return null;
  },
});

export const deleteSkill = mutation({
  args: { skillId: v.id("skills") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertOwnedSkill(ctx, args.skillId, user._id);
    await ctx.db.delete("skills", args.skillId);
    return null;
  },
});

export const listOwnedSkills = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_owner_enabled", (q) => q.eq("ownerUserId", user._id))
      .take(OWNED_SCAN);
    return skills.map((skill) => ({
      _id: skill._id,
      scope: skill.scope,
      workspaceId: skill.workspaceId,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      enabled: skill.enabled,
      hasScripts: skill.hasScripts,
      updatedAt: skill.updatedAt,
    }));
  },
});
