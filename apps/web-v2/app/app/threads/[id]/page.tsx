import { ThreadView } from "@/features/threads/components/thread-view";

export default async function ThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ThreadView threadId={id} />;
}
