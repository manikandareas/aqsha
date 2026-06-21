"use client";

import { Button } from "@aqsha/ui/components/button";
import { Loader2Icon, PlusIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { useThread, useThreadMessages } from "../api";
import { threadTitle } from "../types";
import { type ChatBubble, MessageList } from "./message-list";

/**
 * View history thread (Slice 6.1) — READ-ONLY. Membuka thread tersimpan menampilkan
 * transkrip persisted. Melanjutkan percakapan lama (resume eve session lintas-reload)
 * = slice lanjutan; di sini composer diarahkan ke "percakapan baru".
 */
export function ThreadView({ threadId }: { threadId: string }) {
  const thread = useThread(threadId);
  const messages = useThreadMessages(threadId);

  if (thread.isLoading || messages.isLoading) {
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

  const bubbles: ChatBubble[] = (messages.data ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
  }));

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <p className="truncate font-medium text-sm">{threadTitle(thread.data)}</p>
        {thread.data.status === "failed" ? (
          <span className="text-red-500 text-xs">Gagal</span>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <MessageList messages={bubbles} />
      </div>

      <div className="p-4 pt-0">
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/30 px-4 py-3">
          <p className="text-muted-foreground text-xs">
            Lanjutkan percakapan ini akan tersedia segera. Mulai percakapan baru untuk bertanya.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/app/threads">
              <PlusIcon />
              Baru
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
