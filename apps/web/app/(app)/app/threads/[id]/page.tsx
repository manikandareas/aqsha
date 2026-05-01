import { notFound } from "next/navigation";

import { AppPageHeader } from "@/components/app-page-header";
import { ChatThread } from "@/features/chat/components/chat-thread";
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
    <div className="flex h-full flex-col bg-background text-foreground">
      <AppPageHeader title={detail.thread.title} sticky />
      <ChatThread
        id={id}
        initialEvents={detail.events}
        initialLatestRun={detail.latestRun}
        initialMessages={detail.messages}
      />
    </div>
  );
}
