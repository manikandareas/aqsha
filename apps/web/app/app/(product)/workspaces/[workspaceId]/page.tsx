import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";
import { WorkspaceDetailClient } from "./workspace-detail-client";

export const metadata = createPageMetadata({
  title: "Workspace",
  description: "Review workspace documents, folders, and related research threads in Aqsha.",
});

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
