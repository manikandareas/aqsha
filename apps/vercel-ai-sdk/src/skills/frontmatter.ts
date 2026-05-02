import { readFile } from "node:fs/promises";
import type { LoadedSkill, SkillMetadata } from "./types";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseSkillFile(content: string, directory: string, skillFile: string): LoadedSkill {
  if (!content.startsWith("---\n")) {
    throw new Error(`Skill file must start with YAML frontmatter: ${skillFile}`);
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`Skill file is missing closing frontmatter delimiter: ${skillFile}`);
  }

  const frontmatter = content.slice(4, end).trim();
  const bodyStart = content.indexOf("\n", end + 1);
  const body = bodyStart === -1 ? "" : content.slice(bodyStart + 1).trimStart();
  const parsed = parseSimpleYaml(frontmatter);
  const name = parsed.name?.trim();
  const description = parsed.description?.trim();

  if (!name) {
    throw new Error(`Skill file is missing required frontmatter field: name (${skillFile})`);
  }

  if (!description) {
    throw new Error(`Skill file is missing required frontmatter field: description (${skillFile})`);
  }

  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Skill name must be kebab-case: ${name}`);
  }

  return { name, description, directory, skillFile, content: body };
}

export async function readSkill(skill: SkillMetadata): Promise<LoadedSkill> {
  return parseSkillFile(await readFile(skill.skillFile, "utf8"), skill.directory, skill.skillFile);
}

function parseSimpleYaml(value: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let rawValue = trimmed.slice(separator + 1).trim();

    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      rawValue = rawValue.slice(1, -1);
    }

    result[key] = rawValue;
  }

  return result;
}
