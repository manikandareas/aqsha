import { WorkspaceDetail } from "@/features/workspaces/components/workspace-detail";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspaceDetail workspaceId={id} />;
}
