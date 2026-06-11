import { parse as parseYaml } from "yaml";

// SKILL.md parser/validator (open standard, agentskills.io). Pure + unit-tested.
// Soft validation: warn-and-load on every issue EXCEPT an empty description,
// which is the one hard requirement (an empty description makes a skill
// invisible/unusable in the tier-1 catalog). Frontmatter is YAML between the
// leading `---` fences; everything after is the markdown body.

export type ParsedSkill = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  // Experimental `allowed-tools`: a space-separated string treated as a
  // NARROWER (subset of router-allowed tools), never a widener. Normalized to
  // an array here; enforcement lives in code (guards), not in skill text.
  allowedTools?: string[];
  metadataJson?: string;
  body: string;
  warnings: string[];
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BOM = 0xfeff;

export function parseSkillMarkdown(raw: string): ParsedSkill | null {
  // Tolerate a leading BOM, then require YAML frontmatter.
  const text = raw.charCodeAt(0) === BOM ? raw.slice(1) : raw;
  const match = text.match(FRONTMATTER_RE);
  if (!match) {
    return null; // No YAML frontmatter → not a valid SKILL.md.
  }
  const [, frontmatterRaw, bodyRaw] = match;

  let frontmatter: Record<string, unknown>;
  try {
    const parsed = parseYaml(frontmatterRaw) as unknown;
    frontmatter =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return null; // Malformed YAML frontmatter.
  }

  const description =
    typeof frontmatter.description === "string"
      ? frontmatter.description.trim()
      : "";
  if (!description) {
    return null; // The single hard requirement.
  }

  const warnings: string[] = [];
  const name =
    typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  if (!name) {
    warnings.push("missing name");
  } else if (!NAME_RE.test(name)) {
    warnings.push("name should be lowercase letters/digits separated by hyphens");
  } else if (name.length > 64) {
    warnings.push("name exceeds 64 characters");
  }
  if (description.length > 1024) {
    warnings.push("description exceeds 1024 characters");
  }

  const license =
    typeof frontmatter.license === "string" ? frontmatter.license : undefined;
  const compatibility =
    typeof frontmatter.compatibility === "string"
      ? frontmatter.compatibility
      : undefined;

  const allowedToolsRaw = frontmatter["allowed-tools"];
  const allowedTools =
    typeof allowedToolsRaw === "string"
      ? allowedToolsRaw.split(/\s+/).filter(Boolean)
      : Array.isArray(allowedToolsRaw)
        ? allowedToolsRaw.filter((tool): tool is string => typeof tool === "string")
        : undefined;

  const metadata = frontmatter.metadata;
  const metadataJson =
    metadata && typeof metadata === "object"
      ? JSON.stringify(metadata)
      : undefined;

  return {
    name,
    description,
    license,
    compatibility,
    allowedTools,
    metadataJson,
    body: bodyRaw.trim(),
    warnings,
  };
}

// Small deterministic checksum (FNV-1a, 32-bit) for change-detection when
// re-seeding builtin skills — avoids rewriting unchanged rows.
export function skillChecksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
