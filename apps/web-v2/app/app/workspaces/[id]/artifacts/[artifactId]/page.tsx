import { ArtifactReader } from "@/features/artifacts/components/artifact-reader";

export default async function ArtifactReaderPage({
  params,
}: {
  params: Promise<{ id: string; artifactId: string }>;
}) {
  const { id, artifactId } = await params;
  return <ArtifactReader workspaceId={id} artifactId={artifactId} />;
}
