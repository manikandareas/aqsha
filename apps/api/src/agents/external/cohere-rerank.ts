// Cohere reranking via the AI SDK v6 `rerank()` abstraction.
//
// Why this file: we wrap the AI SDK call so that:
//  - The Cohere provider is created lazily (only when an API key exists),
//    keeping cold-start path clean.
//  - Callers receive a uniform `{ ranking }` shape regardless of how the
//    AI SDK evolves its result fields.
//  - `isCohereConfigured()` lets tools branch on configuration without
//    importing env directly from many places.
//
// Cohere docs: https://docs.cohere.com/v2/reference/rerank
// AI SDK rerank: https://ai-sdk.dev/docs/ai-sdk-core/reranking

import { createCohere } from "@ai-sdk/cohere";
import { rerank, type RerankingModel } from "ai";
import { env } from "../../config";

export type CohereRerankInput = {
  query: string;
  documents: string[];
  topN?: number;
  /** Override the default model id from env (`ASTRA_COHERE_RERANK_MODEL`). */
  model?: string;
  signal?: AbortSignal;
};

export type CohereRerankResult = {
  ranking: Array<{ index: number; relevanceScore: number }>;
};

let cachedModel: RerankingModel | null = null;
let cachedModelId: string | null = null;

function getRerankingModel(modelId: string): RerankingModel {
  if (cachedModel && cachedModelId === modelId) {
    return cachedModel;
  }
  const provider = createCohere({ apiKey: env.ASTRA_COHERE_API_KEY });
  cachedModel = provider.reranking(modelId);
  cachedModelId = modelId;
  return cachedModel;
}

/**
 * Invoke Cohere rerank via the AI SDK. Returns the ranking sorted by
 * relevanceScore descending. Throws when the API key is missing —
 * callers must check `isCohereConfigured()` first.
 */
export async function cohereRerank(input: CohereRerankInput): Promise<CohereRerankResult> {
  if (!env.ASTRA_COHERE_API_KEY) {
    throw new Error("ASTRA_COHERE_API_KEY is not configured");
  }
  if (input.documents.length === 0) {
    return { ranking: [] };
  }

  const modelId = input.model ?? env.ASTRA_COHERE_RERANK_MODEL;
  const topN = input.topN ?? Math.min(input.documents.length, env.ASTRA_RERANK_TOP_N);

  const result = await rerank({
    model: getRerankingModel(modelId),
    documents: input.documents,
    query: input.query,
    topN,
    abortSignal: input.signal,
  });

  // RerankResult.ranking: Array<{ originalIndex; score; document }> sorted desc.
  const ranking = result.ranking.map((entry) => ({
    index: entry.originalIndex,
    relevanceScore: entry.score,
  }));

  return { ranking };
}

/** True when env exposes a Cohere API key — tools should branch on this. */
export function isCohereConfigured(): boolean {
  return Boolean(env.ASTRA_COHERE_API_KEY);
}
