"use client";

import { ArtifactDetailView } from "../components/artifact-detail-view";

// Full-page artifact route. The reader itself is shared with the thread-detail
// artifact side panel via `ArtifactDetailView` (answer-stream redesign Fase 4) —
// this wrapper keeps the route's stable entry point + page chrome.
export function ArtifactDetailPage({
  workspaceId,
  artifactId,
}: {
  workspaceId: string;
  artifactId: string;
}) {
  return (
    <ArtifactDetailView
      artifactId={artifactId}
      workspaceId={workspaceId}
      variant="page"
    />
  );
}
