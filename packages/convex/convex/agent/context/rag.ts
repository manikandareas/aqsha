import { RAG } from "@convex-dev/rag";
import { components } from "../../_generated/api";
import { embeddingProvider } from "../providers/providers";

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

function embeddingDimension() {
  const dimension = Number(process.env.AQSHA_RAG_EMBEDDING_DIMENSION ?? 1536);
  return Number.isInteger(dimension) && dimension > 0 ? dimension : 1536;
}

export const ARTIFACT_RAG_EMBEDDING_DIMENSION = embeddingDimension();

export const artifactRag = new RAG<ArtifactRagFilters, ArtifactRagMetadata>(
  components.rag,
  {
    textEmbeddingModel: embeddingProvider.embedding(ARTIFACT_RAG_EMBEDDING_MODEL),
    embeddingDimension: ARTIFACT_RAG_EMBEDDING_DIMENSION,
    filterNames: ["artifactId", "workspaceId"],
  },
);

export function artifactRagNamespace(ownerUserId: string) {
  return `user:${ownerUserId}`;
}
