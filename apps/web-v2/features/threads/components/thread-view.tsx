"use client";

import { Button } from "@aqsha/ui/components/button";
import { Loader2Icon, PlusIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { useThread, useThreadMessages } from "../api";
import { chatMessagesToTimeline } from "../lib/eve-timeline";
import { threadTitle } from "../types";
import { MessageList } from "./message-list";

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

  // History persisted = teks + reasoning saja (D-F, live-only). Tool parts hanya
  // tampil saat turn berjalan, jadi reload tak memuat detail alat.
  const timeline = chatMessagesToTimeline(messages.data ?? []);
  const hasReasoning = timeline.some((m) => m.parts.some((p) => p.kind === "reasoning"));

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <p className="truncate font-medium text-sm">{threadTitle(thread.data)}</p>
        {thread.data.status === "failed" ? (
          <span className="text-red-500 text-xs">Gagal</span>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <MessageList messages={timeline} />
        <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
          {hasReasoning
            ? "Reasoning tersimpan. Detail langkah & alat hanya tampil saat percakapan berlangsung."
            : "Detail langkah & alat hanya tampil saat percakapan berlangsung."}
        </p>
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
