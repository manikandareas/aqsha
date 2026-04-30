import { notFound } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
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
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between bg-background px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
          <h1 className="line-clamp-1 text-base font-medium leading-none tracking-normal text-foreground">
            {detail.thread.title}
          </h1>
        </div>
      </header>
      <ChatThread id={id} initialMessages={detail.messages} />
    </div>
  );
}
