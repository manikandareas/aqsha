import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel, ToolSet } from "ai";
import { stepCountIs } from "ai";
import { describeAstraDeps } from "../deps";
import { buildSkillsPrompt, createSkillTools } from "../skills";
import type { AgentRuntimeContext } from "../types";

export type AstraAgentOptions = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  externalTools?: ToolSet;
};

export function mergeAstraTools(skillTools: ToolSet, externalTools: ToolSet = {}): ToolSet {
  for (const toolName of Object.keys(externalTools)) {
    if (skillTools[toolName]) {
      throw new Error(`External tool cannot override local skill tool: ${toolName}`);
    }
  }

  return {
    ...externalTools,
    ...skillTools,
  };
}

export function commonAgentSettings({ model, providerOptions, context, externalTools }: AstraAgentOptions) {
  const skillTools = createSkillTools({
    registry: context.skills,
    scriptsEnabled: context.skillScriptsEnabled,
    scriptTimeoutMs: context.skillScriptTimeoutMs,
  });
  const tools = mergeAstraTools(skillTools, externalTools);

  return {
    model,
    tools,
    stopWhen: stepCountIs(20),
    providerOptions,
    experimental_context: context,
    prepareCall: (options: { instructions?: unknown }) => ({
      ...options,
      model,
      tools,
      stopWhen: stepCountIs(20),
      providerOptions,
      instructions: [
        typeof options.instructions === "string" ? options.instructions : "You are Astra, Aqsha's AI agent.",
        `Runtime context: ${describeAstraDeps(context.deps)}`,
        buildSkillsPrompt(context.skills.skills),
      ].join("\n\n"),
      experimental_context: context,
    }),
  };
}
