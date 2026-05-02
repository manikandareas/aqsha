import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { createAgentUIStream, createAgentUIStreamResponse, type LanguageModel, type UIMessage } from "ai";
import { buildAstraAgent } from "./agents";
import type { AgentRuntimeContext } from "./types";

export function createAstraAgentUIStream({
  model,
  providerOptions,
  context,
  uiMessages,
  abortSignal,
}: {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
}) {
  return createAgentUIStream({
    agent: buildAstraAgent({ model, providerOptions, context }),
    uiMessages,
    abortSignal,
  });
}

export function createAstraAgentResponse({
  model,
  providerOptions,
  context,
  uiMessages,
  abortSignal,
  headers,
}: {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
  headers?: HeadersInit;
}) {
  return createAgentUIStreamResponse({
    agent: buildAstraAgent({ model, providerOptions, context }),
    uiMessages,
    abortSignal,
    headers,
  });
}
