/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// Slice 3.4: user/workspace SKILL.md upload (text-only, hasScripts=false v1).

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-skill-upload";
const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

// requireCurrentUser resolves the users row by ownerUserId === tokenIdentifier,
// so each test seeds a synced user (and the intruder) before authenticating.
async function syncedSession() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("users", { ownerUserId: OWNER, clerkUserId: OWNER, createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { ownerUserId: "intruder", clerkUserId: "intruder", createdAt: now, updatedAt: now });
  });
  return t;
}

const VALID_SKILL = `---
name: my-method
description: "A custom research method for testing uploads."
metadata: { version: "1.0" }
---
## Steps
Do the thing carefully and cite every source.
`;

describe("skillUpload", () => {
  it("creates an owner skill and lists it", async () => {
    const t = (await syncedSession()).withIdentity(IDENTITY);
    const { skillId } = await t.mutation(api.agent.skills.skillUpload.createOwnerSkill, {
      skillMarkdown: VALID_SKILL,
    });
    expect(skillId).toBeDefined();
    const owned = await t.query(api.agent.skills.skillUpload.listOwnedSkills, {});
    expect(owned).toHaveLength(1);
    expect(owned[0]).toMatchObject({ name: "my-method", scope: "user", enabled: true, hasScripts: false });
  });

  it("rejects an invalid SKILL.md (no frontmatter)", async () => {
    const t = (await syncedSession()).withIdentity(IDENTITY);
    await expect(
      t.mutation(api.agent.skills.skillUpload.createOwnerSkill, { skillMarkdown: "just some text" }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate name in the user's scope", async () => {
    const t = (await syncedSession()).withIdentity(IDENTITY);
    await t.mutation(api.agent.skills.skillUpload.createOwnerSkill, { skillMarkdown: VALID_SKILL });
    await expect(
      t.mutation(api.agent.skills.skillUpload.createOwnerSkill, { skillMarkdown: VALID_SKILL }),
    ).rejects.toThrow();
  });

  it("toggles enabled and deletes", async () => {
    const t = (await syncedSession()).withIdentity(IDENTITY);
    const { skillId } = await t.mutation(api.agent.skills.skillUpload.createOwnerSkill, {
      skillMarkdown: VALID_SKILL,
    });
    await t.mutation(api.agent.skills.skillUpload.setSkillEnabled, { skillId, enabled: false });
    let owned = await t.query(api.agent.skills.skillUpload.listOwnedSkills, {});
    expect(owned[0].enabled).toBe(false);

    await t.mutation(api.agent.skills.skillUpload.deleteSkill, { skillId });
    owned = await t.query(api.agent.skills.skillUpload.listOwnedSkills, {});
    expect(owned).toHaveLength(0);
  });

  it("refuses to act on another user's skill", async () => {
    const t = await syncedSession();
    const { skillId } = await t
      .withIdentity(IDENTITY)
      .mutation(api.agent.skills.skillUpload.createOwnerSkill, { skillMarkdown: VALID_SKILL });
    await expect(
      t
        .withIdentity({ tokenIdentifier: "intruder", subject: "intruder" })
        .mutation(api.agent.skills.skillUpload.deleteSkill, { skillId }),
    ).rejects.toThrow();
  });
});
