"use client";

import { Button } from "@aqsha/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { ConversationContent } from "@/components/ai-elements/conversation-content";
import { Conversation } from "@/components/ai-elements/conversation-root";
import { ConversationScrollButton } from "@/components/ai-elements/conversation-scroll-button";
import { HomeExploreBento } from "@/features/discovery/components/home-explore-bento";
import { useSendStatus, useThreadsList } from "@/features/threads/api";
import { Composer, type ComposerNotice, type RecentThread } from "@/features/threads/components/composer";
import { MessageList } from "@/features/threads/components/message-list";
import { ASTRA_AGENT_ID, useMastraClient } from "@/features/threads/lib/mastra-client";
import type { TimelineMessage } from "@/features/threads/lib/timeline-types";
import { mastraMessagesToTimeline } from "@/features/threads/lib/mastra-timeline";
import { useMastraAgent } from "@/features/threads/lib/use-mastra-agent";
import { threadTitle } from "@/features/threads/types";
import { queryKeys } from "@/lib/api-query";
import { panelBodyPaddingClass, threadTranscriptColumnClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { ComposerHeroState } from "./composer-hero-state";
import { ExploreHandwrittenCue } from "./explore-handwritten-cue";
import { CenteredLoading } from "./shared";

const HOME_EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Map status kirim terblok → notice composer (billing return-union / cooldown). */
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

/** Teks user terakhir di timeline (untuk regenerate). */
function lastUserText(messages: readonly TimelineMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const text = msg.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}

/**
 * Surface chat runtime MASTRA — komposisi V1 (composer KAYA + landing hero + explore bento)
 * di atas `useMastraAgent`. Mastra Memory (server) = SoT pesan; `@mastra/client-js` menangani
 * stream + persist; thread id ditentukan klien (Mastra mengizinkannya), jadi URL di-bump SEGERA
 * saat kirim pertama (tanpa discovery race ala eve). HITL = kartu approval tool. Sumber riset
 * tetap via API `research_sources` (panel terpisah).
 */
export function MastraChatThreadSurface({
  threadId,
  isLoading,
  compact = false,
  seed,
}: {
  threadId?: string;
  isLoading?: boolean;
  compact?: boolean;
  seed?: string;
}) {
  // Thread baru: id klien-side stabil (Mastra mengizinkan klien menentukan thread id).
  const [newThreadId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Date.now()}`,
  );
  const effectiveThreadId = threadId ?? newThreadId;

  const client = useMastraClient();
  const { data: historyMessages, isLoading: historyLoading } = useQuery({
    queryKey: ["mastra", "thread-messages", threadId],
    enabled: Boolean(threadId),
    queryFn: async () => {
      const thread = client.getMemoryThread({ threadId: threadId!, agentId: ASTRA_AGENT_ID });
      const res = await thread.listMessages();
      return mastraMessagesToTimeline(res.messages ?? []);
    },
  });

  if (isLoading || (threadId && historyLoading)) {
    return <CenteredLoading label="Memuat thread..." />;
  }

  return (
    <MastraChatInner
      key={effectiveThreadId}
      threadId={effectiveThreadId}
      isExistingThread={Boolean(threadId)}
      seed={historyMessages ?? []}
      compact={compact}
      initialContent={seed}
    />
  );
}

function MastraChatInner({
  threadId,
  isExistingThread,
  seed,
  compact,
  initialContent,
}: {
  threadId: string;
  isExistingThread: boolean;
  seed: TimelineMessage[];
  compact: boolean;
  initialContent?: string;
}) {
  const agent = useMastraAgent({ threadId, seedMessages: seed });
  const sendStatus = useSendStatus();
  const qc = useQueryClient();
  const boundRef = useRef(isExistingThread);

  const busy = agent.status !== "ready";
  const notice = blockedNotice(sendStatus.data);
  const blocked = notice !== null;
  const isEmpty = agent.messages.length === 0 && !busy;

  // Kirim pertama dari thread baru → bump URL ke /app/threads/<id> (history.replaceState, tanpa
  // navigasi Next → komponen tetap mounted) supaya refresh me-resume thread. Klien sudah tahu id.
  const send = (text: string, clientContext?: string[]) => {
    if (!boundRef.current && typeof window !== "undefined") {
      boundRef.current = true;
      window.history.replaceState(window.history.state, "", `/app/threads/${threadId}`);
    }
    void agent.send(text, clientContext).then(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.threads.sendStatus() });
    });
  };

  const onComposerSend = (payload: { text: string; clientContext?: string[] }) =>
    send(payload.text, payload.clientContext);

  const regenerate = () => {
    const text = lastUserText(agent.messages);
    if (text) send(text);
  };

  const approvalCards =
    agent.approvals.length > 0 ? (
      <div className={cn(threadTranscriptColumnClass, "flex flex-col gap-2")}>
        {agent.approvals.map((a) => (
          <div
            key={a.toolCallId}
            className="rounded-lg border border-border bg-card p-3 text-sm"
          >
            <p className="mb-2 text-foreground">
              {a.title}
              {typeof a.args.artifactId === "string" ? ` — ${a.args.artifactId}` : ""}? Setujui untuk
              menjalankan.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void agent.approve(a.toolCallId)}>
                Setujui
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void agent.decline(a.toolCallId)}>
                Tolak
              </Button>
            </div>
          </div>
        ))}
      </div>
    ) : null;

  if (isEmpty) {
    return (
      <MastraComposerLanding
        compact={compact}
        initialContent={initialContent}
        busy={busy}
        disabled={blocked}
        notice={notice}
        errorDraft={agent.error ? lastUserText(agent.messages) : null}
        onSend={onComposerSend}
        onStop={agent.stop}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-none p-0">
          <div className={cn(threadTranscriptColumnClass, "flex flex-col gap-4 pt-3 pb-8")}>
            <MessageList
              messages={agent.messages}
              pending={agent.status === "submitted"}
              busy={busy}
              onRegenerate={regenerate}
            />
            {agent.error ? <p className="text-red-500 text-sm">{agent.error.message}</p> : null}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className={cn(threadTranscriptColumnClass, "flex flex-col gap-2.5 pt-2.5 pb-4")}>
        {approvalCards}
        <Composer
          onSend={onComposerSend}
          onStop={agent.stop}
          busy={busy}
          disabled={blocked}
          notice={notice}
          threadId={threadId}
          errorDraft={agent.error ? lastUserText(agent.messages) : null}
          placeholder="Tulis pesan untuk Astra…"
        />
      </div>
    </div>
  );
}

/** Landing /app identik V1 — hero + composer kaya + explore bento. */
function MastraComposerLanding({
  compact,
  initialContent,
  busy,
  disabled,
  notice,
  errorDraft,
  onSend,
  onStop,
}: {
  compact: boolean;
  initialContent?: string;
  busy: boolean;
  disabled: boolean;
  notice: ComposerNotice | null;
  errorDraft: string | null;
  onSend: (payload: { text: string; clientContext?: string[] }) => void;
  onStop: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const threadsList = useThreadsList();
  const recentThreads: RecentThread[] = (threadsList.data?.pages ?? []).flatMap((page) =>
    page.items.map((t) => ({ threadId: t.id, title: threadTitle(t), lastActivityAt: t.lastActivityAt })),
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
          transition={{ duration: shouldReduceMotion ? 0.14 : 0.24, ease: HOME_EASE_OUT }}
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
              initialContent={initialContent}
              onSend={onSend}
              onStop={onStop}
              busy={busy}
              disabled={disabled}
              notice={notice}
              errorDraft={errorDraft}
            />
          </ComposerHeroState>
        </m.div>
        {compact ? null : <ExploreHandwrittenCue shouldReduceMotion={shouldReduceMotion ?? false} />}
      </div>
      {compact ? null : <HomeExploreBento />}
    </main>
  );
}
