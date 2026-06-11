import { describe, expect, it } from "vitest";
import {
  parseSkillMarkdown,
  skillChecksum,
} from "../convex/agent/skills/skillParser";
import { BUILTIN_SKILL_DOCS } from "../convex/agent/skills/builtin";

const VALID_SKILL = `---
name: deep-research-medis
description: >
  Metodologi deep research untuk topik kedokteran: hierarki bukti
  (meta-analysis > RCT > kohort), penyaringan ala PRISMA.
license: Proprietary
metadata: { author: aqsha, version: "1.0", scope: builtin }
allowed-tools: searchArxiv lookupDoi verifyCitations
---
## Strategi sumber
Prioritaskan systematic review/meta-analysis, lalu RCT.
`;

describe("parseSkillMarkdown", () => {
  it("parses frontmatter + body, normalizes allowed-tools and metadata", () => {
    const skill = parseSkillMarkdown(VALID_SKILL);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("deep-research-medis");
    expect(skill!.description).toContain("Metodologi deep research");
    expect(skill!.license).toBe("Proprietary");
    // allowed-tools is a space-separated string normalized to a narrower array.
    expect(skill!.allowedTools).toEqual([
      "searchArxiv",
      "lookupDoi",
      "verifyCitations",
    ]);
    // metadata flow-map is preserved as JSON.
    expect(JSON.parse(skill!.metadataJson!)).toMatchObject({
      author: "aqsha",
      version: "1.0",
      scope: "builtin",
    });
    // Body has the frontmatter stripped.
    expect(skill!.body.startsWith("## Strategi sumber")).toBe(true);
    expect(skill!.warnings).toEqual([]);
  });

  it("soft-validates: loads a non-conforming name with a warning", () => {
    const skill = parseSkillMarkdown(
      `---\nname: Deep_Research\ndescription: valid description\n---\nbody\n`,
    );
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("Deep_Research");
    expect(skill!.warnings.join(" ")).toContain("lowercase");
  });

  it("hard-rejects an empty description", () => {
    expect(
      parseSkillMarkdown(`---\nname: x\ndescription: ""\n---\nbody\n`),
    ).toBeNull();
    expect(
      parseSkillMarkdown(`---\nname: x\n---\nbody\n`),
    ).toBeNull();
  });

  it("returns null when there is no frontmatter or it is malformed", () => {
    expect(parseSkillMarkdown("# Just a markdown file\nno frontmatter")).toBeNull();
    expect(parseSkillMarkdown(`---\n: : : bad yaml\n---\nbody`)).toBeNull();
  });
});

describe("builtin skills", () => {
  it("every bundled builtin parses cleanly (no warnings, valid name)", () => {
    expect(BUILTIN_SKILL_DOCS.length).toBeGreaterThanOrEqual(8);
    const names = new Set<string>();
    for (const doc of BUILTIN_SKILL_DOCS) {
      const skill = parseSkillMarkdown(doc);
      expect(skill, `builtin doc failed to parse: ${doc.slice(0, 60)}`).not.toBeNull();
      expect(skill!.warnings).toEqual([]);
      expect(skill!.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill!.description.length).toBeGreaterThan(0);
      names.add(skill!.name);
    }
    // Names must be unique (they key the by_scope_name upsert).
    expect(names.size).toBe(BUILTIN_SKILL_DOCS.length);
  });
});

describe("skillChecksum", () => {
  it("is deterministic and sensitive to content", () => {
    expect(skillChecksum("hello")).toBe(skillChecksum("hello"));
    expect(skillChecksum("hello")).not.toBe(skillChecksum("hellp"));
    expect(skillChecksum("hello")).toMatch(/^[0-9a-f]{8}$/);
  });
});
