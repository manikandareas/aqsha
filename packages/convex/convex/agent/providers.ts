import { createOpenAI } from "@ai-sdk/openai";

type ProviderAuth =
  | { kind: "api-key"; apiKey: string }
  | { kind: "none" };

type OpenAiCompatibleProviderConfig = {
  providerName: string;
  baseURL?: string;
  auth?: ProviderAuth;
  enabled: boolean;
};

function optionalEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function openAiCompatibleProviderConfig(args: {
  apiKeyEnv: string;
  baseUrlEnv: string;
  providerNameEnv: string;
}): OpenAiCompatibleProviderConfig {
  const baseURL = optionalEnv(args.baseUrlEnv, "OPENAI_BASE_URL");
  const providerKey = optionalEnv(args.apiKeyEnv);
  const openAiKey = optionalEnv("OPENAI_API_KEY");
  const apiKey = providerKey ?? openAiKey;
  return {
    providerName: optionalEnv(args.providerNameEnv) ?? "openai",
    baseURL,
    auth: apiKey
      ? { kind: "api-key", apiKey }
      : baseURL
        ? { kind: "none" }
        : undefined,
    enabled: Boolean(apiKey || baseURL),
  };
}

export const chatProviderConfig = openAiCompatibleProviderConfig({
  apiKeyEnv: "AQSHA_CHAT_API_KEY",
  baseUrlEnv: "AQSHA_CHAT_BASE_URL",
  providerNameEnv: "AQSHA_CHAT_PROVIDER_NAME",
});

export const embeddingProviderConfig = openAiCompatibleProviderConfig({
  apiKeyEnv: "AQSHA_EMBEDDING_API_KEY",
  baseUrlEnv: "AQSHA_EMBEDDING_BASE_URL",
  providerNameEnv: "AQSHA_EMBEDDING_PROVIDER_NAME",
});

export const CHAT_PROVIDER_NAME = chatProviderConfig.providerName;
export const EMBEDDING_PROVIDER_NAME = embeddingProviderConfig.providerName;

export const chatProvider = createOpenAI({
  apiKey:
    chatProviderConfig.auth?.kind === "api-key"
      ? chatProviderConfig.auth.apiKey
      : chatProviderConfig.auth?.kind === "none"
        ? ""
        : undefined,
  baseURL: chatProviderConfig.baseURL,
  name: chatProviderConfig.providerName,
});

export const embeddingProvider = createOpenAI({
  apiKey:
    embeddingProviderConfig.auth?.kind === "api-key"
      ? embeddingProviderConfig.auth.apiKey
      : embeddingProviderConfig.auth?.kind === "none"
        ? ""
        : undefined,
  baseURL: embeddingProviderConfig.baseURL,
  name: embeddingProviderConfig.providerName,
});
