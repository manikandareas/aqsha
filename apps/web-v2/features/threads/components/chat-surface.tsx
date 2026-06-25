"use client";

import { useQueryClient } from "@tanstack/react-query";
import { m, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConversationContent } from "@/components/ai-elements/conversation-content";
import { Conversation } from "@/components/ai-elements/conversation-root";
import { ConversationScrollButton } from "@/components/ai-elements/conversation-scroll-button";
import { HomeExploreBento } from "@/features/discovery/components/home-explore-bento";
import { ComposerHeroState } from "@/features/thread-experience/components/composer-hero-state";
import { ExploreHandwrittenCue } from "@/features/thread-experience/components/explore-handwritten-cue";
import { useApi } from "@/lib/api-client";
import { queryKeys } from "@/lib/api-query";
import { panelBodyPaddingClass, threadTranscriptColumnClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type { EveAgentReducerEvent } from "eve/react";
import { useSendStatus, useThreadSources, useThreadsList } from "../api";
import { eventsToTimeline, mergeStreamEventLogs, type TimelineMessage } from "../lib/eve-timeline";
import { useAstraAgent } from "../lib/use-astra-agent";
import { useThreadResume } from "../lib/use-thread-resume";
import { threadTitle, type ResearchSource } from "../types";
import { type ComposerNotice, Composer, type RecentThread } from "./composer";
import { MessageList } from "./message-list";

/** Teks user terakhir di timeline (untuk dedup bubble pending lintas-reload). */
function lastUserText(messages: readonly TimelineMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = m.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}

/**
 * Recovery bubble user lintas-reload (baseline template) — render pesan pending HANYA bila
 * belum hadir di timeline (resume-stream / history). TANPA auto-consume (hindari double-turn
 * + double-bill); resume-stream yang melanjutkan turn-nya. Hilang sendiri begitu `message.received`
 * tiba (teks cocok → dedup).
 */
function appendPendingUserMessage(
  messages: TimelineMessage[],
  pending: string | null | undefined,
): TimelineMessage[] {
  if (!pending || lastUserText(messages) === pending.trim()) return messages;
  return [
    ...messages,
    {
      id: "pending-user-message",
      role: "user",
      streaming: false,
      parts: [{ kind: "text", id: "pending-user-message:0", text: pending, streaming: false }],
    },
  ];
}

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
 * Surface chat live (Slice 6.1/6.8 → simplifikasi eve-chat-template) — dipakai chat BARU (landing
 * /app) maupun lanjut thread lama. Saat KOSONG, render landing identik V1 (hero + composer kaya +
 * explore bento). Begitu turn dimulai, beralih in-place ke transkrip — agent tetap dimiliki komponen
 * ini supaya transisi mulus (`useAstraAgent` bump URL via `history.replaceState`, tanpa remount).
 *
 * **SATU jalur event log** (port template): `initialEvents` (persisted server-authoritative) digabung
 * di LEVEL EVENT dengan buffer live (`agent.events`) atau overlay resume (`[...initial,...resumed]`),
 * di-reduce SEKALI (`eventsToTimeline`). Tak ada lagi merge 3-sumber / dedup turnId. `legacyHistory` =
 * prefix thread pra-event (teks saja), di-render SEBELUM jalur event.
 */
export function ChatSurface({
  initialSession,
  initialEvents = [],
  legacyHistory = [],
  streamActive = false,
  pendingUserMessage = null,
  compact = false,
  seed,
  ambientWorkspaceId = null,
}: {
  initialSession?: { sessionId: string; streamIndex: number; continuationToken?: string | null };
  /** Event log mentah persisted (1:1) — sumber timeline tunggal (digabung level event). */
  initialEvents?: readonly EveAgentReducerEvent[];
  /** Timeline thread PRA-event (teks `chat_messages` saja) → prefix read-only, kosong utk thread normal. */
  legacyHistory?: TimelineMessage[];
  /** `isStreamActive(events)` saat mount → ada turn in-flight yang perlu di-resume. */
  streamActive?: boolean;
  /** Recovery pesan terkirim yang turn-nya belum settle (baseline template). */
  pendingUserMessage?: string | null;
  compact?: boolean;
  seed?: string;
  ambientWorkspaceId?: string | null;
}) {
  const { agent } = useAstraAgent(initialSession);
  const sendStatus = useSendStatus();
  const qc = useQueryClient();
  const api = useApi();
  const sessionId = agent.session?.sessionId ?? initialSession?.sessionId ?? null;

  // Resume turn in-flight lintas-refresh: buka ULANG durable stream eve dari ekor turn aktif
  // (`startIndex = max(event_index)+1`). Aktif HANYA saat reload masuk ke turn berjalan
  // (`streamActive`) DAN tab ini tak sedang mengirim (`agent.status === "ready"`).
  const resume = useThreadResume({
    sessionId,
    startIndex: initialSession?.streamIndex ?? 0,
    enabled: streamActive && agent.status === "ready",
  });
  const resuming = resume.resuming;
  const busy = agent.status === "submitted" || agent.status === "streaming" || resuming;
  const notice = blockedNotice(sendStatus.data);
  const blocked = notice !== null;

  // Overlay swap (port template): saat resume aktif (atau punya buffer resume & tab ini tak kirim),
  // base = prefix persisted ++ ekor resume (disjoint by `startIndex`). Selain itu, gabung event live
  // (`agent.events`) ke prefix di level event (dedup). Reduce SEKALI → satu daftar pesan.
  // ponytail: overlay = concat; invarian `useThreadEvents` tak di-refetch selagi resuming (chat-surface
  // invalidate hanya saat settle) → disjoint. Pakai mergeStreamEventLogs di sini bila race refetch muncul.
  const hasResumeOverlay = resuming || (resume.resumedEvents.length > 0 && agent.events.length === 0);
  const base = useMemo(
    () =>
      hasResumeOverlay
        ? [...initialEvents, ...resume.resumedEvents]
        : mergeStreamEventLogs(initialEvents, agent.events),
    [hasResumeOverlay, initialEvents, resume.resumedEvents, agent.events],
  );
  // Reduce event log → timeline SEKALI per perubahan log/busy (bukan tiap render — keystroke
  // composer, toggle status, dll. tak memicu replay reducer + merge O(n) ulang).
  const messages = useMemo(
    () =>
      appendPendingUserMessage(
        [...legacyHistory, ...eventsToTimeline(base, busy)],
        pendingUserMessage,
      ),
    [legacyHistory, base, busy, pendingUserMessage],
  );
  const isEmpty = messages.length === 0 && !busy;

  // Resume settle → events/sources/detail di-refetch supaya turn yang baru selesai pindah ke
  // history (handoff dari buffer resume) + sumber/kredit ter-update.
  const prevResuming = useRef(false);
  useEffect(() => {
    if (prevResuming.current && !resuming && sessionId) {
      qc.invalidateQueries({ queryKey: queryKeys.threads.events(sessionId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads.sources(sessionId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads.detail(sessionId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads.all });
    }
    prevResuming.current = resuming;
  }, [resuming, sessionId, qc]);

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

  // Kirim turn + tandai pesan pending (recovery lintas-reload, baseline template). `markPending`
  // hanya saat thread sudah ada (follow-up; turn pertama belum punya sessionId) — fire-and-forget;
  // `clearPending` saat kirim gagal. eve men-stream user message-nya sendiri (`message.received`).
  const sendTurn = (text: string, clientContext?: string[]) => {
    setLastSent(text);
    if (sessionId) {
      void api.threads({ id: sessionId }).pending.post({ message: text }).catch(() => {});
    }
    void agent
      .send({ message: text, ...(clientContext ? { clientContext } : {}) })
      .catch(() => {
        if (sessionId) void api.threads({ id: sessionId }).pending.delete().catch(() => {});
      });
  };

  // Ulangi (regenerate): kirim ulang teks user terakhir sebagai turn baru (eve tak bisa
  // mengganti jawaban in-place). Sumber teks = transkrip (andal lintas reload), fallback lastSent.
  const regenerate = () => {
    const text = lastUserText(messages) ?? lastSent;
    if (!text) return;
    sendTurn(text);
  };

  const wiring: ComposerWiring = {
    onSend: (payload) => sendTurn(payload.text, payload.clientContext),
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
    <div className="flex h-full min-h-0 w-full flex-col">
      <Conversation className="flex-1">
        {/* Scroll surface full-bleed (max-w-none p-0) → scrollbar di pojok kanan container;
            row & composer di-center lewat kolom transkrip (threadTranscriptColumnClass). */}
        <ConversationContent className="max-w-none p-0">
          <div className={cn(threadTranscriptColumnClass, "flex flex-col gap-4 pt-3 pb-8")}>
            <MessageList
              messages={messages}
              pending={busy}
              busy={busy}
              sourcesByTurn={sourcesByTurn}
              onRegenerate={regenerate}
            />
            {agent.error ? (
              <p className="text-red-500 text-sm">{agent.error.message || "Terjadi kesalahan."}</p>
            ) : null}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className={cn(threadTranscriptColumnClass, "pt-2.5 pb-4")}>
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
