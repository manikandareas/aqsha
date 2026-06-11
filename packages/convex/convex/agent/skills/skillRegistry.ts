import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

// Plain helpers (no Convex registration) for the skills runtime. Reused by the
// context assembler (a MutationCtx, where these DB reads are valid — unlike blob
// reads) AND the registered functions/tools, so the catalog/activation logic
// lives in one place.

const CATALOG_LIMIT = 50;
const ACTIVATION_SCAN = 100;

type SkillCtx = QueryCtx | MutationCtx;

// Enabled skills visible to a user: builtin (curated) + the user's own. On a
// name collision the more specific scope wins (user overrides builtin), matching
// the spec's precedence. Workspace-scoped skills are a later slice.
export async function loadCatalogSkills(
  ctx: SkillCtx,
  ownerUserId: string,
): Promise<Doc<"skills">[]> {
  const [builtin, owned] = await Promise.all([
    ctx.db
      .query("skills")
      .withIndex("by_scope_name", (q) => q.eq("scope", "builtin"))
      .take(CATALOG_LIMIT),
    ctx.db
      .query("skills")
      .withIndex("by_owner_enabled", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("enabled", true),
      )
      .take(CATALOG_LIMIT),
  ]);
  const byName = new Map<string, Doc<"skills">>();
  for (const skill of builtin) {
    if (skill.enabled) byName.set(skill.name, skill);
  }
  for (const skill of owned) {
    byName.set(skill.name, skill); // user overrides builtin
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function findActivatableSkill(
  ctx: SkillCtx,
  ownerUserId: string,
  name: string,
): Promise<Doc<"skills"> | null> {
  const skills = await loadCatalogSkills(ctx, ownerUserId);
  return skills.find((skill) => skill.name === name) ?? null;
}

// Bodies of skills already activated in this thread, deduped by skill, most
// recent first. This is the source the context assembler re-injects each turn so
// activated skills survive message compaction/pruning (the spec's warning).
export async function loadActiveSkillBodies(
  ctx: SkillCtx,
  ownerUserId: string,
  threadId: string,
): Promise<Array<{ name: string; body: string }>> {
  const activations = await ctx.db
    .query("skillActivations")
    .withIndex("by_owner_thread", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("threadId", threadId),
    )
    .order("desc")
    .take(ACTIVATION_SCAN);
  const seen = new Set<string>();
  const bodies: Array<{ name: string; body: string }> = [];
  for (const activation of activations) {
    if (seen.has(activation.skillId)) continue;
    seen.add(activation.skillId);
    const skill = await ctx.db.get("skills", activation.skillId);
    if (skill && skill.enabled) {
      bodies.push({ name: skill.name, body: skill.bodyText });
    }
  }
  return bodies;
}

// ── Context block builders (pure) ─────────────────────────────────────────────

// Tier-1 catalog: name + description of each enabled skill (~100 tok each).
export function buildSkillCatalogBlock(skills: Doc<"skills">[]): string {
  if (skills.length === 0) return "";
  const lines = skills.map((skill) => `- ${skill.name}: ${skill.description}`);
  return [
    "<available_skills>",
    "Skill metodologi yang tersedia. Aktifkan dengan tool activate_skill HANYA saat relevan dengan tugas; jangan aktifkan tanpa alasan.",
    ...lines,
    "</available_skills>",
  ].join("\n");
}

// Tier-2 re-injection: full body of every skill activated this thread. Tagged so
// it is identifiable during context audits and protected by re-materialization.
export function buildActiveSkillBlock(
  bodies: Array<{ name: string; body: string }>,
): string {
  if (bodies.length === 0) return "";
  return bodies
    .map((b) => `<skill_content name="${b.name}">\n${b.body}\n</skill_content>`)
    .join("\n\n");
}
