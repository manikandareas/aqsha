import { redirect } from "next/navigation";
import { ArtifactDetailPage } from "@/features/workspaces/pages/artifact-detail-page";
import { isAuthenticated } from "@/lib/auth-server";

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
