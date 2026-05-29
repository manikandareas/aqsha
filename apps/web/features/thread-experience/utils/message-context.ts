import { toArtifactIds, type ArtifactId } from "@/lib/convex-refs";
import type { MessageContextArtifactMetadata } from "../types";

export function buildContextArtifactSnapshot(
  artifactIds: string[],
  titleById: Map<string, string>,
  uploadedArtifactIds: string[] = [],
): MessageContextArtifactMetadata[] | undefined {
  if (artifactIds.length === 0) {
    return undefined;
  }

  const uploadedIdSet = new Set(uploadedArtifactIds.map(String));

  return artifactIds.map((artifactId) => ({
    artifactId,
    title: titleById.get(artifactId) ?? "Artifact",
    source: uploadedIdSet.has(String(artifactId)) ? "upload" : "workspace",
  }));
}

export function toSelectedContextArtifactIds(
  snapshot?: MessageContextArtifactMetadata[],
): ArtifactId[] | undefined {
  if (!snapshot?.length) {
    return undefined;
  }

  return toArtifactIds(snapshot.map((item) => item.artifactId));
}

export function toMutationContextSnapshot(
  snapshot?: MessageContextArtifactMetadata[],
) {
  if (!snapshot?.length) {
    return undefined;
  }

  return snapshot.map((item) => ({
    artifactId: item.artifactId as ArtifactId,
    title: item.title,
    artifactType: item.artifactType,
    source: item.source,
  }));
}
