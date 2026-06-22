"use client";

import { m, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HomeExploreBento } from "@/features/discovery/components/home-explore-bento";
import { ComposerHeroState } from "@/features/thread-experience/components/composer-hero-state";
import { ExploreHandwrittenCue } from "@/features/thread-experience/components/explore-handwritten-cue";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useSendStatus, useThreadSources, useThreadsList } from "../api";
import { evePartsToTimeline, type TimelineMessage } from "../lib/eve-timeline";
import { useAstraAgent } from "../lib/use-astra-agent";
import { threadTitle, type ResearchSource } from "../types";
import { type ComposerNotice, Composer, type RecentThread } from "./composer";
import { MessageList } from "./message-list";

const HOME_EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Map status kirim terblok → notice composer (pesan ramah + retryAt untuk countdown). */
function blockedNotice(status: ReturnType<typeof useSendStatus>["data"]): ComposerNotice | null {
  if (!status || status.canSend) return null;
  switch (status.reason) {
    case "cooldown":
      return { message: "Terlalu cepat. Tunggu sebentar sebelum mengirim lagi.", retryAt: status.retryAt };
    case "quota_exceeded":
      return { message: "Kredit chat bulan ini sudah habis. Tingkatkan paket atau tunggu reset." };
    case "subscription_required":
      return { message: "Fitur ini butuh paket berbayar. Tingkatkan paket untuk melanjutkan." };
    case "billing_inactive":
      return { message: "Langganan tidak aktif. Perbarui pembayaran untuk melanjutkan." };
    default:
      return { message: "Pengiriman sedang tidak tersedia." };
  }
}

/** Props composer yang sama untuk landing (hero) maupun transkrip (docked). */
type ComposerWiring = {
  onSend: (payload: { text: string; clientContext?: string[] }) => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
  notice: ComposerNotice | null;
  threadId: string | null;
  errorDraft: string | null;
  ambientWorkspaceId: string | null;
};

/**
 * Surface chat live (Slice 6.1/6.8) — dipakai chat BARU (landing /app) maupun lanjut thread
 * lama. Saat KOSONG (belum ada pesan), render landing identik V1 (hero + composer kaya +
 * panel "Thread terbaru/Suggestion" + explore bento). Begitu turn dimulai (`messages`/`busy`),
 * beralih in-place ke transkrip — agent tetap dimiliki komponen ini supaya transisi mulus
 * (`useAstraAgent` bump URL via `history.replaceState`, tanpa remount). `history` = snapshot
 * transkrip persisted (thread lama); di-render SEBELUM buffer live, tak duplikat.
 */
