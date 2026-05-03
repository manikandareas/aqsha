import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseSkillFile } from "./frontmatter";
import type { SkillMetadata, SkillRegistry } from "./types";

export async function discoverSkills(roots: string[]): Promise<SkillRegistry> {
  const skills: SkillMetadata[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const resolvedRoot = resolve(root);
    let children: string[];
    try {
      children = await readdir(resolvedRoot);
    } catch (error) {
      if (isNotFound(error)) {
        continue;
      }
      throw error;
    }

    for (const child of children) {
      const directory = join(resolvedRoot, child);
      const skillFile = join(directory, "SKILL.md");
      try {
        const directoryInfo = await stat(directory);
        if (!directoryInfo.isDirectory()) {
          continue;
        }

        const skillInfo = await stat(skillFile);
        if (!skillInfo.isFile()) {
          continue;
        }
      } catch (error) {
        if (isNotFound(error)) {
          continue;
        }
        throw error;
      }

      const loaded = parseSkillFile(await readFile(skillFile, "utf8"), directory, skillFile);
      if (seen.has(loaded.name)) {
        throw new Error(`Duplicate skill name discovered: ${loaded.name}`);
      }

      seen.add(loaded.name);
      skills.push({
        name: loaded.name,
        description: loaded.description,
        directory,
        skillFile,
      });
    }
  }

  skills.sort((left, right) => left.name.localeCompare(right.name));
  return { skills, byName: new Map(skills.map((skill) => [skill.name, skill])) };
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
