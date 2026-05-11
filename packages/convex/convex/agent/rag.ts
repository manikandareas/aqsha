import { openai } from "@ai-sdk/openai";
import { RAG } from "@convex-dev/rag";
import { components } from "../_generated/api";

export type CorpusFilter = {
  sourceType: string;
  corpusSourceId: string;
};

export type CorpusMetadata = {
  corpusSourceId: string;
  title: string;
  locator: string;
  sourceType: string;
  url?: string;
  doi?: string;
  arxivId?: string;
};

export const corpusRag = new RAG<CorpusFilter, CorpusMetadata>(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-3-small"),
  embeddingDimension: 1536,
  filterNames: ["sourceType", "corpusSourceId"],
});

export function userNamespace(ownerUserId: string) {
  return `user:${ownerUserId}`;
}
