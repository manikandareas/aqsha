import { ArtifactDetailView } from "@/features/workspaces/components/artifact-detail-view";

export default async function ArtifactReaderPage({
  params,
}: {
  params: Promise<{ workspaceId: string; artifactId: string }>;
}) {
  const { workspaceId, artifactId } = await params;
  return (
    <ArtifactDetailView
      artifactId={artifactId}
      workspaceId={workspaceId}
      variant="page"
    />
  );
}
