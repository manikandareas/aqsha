import { basename, dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { readSkill } from "./frontmatter";
import {
  assertReadableResource,
  resolveConfinedPath,
} from "./path-safety";
import type { SkillToolContext } from "./types";

const TRUSTED_SCRIPT_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MAX_SCRIPT_ARGS = 20;
const MAX_SCRIPT_ARG_LENGTH = 500;
const MAX_SCRIPT_INPUT_JSON_BYTES = 512 * 1024;

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
    runSkillScript: tool({
      description: "Run an allowlisted trusted script from a registered skill's scripts directory. Disabled unless explicitly enabled by the server.",
      inputSchema: z.object({
        skillName: z.string().min(1),
        script: z.string().min(1).describe("Script filename under scripts/ for the skill."),
        args: z.array(z.string()).optional().default([]),
        evidenceJson: z.string().max(MAX_SCRIPT_INPUT_JSON_BYTES).optional(),
        visualsJson: z.string().max(MAX_SCRIPT_INPUT_JSON_BYTES).optional(),
      }),
      execute: async ({ skillName, script, args, evidenceJson, visualsJson }) => {
        if (!context.scriptsEnabled) {
          throw new Error("Skill script execution is disabled.");
        }

        const skill = context.registry.byName.get(skillName);
        if (!skill) {
          throw new Error(`Unknown skill: ${skillName}`);
        }

        if (!TRUSTED_SCRIPT_PATTERN.test(script) || basename(script) !== script) {
          throw new Error("Script must be an allowlisted filename, not a path.");
        }

        if (!script.endsWith(".py")) {
          throw new Error("Only trusted Python skill scripts are supported.");
        }

        if (args.length > MAX_SCRIPT_ARGS || args.some((arg) => arg.length > MAX_SCRIPT_ARG_LENGTH)) {
          throw new Error("Script arguments exceed safety limits.");
        }

        if (evidenceJson) {
          JSON.parse(evidenceJson);
        }
        if (visualsJson) {
          JSON.parse(visualsJson);
        }

        const resolved = await resolveConfinedPath(skill.directory, join("scripts", script));
        const scriptDir = await resolveConfinedPath(skill.directory, "scripts");
        if (dirname(resolved) !== scriptDir) {
          throw new Error("Script must be directly under the skill scripts directory.");
        }

        if (!context.scriptRunner) {
          throw new Error("Sandbox script execution requires the configured Daytona sandbox runtime and it is unavailable.");
        }

        return context.scriptRunner({
          skillName,
          scriptName: script,
          scriptPath: resolved,
          scriptDir,
          scriptContent: await readFile(resolved, "utf8"),
          args,
          timeoutMs: context.scriptTimeoutMs,
          artifactRoot: context.deps.researchArtifactDir,
          workspace: context.deps.workspace,
          conversationId: context.deps.conversationId,
          evidenceJson,
          visualsJson,
        });
      },
    }),
  };
}
