import { redirect } from "next/navigation";
import { ArtifactDetailPage } from "@/features/workspaces/pages/artifact-detail-page";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Artifact",
  description: "Inspect a research artifact, its content, and related workspace context in Aqsha.",
});

export default async function WorkspaceArtifactPage({
  params,
}: {
  params: Promise<{ workspaceId: string; artifactId: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { workspaceId, artifactId } = await params;

  return <ArtifactDetailPage workspaceId={workspaceId} artifactId={artifactId} />;
}
