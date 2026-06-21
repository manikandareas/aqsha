"use client";

import { Button } from "@aqsha/ui/components/button";
import { Loader2Icon, PlusIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { useThread, useThreadMessages } from "../api";
import { chatMessagesToTimeline, type TimelineMessage } from "../lib/eve-timeline";
import { threadTitle } from "../types";
import { ChatSurface } from "./chat-surface";
import { ThreadRecentSwitcher } from "./thread-recent-switcher";

/**
 * View thread tersimpan (Slice 6.8) — kini LIVE: history persisted di-render lalu composer
 * melanjutkan percakapan (turn baru di session eve durable, `sessionId == threadId`).
 * History di-SNAPSHOT sekali (freeze) supaya refetch `onFinish` (yang kini memuat turn baru)
 * tak duplikat dengan buffer live `ChatSurface`. Tool-parts tak persist (D-F live-only) →
 * history = teks + reasoning saja; detail alat hanya tampil saat turn berjalan.
 */
export function ThreadView({ threadId }: { threadId: string }) {
  const thread = useThread(threadId);
  const messages = useThreadMessages(threadId);

  // Snapshot history SEKALI (setState saat render, guarded — bukan effect, bukan useMemo:
  // useMemo akan recompute saat refetch `onFinish` dan menarik turn baru → duplikat dgn
  // live buffer). Begitu data tersedia, freeze; refetch berikutnya diabaikan.
  const [history, setHistory] = useState<TimelineMessage[] | null>(null);
  if (history === null && messages.data) {
    setHistory(chatMessagesToTimeline(messages.data));
  }

  if (thread.isLoading || messages.isLoading || (messages.data && history === null)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!thread.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground text-sm">Percakapan tidak ditemukan.</p>
        <Button asChild variant="outline">
          <Link href="/app/threads">
            <PlusIcon />
            Percakapan baru
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <p className="truncate font-medium text-sm">{threadTitle(thread.data)}</p>
        <div className="flex items-center gap-2">
          {thread.data.status === "failed" ? (
            <span className="text-red-500 text-xs">Gagal</span>
          ) : null}
          <ThreadRecentSwitcher activeId={threadId} />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatSurface
          initialSession={{ sessionId: threadId, streamIndex: 0 }}
          history={history ?? []}
        />
      </div>
    </div>
  );
}
