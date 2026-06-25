import { ThreadView } from "@/features/threads/components/thread-view";

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <ThreadView threadId={threadId} />;
}