export function ChatSurface({
  initialSession,
  history,
  compact = false,
  seed,
  ambientWorkspaceId = null,
}: {
  initialSession?: { sessionId: string; streamIndex: number; continuationToken?: string | null };
  history?: TimelineMessage[];
  compact?: boolean;
  seed?: string;
  ambientWorkspaceId?: string | null;
}) {
  const { agent } = useAstraAgent(initialSession);
  const sendStatus = useSendStatus();
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const notice = blockedNotice(sendStatus.data);
  const blocked = notice !== null;

  const live = evePartsToTimeline(agent.data.messages);
  const messages = history && history.length > 0 ? [...history, ...live] : live;
  const partCount = messages.reduce((n, msg) => n + msg.parts.length, 0);
  const sessionId = agent.session?.sessionId ?? initialSession?.sessionId ?? null;
  const isEmpty = messages.length === 0 && !busy;

  // Retry (Slice 6.8): simpan teks turn terakhir; saat error, kembalikan ke composer
  // (resend = turn baru; turn gagal tanpa step.completed = tak ada debit → no re-charge).
  const [lastSent, setLastSent] = useState("");

  // Sumber riset per-turn (research_sources, di-map via turnId) → InlineSources di bawah
  // jawaban turn yang menghasilkannya. Refetch saat turn selesai (gated !busy).
  const sourcesQuery = useThreadSources(sessionId ?? "", Boolean(sessionId) && !busy);
  const sourcesByTurn = useMemo(() => {
    const map = new Map<string, ResearchSource[]>();
    for (const s of sourcesQuery.data ?? []) {
      const list = map.get(s.turnId);
      if (list) list.push(s);
      else map.set(s.turnId, [s]);
    }
    return map;
  }, [sourcesQuery.data]);

  // Ulangi (regenerate): kirim ulang teks user terakhir sebagai turn baru (eve tak bisa
  // mengganti jawaban in-place). Sumber teks = transkrip (andal lintas reload), fallback lastSent.
  // Reduce murah → dihitung inline (memoizing atas `messages` non-stabil tak berguna).
  const lastUserText =
    [...messages].reverse().find((m) => m.role === "user")?.parts.reduce(
      (acc, p) => (p.kind === "text" ? acc + p.text : acc),
      "",
    ) ?? "";
  const regenerate = () => {
    const text = lastUserText || lastSent;
    if (!text) return;
    setLastSent(text);
    void agent.send({ message: text });
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll saat transkrip/parts berubah
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, partCount, agent.status]);

  const wiring: ComposerWiring = {
    onSend: (payload) => {
      setLastSent(payload.text);
      void agent.send({
        message: payload.text,
        ...(payload.clientContext ? { clientContext: payload.clientContext } : {}),
      });
    },
    onStop: () => agent.stop(),
    busy,
    disabled: blocked,
    notice,
    threadId: sessionId,
    errorDraft: agent.error ? lastSent : null,
    ambientWorkspaceId,
  };

  if (isEmpty) {
    return <ComposerLanding wiring={wiring} compact={compact} seed={seed} />;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList
          messages={messages}
          pending={busy}
          busy={busy}
          onRespond={(r) => void agent.send({ inputResponses: [r] })}
          sourcesByTurn={sourcesByTurn}
          onRegenerate={regenerate}
        />
        {agent.error ? (
          <p className="mt-4 text-red-500 text-sm">{agent.error.message || "Terjadi kesalahan."}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="p-4 pt-0">
        <Composer
          onSend={(p) => wiring.onSend(p)}
          onStop={wiring.onStop}
          busy={wiring.busy}
          disabled={wiring.disabled}
          notice={wiring.notice}
          threadId={wiring.threadId}
          errorDraft={wiring.errorDraft}
          ambientWorkspaceId={wiring.ambientWorkspaceId}
          placeholder="Tulis pesan untuk Astra…"
        />
      </div>
    </div>
  );
}

/** Landing /app identik V1 — hero + composer kaya (variant hero, start panel) + explore bento. */
function ComposerLanding({
  wiring,
  compact,
  seed,
}: {
  wiring: ComposerWiring;
  compact: boolean;
  seed?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const threadsList = useThreadsList();
  const recentThreads: RecentThread[] = useMemo(
    () =>
      (threadsList.data?.pages ?? [])
        .flatMap((page) => page.items)
        .map((t) => ({ threadId: t.id, title: threadTitle(t), lastActivityAt: t.lastActivityAt })),
    [threadsList.data],
  );

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div
        className={cn(
          "relative mx-auto flex w-full items-center justify-center",
          compact
            ? cn("flex-1 max-w-none", panelBodyPaddingClass)
            : "min-h-[calc(100%-5rem)] max-w-5xl px-4 py-10 sm:px-8",
        )}
      >
        <m.div
          className={cn("w-full", compact ? "max-w-none" : "max-w-2xl")}
          initial={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, transform: "translateY(10px) scale(0.985)" }
          }
          animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
          transition={{
            duration: shouldReduceMotion ? 0.14 : 0.24,
            ease: HOME_EASE_OUT,
          }}
        >
          <ComposerHeroState
            headerClassName="mb-5 gap-2"
            logoClassName={compact ? "size-12 sm:size-18" : "size-12 sm:size-22"}
            titleClassName={cn(
              "font-sans font-bold tracking-tight text-foreground leading-none",
              compact ? "text-xl" : "text-2xl sm:text-3xl",
            )}
          >
            <Composer
              showSuggestions={!compact}
              recentThreads={recentThreads}
              initialContent={seed}
              onSend={(p) => wiring.onSend(p)}
              onStop={wiring.onStop}
              busy={wiring.busy}
              disabled={wiring.disabled}
              notice={wiring.notice}
              threadId={wiring.threadId}
              errorDraft={wiring.errorDraft}
              ambientWorkspaceId={wiring.ambientWorkspaceId}
            />
          </ComposerHeroState>
        </m.div>
        {compact ? null : (
          <ExploreHandwrittenCue shouldReduceMotion={shouldReduceMotion ?? false} />
        )}
      </div>
      {compact ? null : <HomeExploreBento />}
    </main>
  );
}
