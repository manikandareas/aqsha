import { openai } from "@ai-sdk/openai";
import { RAG } from "@convex-dev/rag";
import { components } from "../_generated/api";

export type ArtifactRagFilters = {
  artifactId: string;
  workspaceId: string;
};

export type ArtifactRagMetadata = {
  artifactId: string;
  workspaceId: string;
  ownerUserId: string;
  source: "upload" | "artifact" | "url";
};

export const ARTIFACT_RAG_EMBEDDING_MODEL =
  process.env.AQSHA_RAG_EMBEDDING_MODEL ?? "text-embedding-3-small";

export const artifactRag = new RAG<ArtifactRagFilters, ArtifactRagMetadata>(
  components.rag,
  {
    textEmbeddingModel: openai.embedding(ARTIFACT_RAG_EMBEDDING_MODEL),
    embeddingDimension: 1536,
    filterNames: ["artifactId", "workspaceId"],
  },
);

export function artifactRagNamespace(ownerUserId: string) {
  return `user:${ownerUserId}`;
}
