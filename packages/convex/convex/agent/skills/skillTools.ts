import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  type AgentToolCtx,
  requireToolThread,
  requireToolUser,
} from "../tools/toolContext";

// Skill runtime tools. read_skill_resource is always available; activate_skill
// is only included when the catalog is non-empty (zod v4 z.enum rejects an empty
// tuple, and the tool would be meaningless with no skills to name).
export const SKILL_TOOL_NAMES = ["activate_skill", "read_skill_resource"] as const;

const MAX_RESOURCE_CHARS = 40_000;

export function buildSkillTools(args: {
  catalogNames: string[];
  runId?: Id<"agentRuns">;
}): ToolSet {
  const tools: ToolSet = {
    read_skill_resource: createTool({
      description:
        "Read a reference or asset file bundled with a skill (e.g. a checklist or template) on demand, by skill name and resource path. Use only after activating a skill that lists resources.",
      inputSchema: z.object({
        name: z.string().describe("The skill name."),
        path: z.string().describe("The resource path as listed by the skill."),
      }),
      execute: async (ctx: AgentToolCtx, input: { name: string; path: string }) => {
        const ownerUserId = requireToolUser(ctx);
        const resource = await ctx.runQuery(
          internal.agent.skills.skills.getResource,
          { ownerUserId, name: input.name, path: input.path },
        );
        if (!resource) {
          return {
            status: "not_found" as const,
            message: `Resource "${input.path}" tidak tersedia untuk skill "${input.name}".`,
          };
        }
        const blob = await ctx.storage.get(resource.storageId);
        if (!blob) {
          return {
            status: "not_found" as const,
            message: "Resource tidak ditemukan di penyimpanan.",
          };
        }
        const text = await blob.text();
        return {
          status: "ok" as const,
          path: input.path,
          kind: resource.kind,
          content: text.slice(0, MAX_RESOURCE_CHARS),
        };
      },
    }),
  };

  if (args.catalogNames.length === 0) {
    return tools; // No skills → omit activate_skill (empty enum is invalid).
  }
  const nameTuple = args.catalogNames as [string, ...string[]];

  tools.activate_skill = createTool({
    description:
      "Activate a methodology skill when its description matches the task. Returns the skill's full instructions; follow them for the rest of the turn. Activate at most the skills relevant to the current task — do not activate speculatively.",
    inputSchema: z.object({
      name: z.enum(nameTuple).describe("The skill to activate (from the catalog)."),
    }),
    // Scripted skills require informed consent on first activation (the consent
    // card is the existing HITL approval surface). Builtin skills have no
    // scripts, so this is false for them.
    needsApproval: async (ctx: AgentToolCtx, input: { name: string }) => {
      const ownerUserId = requireToolUser(ctx);
      const skill = await ctx.runQuery(
        internal.agent.skills.skills.getActivatable,
        { ownerUserId, name: input.name },
      );
      return Boolean(skill?.hasScripts);
    },
    execute: async (ctx: AgentToolCtx, input: { name: string }) => {
      const ownerUserId = requireToolUser(ctx);
      const threadId = requireToolThread(ctx);
      const skill = await ctx.runQuery(
        internal.agent.skills.skills.getActivatable,
        { ownerUserId, name: input.name },
      );
      if (!skill) {
        return {
          status: "not_found" as const,
          message: `Skill "${input.name}" tidak ditemukan atau tidak aktif.`,
        };
      }
      const recorded = await ctx.runMutation(
        internal.agent.skills.skills.recordActivation,
        {
          ownerUserId,
          threadId,
          runId: args.runId,
          skillId: skill.skillId,
          skillName: skill.name,
          skillVersion: skill.version,
          activatedBy: "model",
        },
      );
      if (recorded.deduped) {
        return {
          status: "already_active" as const,
          message: `Skill "${skill.name}" sudah aktif di sesi ini.`,
        };
      }
      let resourcePaths: string[] = [];
      try {
        const manifest = JSON.parse(skill.resourcesJson) as Array<{ path?: unknown }>;
        resourcePaths = manifest
          .map((r) => r.path)
          .filter((p): p is string => typeof p === "string");
      } catch {
        resourcePaths = [];
      }
      return {
        status: "activated" as const,
        name: skill.name,
        version: skill.version,
        content: `<skill_content name="${skill.name}">\n${skill.bodyText}\n</skill_content>`,
        resources: resourcePaths,
      };
    },
  });

  return tools;
}
