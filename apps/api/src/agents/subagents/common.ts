import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel, StopCondition, ToolSet } from "ai";
import { stepCountIs } from "ai";
import { env } from "../../config";
import { describeAstraDeps } from "../deps";
import { tokenBudget } from "../loop-control";
import type { AgentRuntimeContext } from "../types";

export type SubAgentOptions = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  externalTools?: ToolSet;
};

export function pickTools<T extends ToolSet>(tools: T, allowed: ReadonlyArray<string>): ToolSet {
  const out: ToolSet = {};
  for (const name of allowed) {
    if (tools[name]) {
      out[name] = tools[name];
    }
  }
  return out;
}

export function subAgentStopWhen(steps: number): StopCondition<ToolSet>[] {
  return [stepCountIs(steps), tokenBudget(env.ASTRA_TOTAL_TOKEN_BUDGET)];
}

export function subAgentSettings({ model, providerOptions, context, externalTools }: SubAgentOptions) {
  const tools: ToolSet = { ...(externalTools ?? {}) };

  return {
    model,
    tools,
    providerOptions,
    experimental_context: context,
    prepareCall: (options: { instructions?: unknown }) => ({
      ...options,
      model,
      tools,
      providerOptions,
      instructions: [
        typeof options.instructions === "string" ? options.instructions : "",
        `Runtime context: ${describeAstraDeps(context.deps)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      experimental_context: context,
    }),
  };
}
