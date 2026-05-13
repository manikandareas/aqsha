"use client";

import { FileTextIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import type { RateStatus } from "../types";
import {
  formatCompactRelativeTime,
  formatNaturalRelativeTime,
} from "../utils/datetime";
import type { StartThread, ThreadSummary } from "./component-types";
import { Composer } from "./composer";
import { applySuggestion } from "./shared";

export function HomeStartState({
  recentThreads,
  rateStatus,
  startThread,
}: {
  recentThreads: ThreadSummary[];
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
}) {
  const router = useRouter();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-[12svh] sm:px-8 lg:pt-[10svh]">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            disabled={false}
            rateStatus={rateStatus}
            onStartThread={startThread}
            onSend={async () => ({ ok: true, messageId: "" })}
          />
          <HomePromptShortcuts />
          <RecentThreadList
            threads={recentThreads}
            onOpenThread={(threadId) => router.push(`/threads/${threadId}`)}
          />
        </div>
      </div>
    </main>
  );
}

export function EmptyThreadCopy({ title }: { title?: string }) {
  return (
    <div className="grid flex-1 place-items-center py-16 text-center">
      <div className="grid gap-5">
        <p className="font-hand text-2xl text-[var(--lavender)]">
          quiet desk, clear sources
        </p>
        <div className="grid gap-3">
          <h1 className="font-heading text-[28px] font-bold leading-tight sm:text-[32px]">
            {title ?? "Mulai riset dari satu pertanyaan."}
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-7 text-muted-foreground">
            Tempat tenang untuk menyusun pertanyaan, membaca kembali konteks,
            dan menjaga riset tetap rapi.
          </p>
        </div>
        <Suggestions className="mx-auto max-w-full justify-center">
          <Suggestion
            suggestion="Cari sumber tentang dampak AI pada pembelajaran mandiri."
            onClick={applySuggestion}
            className="border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)] hover:bg-[var(--mint-soft)]"
          >
            Cari sumber tentang...
          </Suggestion>
          <Suggestion
            suggestion="Buat ringkasan literatur tentang retrieval augmented generation untuk pendidikan."
            onClick={applySuggestion}
            className="border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary hover:bg-[var(--sky-soft)]"
          >
            Buat ringkasan literatur...
          </Suggestion>
          <Suggestion
            suggestion="Bandingkan dua teori belajar konstruktivisme dan connectivism dengan sumber akademik."
            onClick={applySuggestion}
            className="border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] text-[var(--lavender)] hover:bg-[var(--lavender-soft)]"
          >
            Bandingkan dua teori...
          </Suggestion>
        </Suggestions>
      </div>
    </div>
  );
}

export function AccessDeniedState() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center">
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight">
            Thread tidak tersedia.
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Thread ini tidak ditemukan untuk akun yang sedang masuk.
          </p>
        </div>
      </div>
      <div className="border-t bg-background/85 px-4 py-4 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <Composer
            disabled
            rateStatus={undefined}
            onStartThread={async () => ({ ok: true, messageId: "" })}
            onSend={async () => ({ ok: true, messageId: "" })}
          />
        </div>
      </div>
    </div>
  );
}

function HomePromptShortcuts() {
  return (
    <div className="mt-3 flex flex-wrap gap-2 px-0.5">
      <button
        type="button"
        onClick={() => applySuggestion("Cari sumber akademik tentang ")}
        className="inline-flex h-9 items-center rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-4 text-[13px] font-semibold text-[var(--mint)] transition-colors hover:bg-[var(--mint-soft)]/75"
      >
        Cari sumber
      </button>
      <button
        type="button"
        onClick={() => applySuggestion("Buat ringkasan literatur tentang ")}
        className="inline-flex h-9 items-center rounded-full border border-[var(--sky-soft-border)] bg-[var(--sky-soft)] px-4 text-[13px] font-semibold text-primary transition-colors hover:bg-[var(--sky-soft)]/75"
      >
        Ringkasan literatur
      </button>
      <button
        type="button"
        onClick={() =>
          applySuggestion("/deep Bandingkan bukti dan celah riset tentang ")
        }
        className="inline-flex h-9 items-center rounded-full border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] px-4 text-[13px] font-semibold text-[var(--lavender)] transition-colors hover:bg-[var(--lavender-soft)]/75"
      >
        Deep research
      </button>
    </div>
  );
}

function RecentThreadList({
  threads,
  onOpenThread,
}: {
  threads: ThreadSummary[];
  onOpenThread: (threadId: string) => void;
}) {
  if (threads.length === 0) {
    return null;
  }

  return (
    <section className="mt-16 w-full max-w-[520px]" aria-label="Thread terbaru">
      <div className="grid gap-4">
        {threads.map((thread) => (
          <button
            key={thread.threadId}
            type="button"
            onClick={() => onOpenThread(thread.threadId)}
            className="group grid w-full grid-cols-[6.75rem_1fr] items-center gap-3 text-left transition-opacity hover:opacity-90 max-sm:grid-cols-[5.75rem_1fr]"
          >
            <span className="flex h-[72px] flex-col justify-between rounded-[14px] border border-border bg-card px-4 py-3 transition-colors group-hover:border-[var(--lavender-soft-border)]">
              <span className="flex items-center justify-between text-[11px] font-semibold leading-none text-muted-foreground">
                <span>{thread.messageCount || 1}</span>
                <span className="font-mono font-medium text-muted-foreground/75">
                  {formatCompactRelativeTime(thread.lastActivityAt)}
                </span>
              </span>
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--lavender)]">
                <FileTextIcon className="size-3" />
                {threadStatusLabel(thread.status)}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-4 text-foreground">
                {thread.title || "Thread baru"}
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-medium leading-4 text-muted-foreground">
                <FileTextIcon className="size-3 shrink-0 text-[var(--lavender)]" />
                <span className="truncate">
                  {formatNaturalRelativeTime(thread.lastActivityAt)}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function threadStatusLabel(status: "idle" | "streaming" | "failed") {
  if (status === "streaming") return "Aktif";
  if (status === "failed") return "Perlu cek";
  return "Thread";
}
