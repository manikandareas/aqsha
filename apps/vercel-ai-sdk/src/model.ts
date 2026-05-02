import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { env } from "./config";

export type ResolvedModel = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
};

const PYDANTIC_MODEL_MAP: Record<string, string> = {
  "openai:gpt-5.2": "gpt-5.2",
  "openai:gpt-5.4": "gpt-5.4",
};

const OPENAI_PREFIX = "openai/";

export function allowedModels(): Set<string> {
  const models = env.ASTRA_ALLOWED_MODELS.split(",")
    .map((model) => normalizeModelId(model))
    .filter((model): model is string => Boolean(model));

  return new Set(models);
}

export function resolveModel(modelOverride?: string | null): ResolvedModel {
  const allowed = allowedModels();
  const requested = normalizeModelId(modelOverride) ?? normalizeModelId(env.ASTRA_MODEL);
  const defaultModel = normalizeModelId(env.ASTRA_MODEL);

  const modelId = requested && allowed.has(requested) ? requested : defaultModel;
  if (!modelId || !allowed.has(modelId)) {
    throw new Error(`Configured default model is not in ASTRA_ALLOWED_MODELS: ${defaultModel ?? "none"}`);
  }

  return {
    model: openai(modelId),
    providerOptions: buildOpenAIProviderOptions(modelId),
  };
}

export function normalizeModelId(model?: string | null): string | null {
  const value = model?.trim();
  if (!value) {
    return null;
  }

  const mapped = PYDANTIC_MODEL_MAP[value] ?? value;
  return mapped.startsWith(OPENAI_PREFIX) ? mapped.slice(OPENAI_PREFIX.length) : mapped;
}

function buildOpenAIProviderOptions(modelId: string): ProviderOptions | undefined {
  const openaiOptions: OpenAILanguageModelResponsesOptions = {
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    reasoningSummary: env.OPENAI_REASONING_SUMMARY,
    textVerbosity: env.OPENAI_TEXT_VERBOSITY,
    forceReasoning: env.OPENAI_FORCE_REASONING || isOpenAIReasoningModel(modelId) ? true : undefined,
  };

  const sanitized = Object.fromEntries(
    Object.entries(openaiOptions).filter(([, value]) => value !== undefined && value !== null),
  ) as OpenAILanguageModelResponsesOptions;

  return Object.keys(sanitized).length > 0 ? { openai: sanitized } : undefined;
}

function isOpenAIReasoningModel(modelId: string): boolean {
  return /^(o\d|gpt-5)/.test(modelId);
}
