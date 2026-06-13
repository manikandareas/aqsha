import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  commandDescriptorSchema,
  type CommandDescriptor,
} from "@aqsha/agent-contracts";

// Command registry (plan §5.4): every SKILL.md doubles as a slash command, plus
// the service-intercepted /deep. This list is synced to Convex on deploy so the
// composer palette can render it; built-in SDK commands are never exposed.

export const DEEP_COMMAND: CommandDescriptor = {
  name: "deep",
  description:
    "Deep research: decompose the question, search literature in parallel, verify citations, and write a referenced report.",
  argumentHint: "<research question>",
  scope: "service",
  interceptedByService: true,
};

export function parseSkillFrontmatter(markdown: string): {
  name?: string;
  description?: string;
  argumentHint?: string;
  triggerKeywords?: string[];
} | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) {
    return null;
  }
  try {
    const data = parseYaml(match[1]) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") {
      return null;
    }
    const metadata =
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : {};
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      argumentHint:
        typeof data["argument-hint"] === "string" ? data["argument-hint"] : undefined,
      triggerKeywords: Array.isArray(metadata.triggerKeywords)
        ? metadata.triggerKeywords.filter(
            (keyword): keyword is string => typeof keyword === "string",
          )
        : undefined,
    };
  } catch {
    return null;
  }
}

export type SkillEntry = {
  name: string;
  description: string;
  triggerKeywords?: string[];
};

/** Read every SKILL.md under <appRoot>/.claude/skills. */
export function readSkillEntries(appRoot: string): SkillEntry[] {
  const skillsDir = path.join(appRoot, ".claude", "skills");
  let dirents: string[];
  try {
    dirents = readdirSync(skillsDir);
  } catch {
    return [];
  }
  const entries: SkillEntry[] = [];
  for (const dirent of dirents) {
    try {
      const markdown = readFileSync(
        path.join(skillsDir, dirent, "SKILL.md"),
        "utf-8",
      );
      const frontmatter = parseSkillFrontmatter(markdown);
      const name = frontmatter?.name ?? dirent;
      if (frontmatter?.description) {
        entries.push({
          name,
          description: frontmatter.description,
          triggerKeywords: frontmatter.triggerKeywords,
        });
      }
    } catch {
      // Skip folders without a readable SKILL.md.
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Full command list: skills as commands + product/service commands. */
export function buildCommandRegistry(appRoot: string): CommandDescriptor[] {
  const skillCommands = readSkillEntries(appRoot).map((entry) =>
    commandDescriptorSchema.parse({
      name: entry.name,
      description: entry.description,
      scope: "skill",
    }),
  );
  return [DEEP_COMMAND, ...skillCommands];
}

/** Parse a service-intercepted command from a prompt ("/deep <args>"). */
export function parseServiceCommand(
  prompt: string,
): { name: string; args: string } | null {
  const match = prompt.match(/^\/([a-z0-9][a-z0-9-]*)\s*([\s\S]*)$/);
  if (!match || !match[1]) {
    return null;
  }
  const name = match[1];
  if (name !== DEEP_COMMAND.name) {
    return null;
  }
  return { name, args: (match[2] ?? "").trim() };
}
