import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { astraPlanSchema } from "../schemas";
import { describeAstraDeps } from "../deps";
import { discoverSkills } from "./discovery";
import { parseSkillFile, readSkill } from "./frontmatter";
import { resolveConfinedPath } from "./path-safety";
import { createSkillTools } from "./tools";

const tmpRoot = join(import.meta.dir, "../../.test-skills");

beforeAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(join(tmpRoot, "alpha", "references"), { recursive: true });
  await mkdir(join(tmpRoot, "alpha", "scripts"), { recursive: true });
  await writeFile(
    join(tmpRoot, "alpha", "SKILL.md"),
    "---\nname: alpha\ndescription: Test skill\n---\n\n# Alpha\n\nUse carefully.\n",
  );
  await writeFile(join(tmpRoot, "alpha", "references", "guide.md"), "Guide");
  await writeFile(join(tmpRoot, "alpha", "scripts", "ok.py"), "print('ok')\n");
  await writeFile(join(tmpRoot, "large.md"), "x".repeat(300 * 1024));
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("skill frontmatter", () => {
  test("parses required metadata and strips frontmatter", () => {
    const skill = parseSkillFile(
      "---\nname: deep-research\ndescription: Rigorous research\n---\n\nBody",
      "/skills/deep-research",
      "/skills/deep-research/SKILL.md",
    );

    expect(skill.name).toBe("deep-research");
    expect(skill.description).toBe("Rigorous research");
    expect(skill.content).toBe("Body");
  });

  test("requires name and description", () => {
    expect(() => parseSkillFile("---\nname: missing-description\n---\nBody", "/tmp", "/tmp/SKILL.md")).toThrow();
    expect(() => parseSkillFile("---\ndescription: Missing name\n---\nBody", "/tmp", "/tmp/SKILL.md")).toThrow();
  });
});

describe("skill discovery and tools", () => {
  test("discovers skills and loadSkill returns body without frontmatter", async () => {
    const registry = await discoverSkills([tmpRoot]);
    expect(registry.skills.map((skill) => skill.name)).toEqual(["alpha"]);

    const skill = registry.byName.get("alpha");
    expect(skill).toBeDefined();
    const loaded = await readSkill(skill!);
    expect(loaded.content).toContain("# Alpha");
    expect(loaded.content).not.toContain("---");

    const tools = createSkillTools({ registry, scriptsEnabled: false, scriptTimeoutMs: 1000 });
    const result = await (tools.loadSkill as any).execute({ name: "alpha" });
    expect(result.content).toContain("Use carefully.");
  });

  test("rejects duplicate skill names", async () => {
    const duplicateRoot = join(tmpRoot, "duplicates");
    await mkdir(join(duplicateRoot, "one"), { recursive: true });
    await mkdir(join(duplicateRoot, "two"), { recursive: true });
    await writeFile(join(duplicateRoot, "one", "SKILL.md"), "---\nname: dup\ndescription: One\n---\nOne");
    await writeFile(join(duplicateRoot, "two", "SKILL.md"), "---\nname: dup\ndescription: Two\n---\nTwo");

    await expect(discoverSkills([duplicateRoot])).rejects.toThrow("Duplicate skill name");
  });

  test("readSkillResource reads resources and rejects traversal", async () => {
    const registry = await discoverSkills([tmpRoot]);
    const tools = createSkillTools({ registry, scriptsEnabled: false, scriptTimeoutMs: 1000 });

    const result = await (tools.readSkillResource as any).execute({ skillName: "alpha", path: "references/guide.md" });
    expect(result.content).toBe("Guide");

    await expect((tools.readSkillResource as any).execute({ skillName: "alpha", path: "../../.env" })).rejects.toThrow();
  });

  test("rejects symlink escapes and oversized resources", async () => {
    const registry = await discoverSkills([tmpRoot]);
    await symlink(join(tmpRoot, "large.md"), join(tmpRoot, "alpha", "references", "large-link.md"));

    const tools = createSkillTools({ registry, scriptsEnabled: false, scriptTimeoutMs: 1000 });
    await expect((tools.readSkillResource as any).execute({ skillName: "alpha", path: "references/large-link.md" })).rejects.toThrow();

    await writeFile(join(tmpRoot, "alpha", "references", "large.md"), "x".repeat(300 * 1024));
    await expect((tools.readSkillResource as any).execute({ skillName: "alpha", path: "references/large.md" })).rejects.toThrow("size limit");
  });

  test("runSkillScript is disabled by default and rejects script paths", async () => {
    const registry = await discoverSkills([tmpRoot]);
    const disabledTools = createSkillTools({ registry, scriptsEnabled: false, scriptTimeoutMs: 1000 });
    await expect((disabledTools.runSkillScript as any).execute({ skillName: "alpha", script: "ok.py", args: [] })).rejects.toThrow("disabled");

    const enabledTools = createSkillTools({ registry, scriptsEnabled: true, scriptTimeoutMs: 1000 });
    await expect((enabledTools.runSkillScript as any).execute({ skillName: "alpha", script: "../ok.py", args: [] })).rejects.toThrow();
  });
});

describe("Astra domain contracts", () => {
  test("validates AstraPlan", () => {
    expect(() => astraPlanSchema.parse({ summary: "s", research: [], plan: [], risks: [], validation: [] })).not.toThrow();
  });

  test("describes Astra deps in Python-compatible format", () => {
    expect(describeAstraDeps({ userId: "u", workspace: "w", conversationId: "c", researchArtifactDir: "/tmp/a", constraints: ["x"] })).toBe(
      "user_id=u; workspace=w; conversation_id=c; research_artifact_dir=/tmp/a; constraints=x",
    );
  });

  test("path confinement rejects traversal", async () => {
    await expect(resolveConfinedPath(tmpRoot, "../package.json")).rejects.toThrow();
  });
});
