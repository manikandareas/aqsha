"use client";

import { Button } from "@aqsha/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRightIcon, ClockIcon, RotateCcwIcon, XIcon } from "@aqsha/ui/icons";
import { ConversationContent } from "@/components/ai-elements/conversation-content";
import { Conversation } from "@/components/ai-elements/conversation-root";
import { ConversationScrollButton } from "@/components/ai-elements/conversation-scroll-button";
import { HomeBannerCarousel } from "@/components/home-banner-carousel";
import { HomeExploreBento } from "@/features/discovery/components/home-explore-bento";
import {
  usePinnedThreads,
  useSendStatus,
  useThread,
  useThreadArtifacts,
  useThreadsList,
  useThreadSources,
} from "@/features/threads/api";
import {
  Composer,
  type ComposerNotice,
  type ComposerSendPayload,
  type RecentThread,
} from "@/features/threads/components/composer";
import { MessageList } from "@/features/threads/components/message-list";
import { QuestionsCard } from "@/features/threads/components/questions-card";
import { bucketMessageAttachments } from "@/features/threads/lib/attachment-buckets";
import {
  type AgentKind,
  ASTRA_AGENT_ID,
  useMastraClient,
} from "@/features/threads/lib/mastra-client";
import type { TimelineMessage } from "@/features/threads/lib/timeline-types";
import { buildThreadPanelLookups } from "@/features/threads/lib/thread-panel-data";
import { mastraMessagesToTimeline } from "@/features/threads/lib/mastra-timeline";
import { useMastraAgent } from "@/features/threads/lib/use-mastra-agent";
import type { ResearchSource } from "@/features/threads/types";
import { threadTitle } from "@/features/threads/types";
import { queryKeys } from "@/lib/api-query";
import {
  panelBodyPaddingClass,
  threadTranscriptColumnClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type { ContextRef } from "@aqsha/chat-core";
import { useAmbientContextRefs } from "./composer-context-mentions";
import {
  useRegisterThreadPanelData,
  useThreadPanel,
} from "./thread-panel-context";
import { LIVE_PLAN_KEY } from "../utils/thread-panel-model";
import { ComposerHeroState } from "./composer-hero-state";
import { ExploreHandwrittenCue } from "./explore-handwritten-cue";
import { CenteredLoading } from "./shared";

const HOME_EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Map status kirim terblok → notice composer (billing return-union / cooldown). */
function blockedNotice(
  status: ReturnType<typeof useSendStatus>["data"],
): ComposerNotice | null {
  if (!status || status.canSend) return null;
  switch (status.reason) {
    case "cooldown":
      return {
        message: "Terlalu cepat. Tunggu sebentar sebelum mengirim lagi.",
        retryAt: status.retryAt,
      };
    case "quota_exceeded":
      return {
        message:
          "Kredit chat bulan ini sudah habis. Tingkatkan paket atau tunggu reset.",
      };
    case "subscription_required":
      return {
        message:
          "Fitur ini butuh paket berbayar. Tingkatkan paket untuk melanjutkan.",
      };
    case "billing_inactive":
      return {
        message:
          "Langganan tidak aktif. Perbarui pembayaran untuk melanjutkan.",
      };
    default:
      return { message: "Pengiriman sedang tidak tersedia." };
  }
}

/**
 * Pesan blokir pre-check `/deep` (feature `deep_research`) — dipakai sebagai toast saat submit
 * (FE-11): user kehabisan cap `/deep` harus tahu SEBELUM Workflow jalan, bukan gagal mid-run.
 */
function deepBlockedMessage(status: ReturnType<typeof useSendStatus>["data"]): string {
  if (!status || status.canSend) return "Riset mendalam sedang tidak tersedia.";
  switch (status.reason) {
    case "cooldown":
      return "Terlalu cepat. Tunggu sebentar sebelum menjalankan /deep lagi.";
    case "quota_exceeded":
      return "Kuota riset mendalam (/deep) bulan ini sudah habis. Tingkatkan paket atau tunggu reset.";
    case "subscription_required":
      return "Riset mendalam butuh paket berbayar. Tingkatkan paket untuk melanjutkan.";
    case "billing_inactive":
      return "Langganan tidak aktif. Perbarui pembayaran untuk melanjutkan.";
    default:
      return "Riset mendalam sedang tidak tersedia.";
  }
}

/**
 * FE-1: `listMessages()` tanpa `perPage` jatuh ke `config.lastMessages` server (16 — dan fetch selalu
 * via id `astra-lite`, jadi thread Pro pun ikut 16) → thread panjang kehilangan pesan lama setelah
 * refresh tanpa indikasi. `perPage` HARUS angka (query di-parse `z.coerce.number`; `false` → 400).
 * Server mengambil N TERBARU lalu membalik → kronologis; 400 pesan ≈ 200 giliran, jauh di atas
 * thread wajar — melewati ini butuh paginasi sungguhan.
 */
const HISTORY_SEED_PER_PAGE = 400;

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
 * saat kirim pertama tanpa menunggu round-trip server. HITL = kartu approval tool. Sumber riset
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
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `t-${Date.now()}`,
  );
  const effectiveThreadId = threadId ?? newThreadId;

  const client = useMastraClient();
  const {
    data: historyMessages,
    isLoading: historyLoading,
    isFetching: historyFetching,
  } = useQuery({
    queryKey: ["mastra", "thread-messages", threadId],
    enabled: Boolean(threadId),
    queryFn: async () => {
      const thread = client.getMemoryThread({
        threadId: threadId!,
        agentId: ASTRA_AGENT_ID,
      });
      const res = await thread.listMessages({ perPage: HISTORY_SEED_PER_PAGE });
      return mastraMessagesToTimeline(res.messages ?? []);
    },
  });

  // FE-3: seed dikonsumsi SEKALI oleh `useState` initializer di inner — data cache BASI saat
  // kunjung ulang thread (chat → Explore → balik) membekukan turn baru sampai hard-reload karena
  // hasil refetch React Query diabaikan. Latch per-mount (pola adjust-state-during-render): tahan
  // first-paint sampai refetch on-mount selesai (data segar jadi seed); refetch background SETELAH
  // inner tampil tidak memblok.
  const [historySettled, setHistorySettled] = useState(false);
  if (!historyFetching && !historySettled) setHistorySettled(true);
  if (
    isLoading ||
    (threadId && (historyLoading || (historyFetching && !historySettled)))
  ) {
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
  // Tier TERSIMPAN thread (`chat_threads.agent_kind`) dibaca SEKALI di sini, gated ke thread existing
  // (thread baru = id klien tanpa baris server → tak ada GET 404). Diteruskan ke `useMastraAgent`
  // (seed channel agent untuk langganan/regenerate/approval) dan ke `Composer` (default selektor).
  const threadDetail = useThread(threadId, isExistingThread);
  const threadAgentKind: AgentKind =
    threadDetail.data?.agentKind === "pro" ? "pro" : "lite";
  const agent = useMastraAgent({
    threadId,
    seedMessages: seed,
    initialAgentKind: threadAgentKind,
  });
  const sendStatus = useSendStatus();
  // FE-11: pre-check kuota `/deep` (feature `deep_research`, non-consuming) — diperiksa saat submit
  // command deep supaya cap habis ketahuan sebelum Workflow jalan (dulu dead code tanpa call site).
  const deepSendStatus = useSendStatus("deep_research");
  const qc = useQueryClient();
  const ambientContextRefs = useAmbientContextRefs();
  const boundRef = useRef(isExistingThread);

  const busy = agent.status !== "ready";
  const notice = blockedNotice(sendStatus.data);
  const blocked = notice !== null;
  const isEmpty = agent.messages.length === 0 && !busy;

  // Sumber riset `/deep` (research_sources, citation_number) → dikelompokkan per turn (runId) untuk
  // dirender di bawah jawaban (G4). Fetch saat thread mapan (ada pesan) → hindari 404 thread baru.
  // FE-9: TANPA gate `!busy` — invalidasi mid-run (search-literature / assign-citations) harus bisa
  // refetch selagi streaming supaya kartu sumber terisi live; query `enabled:false` mengabaikan
  // invalidasi. Fetch idempoten & murah, aman berjalan saat busy.
  const { data: sources } = useThreadSources(threadId, agent.messages.length > 0);
  const sourcesByTurn = useMemo(() => {
    const map = new Map<string, ResearchSource[]>();
    for (const s of sources ?? []) {
      if (s.citationNumber == null) continue;
      const list = map.get(s.turnId);
      if (list) list.push(s);
      else map.set(s.turnId, [s]);
    }
    return map;
  }, [sources]);

  // Lampiran upload thread → dipetakan ke pesan user (join sisi-baca thread↔waktu) supaya berkas
  // yang dikirim user tampil sebagai kartu di message row. Poll selama ada index `pending`.
  const { data: threadArtifacts } = useThreadArtifacts(
    agent.messages.length > 0 ? threadId : null,
    { pollWhilePending: true },
  );
  // React Compiler (next.config `reactCompiler: true`) meng-cache turunan ini — recompute hanya saat
  // input berubah, jadi tak perlu memo manual. Scan-nya kecil (O(pesan-user × upload), array mungil).
  const attachmentsByMessage = bucketMessageAttachments(
    agent.messages,
    threadArtifacts,
  );

  const threadPanel = useThreadPanel();

  // Id-keyed detail lookups for the right-side panels (sources / search / step / plan).
  // The surface owns the parsed timeline + DB sources + plan gate, so it builds them
  // here and publishes them to `ThreadPanelProvider`; no-op in compact panels (no
  // provider). While the plan gate is live, the panel mirrors its Setujui/Tolak actions.
  const {
    messages: agentMessages,
    planGate,
    resolvePlan,
    askGate,
    resolveAsk,
  } = agent;
  const panelLookups = useMemo(() => {
    const lookups = buildThreadPanelLookups(
      agentMessages,
      sources,
      planGate,
      askGate,
    );
    // While a plan gate is live, mirror its Setujui/Tolak into the live plan entry so the
    // panel opened from the gate card carries the same actions.
    const livePlan = planGate ? lookups.plans.get(LIVE_PLAN_KEY) : undefined;
    if (livePlan) {
      lookups.plans.set(LIVE_PLAN_KEY, {
        ...livePlan,
        resolve: (approve: boolean) => void resolvePlan(approve),
      });
    }
    // While an ask gate is live, inject resolve/skip so the panel form submits the same answers.
    if (lookups.ask) {
      lookups.ask = {
        ...lookups.ask,
        resolve: (resume) => void resolveAsk(resume),
        skip: () => void resolveAsk({ action: "skipped" }),
      };
    }
    return lookups;
  }, [agentMessages, sources, planGate, resolvePlan, askGate, resolveAsk]);
  useRegisterThreadPanelData(panelLookups);

  // Kirim pertama dari thread baru → bump URL ke /app/threads/<id> (history.replaceState, tanpa
  // navigasi Next → komponen tetap mounted) supaya refresh me-resume thread. Klien sudah tahu id.
  const bumpUrl = () => {
    if (!boundRef.current && typeof window !== "undefined") {
      boundRef.current = true;
      // Preserve the query string (nuqs `?panel=` detail-panel state) — bumping to a
      // bare path would strip an open panel from the URL while nuqs React state still
      // holds it, desyncing them and closing the panel on the next refresh.
      window.history.replaceState(
        window.history.state,
        "",
        `/app/threads/${threadId}${window.location.search}`,
      );
    }
  };

  const onComposerSend = (payload: ComposerSendPayload) => {
    // FE-11: pre-check kuota `/deep` sebelum Workflow jalan. Backstop otoritatif tetap di server
    // (billing precheck); ini UX-ramah supaya cap habis tak baru ketahuan mid-run.
    if (payload.command === "deep") {
      const st = deepSendStatus.data;
      if (st && !st.canSend) {
        toast.error(deepBlockedMessage(st));
        return;
      }
    }
    bumpUrl();
    const run =
      payload.command === "deep"
        ? agent.sendDeep(
            payload.text,
            payload.clientContext,
            payload.richText,
            payload.attachmentIds,
            payload.agentKind,
          )
        : agent.send(
            payload.text,
            payload.clientContext,
            payload.richText,
            payload.attachmentIds,
            payload.agentKind,
          );
    void run.then(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.threads.sendStatus() });
      void qc.invalidateQueries({
        queryKey: queryKeys.threads.sendStatus("deep_research"),
      });
    });
  };

  const regenerate = () => {
    void agent.regenerate();
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
              {typeof a.args.artifactId === "string"
                ? ` — ${a.args.artifactId}`
                : ""}
              ? Setujui untuk menjalankan.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void agent.approve(a.toolCallId)}
              >
                Setujui
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void agent.decline(a.toolCallId)}
              >
                Tolak
              </Button>
            </div>
          </div>
        ))}
      </div>
    ) : null;

  // Kartu klarifikasi (`ask_questions`) — HITL Questions di atas composer (chat tool-suspend ATAU
  // /deep step clarify). Header punya aksi buka panel; jawab inline atau di panel kanan.
  const questionsCard = agent.askGate ? (
    <div className={cn(threadTranscriptColumnClass)}>
      <QuestionsCard
        questions={agent.askGate.questions}
        findings={agent.askGate.findings}
        onSubmit={(resume) => void agent.resolveAsk(resume)}
        onSkip={() => void agent.resolveAsk({ action: "skipped" })}
        onOpenPanel={threadPanel?.openQuestionsPanel}
      />
    </div>
  ) : null;

  // Plan-gate `/deep` (Workflow suspended di `approve-plan`) — kartu rencana HITL. BUKAN collapsible:
  // kartu statis (judul + ringkasan + Setujui/Tolak). Header bisa diklik → buka panel rencana penuh
  // (sub-pertanyaan + aksi yang sama), bukan expand inline. Dirender DI ATAS composer (sejajar approvalCards).
  const planGateCard = agent.planGate ? (
    <div className={cn(threadTranscriptColumnClass)}>
      <div className="rounded-xl border border-border bg-card p-4">
        {threadPanel?.openPlanPanel ? (
          <button
            type="button"
            onClick={() => threadPanel.openPlanPanel(LIVE_PLAN_KEY)}
            className="group -m-1 flex w-full items-start justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="grid min-w-0 gap-1">
              <span className="text-sm font-semibold text-foreground">
                Rencana riset
              </span>
              <span className="text-[13px] text-muted-foreground">
                {`${agent.planGate.subQuestions.length} sub-pertanyaan riset · ketuk untuk lihat detail`}
              </span>
            </div>
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
          </button>
        ) : (
          <div className="grid gap-1">
            <span className="text-sm font-semibold text-foreground">
              Rencana riset
            </span>
            <span className="text-[13px] text-muted-foreground">
              {`${agent.planGate.subQuestions.length} sub-pertanyaan riset · tinjau sebelum menyetujui`}
            </span>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => void agent.resolvePlan(true)}>
            Setujui
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void agent.resolvePlan(false)}
          >
            Tolak
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  // DUR-6: baris antrean — pesan yang menunggu giliran saat run aktif. Item server (chat polos,
  // `queueMessage`) jalan sendiri meski tab ditutup dan tak bisa dibatalkan; item klien bisa.
  const queuedRow =
    agent.queued.length > 0 ? (
      <div className={cn(threadTranscriptColumnClass, "flex flex-col gap-1.5")}>
        {agent.queued.map((q) => (
          <div
            key={q.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px]"
          >
            <ClockIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
            <span className="min-w-0 flex-1 truncate text-foreground/80">{q.text}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {q.mode === "deep" ? "Antre · /deep" : q.serverRunId ? "Antre di server" : "Antre"}
            </span>
            {q.serverRunId === undefined ? (
              <button
                type="button"
                onClick={() => agent.cancelQueued(q.id)}
                aria-label="Batalkan antrean"
                className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    ) : null;

  // DUR-5: run `/deep` tampak macet (snapshot tak maju beberapa menit — biasanya proses agent
  // sempat restart; run `running` tak resume sendiri) → tawarkan mulai ulang dari step terakhir.
  const stalledCard = agent.deepStalled ? (
    <div className={cn(threadTranscriptColumnClass)}>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-foreground">
          Riset mendalam tampak macet — tidak ada kemajuan beberapa menit terakhir.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => void agent.restartDeep()}>
            <RotateCcwIcon className="size-3.5" />
            Mulai ulang
          </Button>
          <Button size="sm" variant="ghost" onClick={agent.stop}>
            Hentikan
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  if (isEmpty) {
    return (
      <MastraComposerLanding
        compact={compact}
        initialContent={initialContent}
        ambientContextRefs={ambientContextRefs}
        busy={busy}
        disabled={blocked}
        notice={notice}
        threadId={threadId}
        threadAgentKind={threadAgentKind}
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
          <div
            className={cn(
              threadTranscriptColumnClass,
              "flex flex-col gap-4 pt-3 pb-8",
            )}
          >
            <MessageList
              messages={agent.messages}
              pending={agent.status === "submitted"}
              busy={busy}
              sourcesByTurn={sourcesByTurn}
              attachmentsByMessage={attachmentsByMessage}
              onRegenerate={regenerate}
            />
            {agent.error ? (
              <p className="text-red-500 text-sm">{agent.error.message}</p>
            ) : null}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div
        className={cn(
          threadTranscriptColumnClass,
          "flex flex-col gap-2.5 pt-2.5 pb-4",
        )}
      >
        {stalledCard}
        {questionsCard}
        {planGateCard}
        {approvalCards}
        {queuedRow}
        <Composer
          onSend={onComposerSend}
          onStop={agent.stop}
          busy={busy}
          disabled={blocked}
          notice={notice}
          threadId={threadId}
          threadAgentKind={threadAgentKind}
          ambientContextRefs={ambientContextRefs}
          errorDraft={agent.error ? lastUserText(agent.messages) : null}
        />
      </div>
    </div>
  );
}

/** Landing /app identik V1 — hero + composer kaya + explore bento. */
function MastraComposerLanding({
  compact,
  initialContent,
  ambientContextRefs,
  busy,
  disabled,
  notice,
  threadId,
  threadAgentKind,
  errorDraft,
  onSend,
  onStop,
}: {
  compact: boolean;
  initialContent?: string;
  ambientContextRefs?: ContextRef[];
  busy: boolean;
  disabled: boolean;
  notice: ComposerNotice | null;
  // D6: threadId client-generated (effectiveThreadId) → izinkan lampiran di pesan pertama.
  threadId: string;
  threadAgentKind: AgentKind;
  errorDraft: string | null;
  onSend: (payload: ComposerSendPayload) => void;
  onStop: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const threadsList = useThreadsList();
  const pinnedThreads = usePinnedThreads();
  // `useThreadsList` kini exclude thread yang disematkan → gabungkan pinned dulu (dedup by id)
  // supaya empty-state tetap menawarkan thread penting user.
  const recentThreads: RecentThread[] = [
    ...(pinnedThreads.data ?? []),
    ...(threadsList.data?.pages ?? []).flatMap((page) => page.items),
  ].reduce<RecentThread[]>((acc, t) => {
    if (!acc.some((r) => r.threadId === t.id)) {
      acc.push({
        threadId: t.id,
        title: threadTitle(t),
        lastActivityAt: t.lastActivityAt,
      });
    }
    return acc;
  }, []);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      {/* Landing penuh (non-compact): kolom setinggi viewport — hero di tengah, banner
          carousel menempel di dasar (tepat di atas section Jelajahi yang jadi turun ke
          bawah fold; cue "bacaan hari ini" yang mengundang scroll ke sana). */}
      <div
        className={cn(
          "relative mx-auto flex w-full flex-col",
          compact
            ? cn("flex-1 max-w-none", panelBodyPaddingClass)
            : "min-h-full max-w-5xl px-4 pb-5 pt-10 sm:px-8",
        )}
      >
        <div className="flex w-full flex-1 items-center justify-center">
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
              logoClassName={
                compact ? "size-12 sm:size-18" : "size-12 sm:size-22"
              }
              titleClassName={cn(
                "font-sans font-bold tracking-tight text-foreground leading-none",
                compact ? "text-xl" : "text-2xl sm:text-3xl",
              )}
            >
              <Composer
                showSuggestions={!compact}
                recentThreads={recentThreads}
                initialContent={initialContent}
                ambientContextRefs={ambientContextRefs}
                threadId={threadId}
                threadAgentKind={threadAgentKind}
                onSend={onSend}
                onStop={onStop}
                busy={busy}
                disabled={disabled}
                notice={notice}
                errorDraft={errorDraft}
              />
            </ComposerHeroState>
          </m.div>
        </div>
        {compact ? null : (
          <>
            <div className="mx-auto w-full max-w-2xl">
              <HomeBannerCarousel />
            </div>
            {/* Cue diposisikan absolut terhadap kolom landing — kanan-atas, diagonal
                di antara action buka panel Workspace dan hero title. */}
            <ExploreHandwrittenCue
              shouldReduceMotion={shouldReduceMotion ?? false}
            />
          </>
        )}
      </div>
      {compact ? null : <HomeExploreBento />}
    </main>
  );
}
