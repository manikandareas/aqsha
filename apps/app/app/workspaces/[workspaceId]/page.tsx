import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { WorkspaceDetailPage } from "@/features/workspaces/pages/workspace-detail-page";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { workspaceId } = await params;

  return <WorkspaceDetailPage workspaceId={workspaceId} />;
}
