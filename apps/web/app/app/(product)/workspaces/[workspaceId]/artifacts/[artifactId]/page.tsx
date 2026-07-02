import { ArtifactReaderPageShell } from "@/features/workspaces/components/artifact-reader-page-shell";

export default async function ArtifactReaderPage({
  params,
}: {
  params: Promise<{ workspaceId: string; artifactId: string }>;
}) {
  const { workspaceId, artifactId } = await params;
  return <ArtifactReaderPageShell workspaceId={workspaceId} artifactId={artifactId} />;
}
