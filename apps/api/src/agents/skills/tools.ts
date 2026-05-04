import { readFile } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { readSkill } from "./frontmatter";
import { assertReadableResource, resolveConfinedPath } from "./path-safety";
import type { SkillToolContext } from "./types";

export function createSkillTools(context: SkillToolContext) {
  return {
    loadSkill: tool({
      description: "Load the full instructions for a registered skill by name.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Registered skill name."),
      }),
      execute: async ({ name }) => {
        const skill = context.registry.byName.get(name);
        if (!skill) {
          throw new Error(`Unknown skill: ${name}`);
        }

        const loaded = await readSkill(skill);
        return {
          name: loaded.name,
          description: loaded.description,
          directoryToken: loaded.name,
          content: loaded.content,
        };
      },
    }),
    readSkillResource: tool({
      description: "Read a small trusted text resource relative to a registered skill directory.",
      inputSchema: z.object({
        skillName: z.string().min(1),
        path: z.string().min(1).describe("Relative path like references/research-workflow.md."),
      }),
      execute: async ({ skillName, path }) => {
        const skill = context.registry.byName.get(skillName);
        if (!skill) {
          throw new Error(`Unknown skill: ${skillName}`);
        }

        const resolved = await resolveConfinedPath(skill.directory, path);
        await assertReadableResource(resolved);

        return {
          skillName,
          path,
          content: await readFile(resolved, "utf8"),
        };
      },
    }),
  };
}
