import { notFound } from "next/navigation";

import { ThreadPageShell } from "@/features/chat/components/thread-page-shell";
import { getChatThread } from "@/features/chat/lib/server-api";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getChatThread(id);

  if (!detail) {
    notFound();
  }

  return (
    <ThreadPageShell
      id={id}
      initialEvents={detail.events}
      initialLatestRun={detail.latestRun}
      initialMessages={detail.messages}
      initialSources={detail.sources}
      title={detail.thread.title}
    />
  );
}
