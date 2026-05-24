import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { WorkspaceDetailClient } from "./workspace-detail-client";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { workspaceId } = await params;

  return <WorkspaceDetailClient workspaceId={workspaceId} />;
}
