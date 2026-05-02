import { spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { readSkill } from "./frontmatter";
import {
  assertReadableResource,
  MAX_SCRIPT_OUTPUT_BYTES,
  resolveConfinedPath,
  trimOutput,
} from "./path-safety";
import type { SkillToolContext } from "./types";

const TRUSTED_SCRIPT_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MAX_SCRIPT_ARGS = 20;
const MAX_SCRIPT_ARG_LENGTH = 500;

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
      }),
      execute: async ({ skillName, script, args }) => {
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

        const resolved = await resolveConfinedPath(skill.directory, join("scripts", script));
        const scriptDir = await resolveConfinedPath(skill.directory, "scripts");
        if (dirname(resolved) !== scriptDir) {
          throw new Error("Script must be directly under the skill scripts directory.");
        }

        return runPythonScript(resolved, args, scriptDir, context.scriptTimeoutMs);
      },
    }),
  };
}

async function runPythonScript(scriptPath: string, args: string[], cwd: string, timeoutMs: number) {
  const command = process.env.PYTHON ?? "python3";

  return await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, [scriptPath, ...args], {
      cwd,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        PYTHONNOUSERSITE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Skill script timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + String(chunk), MAX_SCRIPT_OUTPUT_BYTES);
    });

    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + String(chunk), MAX_SCRIPT_OUTPUT_BYTES);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
  });
}
