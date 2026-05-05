import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel, PrepareStepFunction, StopCondition, ToolSet } from "ai";
import { stepCountIs } from "ai";
import { env } from "../config";
import { describeAstraDeps } from "./deps";
import { tokenBudget } from "./loop-control";
import { buildSkillsPrompt, createSkillTools } from "./skills";
import type { AgentRuntimeContext } from "./types";

export type AstraAgentOptions = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  externalTools?: ToolSet;
  prepareStep?: PrepareStepFunction<ToolSet>;
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
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

function defaultStopWhen(): StopCondition<ToolSet>[] {
  return [stepCountIs(40), tokenBudget(env.ASTRA_TOTAL_TOKEN_BUDGET)];
}

export function commonAgentSettings({
  model,
  providerOptions,
  context,
  externalTools,
  prepareStep,
  stopWhen,
}: AstraAgentOptions) {
  const skillTools = createSkillTools({
    registry: context.skills,
  });
  const tools = mergeAstraTools(skillTools, externalTools);
  const resolvedStopWhen = stopWhen ?? defaultStopWhen();

  return {
    model,
    tools,
    stopWhen: resolvedStopWhen,
    providerOptions,
    experimental_context: context,
    ...(prepareStep ? { prepareStep } : {}),
    prepareCall: (options: { instructions?: unknown }) => ({
      ...options,
      model,
      tools,
      stopWhen: resolvedStopWhen,
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
