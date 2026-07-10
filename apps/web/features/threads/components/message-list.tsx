"use client";

import {
  type CommandSegment,
  type MentionSegment,
  parseCommandSegments,
  parseMentionSegments,
  stripMentionMarkers,
} from "@aqsha/chat-core";
import { stripStatsMarkers, type StatsGroup } from "@aqsha/chat-core/stats-viz";
import { CheckIcon, ChevronDownIcon, CopyIcon, RotateCcwIcon, SparklesIcon } from "@aqsha/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useThreadPanel } from "@/features/thread-experience/components/thread-panel-context";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MessageAttachment } from "../lib/attachment-buckets";
import { buildCitationMap } from "../lib/citation-markdown";
import {
  splitTokenLabel,
  TOKEN_PILL_LABEL_CLASS,
  TOKEN_PILL_PREFIX_CLASS,
  type TokenPillKind,
  tokenPillClass,
} from "../lib/token-pill";
import { dedupeCards } from "../lib/source-card";
import { messageSourceCards } from "../lib/thread-panel-data";
import type { SourceCardData, TimelineMessage, TimelinePart } from "../lib/timeline-types";
import type { ResearchSource } from "../types";
import { ChatArtifactCard } from "./chat-artifact-card";
import { FileChip } from "./file-chip";
import { ElapsedLabel } from "./elapsed-label";
import {
  MessageInteractionsProvider,
  useMessageInteractions,
  type MessageInteractions,
} from "./message-interactions";
import { InlineSources } from "./sources-panel";
import { ToolRow } from "./tool-row";

/**
 * Timeline pesan — render DATAR per pesan, mengikuti urutan
 * `defaultMessageReducer`. User = bubble; assistant = reasoning → blok "Proses" collapsible
 * (tool generik) → jawaban → artifact → sumber inline (per `turnId`) → aksi. TAK ADA grouping
 * run berfase / kartu verifikasi-subagen (verify+subagen = tool-row generik). HITL approval /
 * `ask_questions` yang MENUNGGU jawaban dirender sebagai kartu di atas composer (`QuestionsCard`,
 * lihat `mastra-chat-thread-surface`); jejak yang sudah diresolve tetap tampil sebagai tool-row.
 */
export function MessageList({
  messages,
  pending,
  busy,
  sourcesByTurn,
  statsGroupsByToolCallId,
  attachmentsByMessage,
  onRegenerate,
}: {
  messages: TimelineMessage[];
  pending?: boolean;
  /** Turn in-flight → sembunyikan aksi ulangi. */
  busy?: boolean;
  /** Sumber riset dikelompokkan per `turnId` (dari `research_sources`). */
  sourcesByTurn?: Map<string, ResearchSource[]>;
  /** Grup blok hasil analisis dikelompokkan per `toolCallId` (dari `analysis_result_blocks`). */
  statsGroupsByToolCallId?: Map<string, StatsGroup>;
  /** Lampiran upload dikelompokkan per id pesan user (join sisi-baca thread↔waktu). */
  attachmentsByMessage?: Map<string, MessageAttachment[]>;
  /** Ulangi (regenerate) turn terakhir — kirim ulang pesan user terakhir sebagai turn baru. */
  onRegenerate?: () => void;
}) {
  // Bridge the right-side detail-panel controller to in-message cards (source / artifact /
  // sub-question / plan). Null outside the full thread shell (compact chat panels) → cards
  // keep their default behaviour. Openers are stable, so this value is stable when idle.
  const panel = useThreadPanel();
  const interactions = useMemo<MessageInteractions>(
    () =>
      panel
        ? {
            openArtifact: panel.openArtifactPanel,
            openSources: panel.openSourcesPanel,
            openSearch: panel.openSearchPanel,
            openStep: panel.openStepPanel,
            openPlan: panel.openPlanPanel,
          }
        : {},
    [panel],
  );

  if (messages.length === 0 && !pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <SparklesIcon className="size-6 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Mulai percakapan dengan Astra.</p>
      </div>
    );
  }

  // Indikator "mengetik" standalone hanya saat pesan asisten BELUM ada (user baru kirim).
  const last = messages.at(-1);
  const showTyping = Boolean(pending) && (!last || last.role === "user");
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <MessageInteractionsProvider value={interactions}>
      <div className="flex flex-col gap-6">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <UserBubble key={m.id} parts={m.parts} attachments={attachmentsByMessage?.get(m.id)} />
          ) : (
            <AssistantMessage
              key={m.id}
              message={m}
              sources={m.turnId ? sourcesByTurn?.get(m.turnId) : undefined}
              statsGroupsByToolCallId={statsGroupsByToolCallId}
              onRegenerate={!busy && m.id === lastAssistantId ? onRegenerate : undefined}
              turnStartedAt={precedingUserCreatedAt(messages, i)}
            />
          ),
        )}
        {showTyping ? <ThinkingRow label="Astra sedang berpikir…" /> : null}
      </div>
    </MessageInteractionsProvider>
  );
}

/**
 * `createdAt` pesan user terdekat SEBELUM pesan index `i` — anchor timer turn asisten yang
 * selamat refresh (pesan user dipersist segera saat submit, jadi tersedia live maupun rehydrate).
 * 0/absen → undefined (ElapsedLabel fallback ke waktu mount).
 */
function precedingUserCreatedAt(messages: TimelineMessage[], i: number): number | undefined {
  for (let j = i - 1; j >= 0; j--) {
    const m = messages[j];
    if (m?.role === "user") return m.createdAt > 0 ? m.createdAt : undefined;
  }
  return undefined;
}

function UserBubble({
  parts,
  attachments,
}: {
  parts: TimelinePart[];
  attachments?: MessageAttachment[];
}) {
  // Lampiran upload = artifact (id-nya artifact id), jadi klik chip buka reader di panel.
  const { openArtifact } = useMessageInteractions();
  const text = parts
    .filter((p): p is Extract<TimelinePart, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("");
  const hasAttachments = (attachments?.length ?? 0) > 0;
  if (!text && !hasAttachments) return null;
  return (
    <div className="flex flex-col items-end gap-1.5">
      {hasAttachments ? (
        <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
          {attachments?.map((a) => (
            <FileChip
              key={a.id}
              id={a.id}
              title={a.title}
              mimeType={a.mimeType}
              indexingStatus={a.indexingStatus}
              onOpen={openArtifact ? () => openArtifact(a.id) : undefined}
            />
          ))}
        </div>
      ) : null}
      {text ? (
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-primary-foreground text-sm">
          <UserMessageText text={text} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Teks pesan user → segmen teks + pill `@mention` + pill `/command`. Penanda mention
 * (U+E000/E001) disuntik composer (`serializeComposerEditorWithMarkers`) saat kirim dan ikut
 * dipersist; `parseMentionSegments` memecahnya lagi di sini. Command TIDAK ber-marker
 * (terserialisasi sebagai slug polos) → `parseCommandSegments` mencocokkannya by-slug, jadi
 * pesan lama pun ikut ter-pill. Treatment visual SATU SSOT dengan composer (`token-pill.ts`),
 * tone `bubble` (di atas `bg-primary`).
 */
function UserMessageText({ text }: { text: string }) {
  // React Compiler meng-cache turunan ini (keyed `text`). Segmen mention pakai `label` (sudah bersih
  // dari parse); segmen teks di-strip dari sisa penanda yatim (open tanpa close, mis. teks ter-truncate)
  // agar char private-use tak ter-render, lalu dipecah lagi per slug command.
  const segments = parseMentionSegments(text).flatMap(
    (seg): Array<MentionSegment | CommandSegment> =>
      seg.type === "mention" ? [seg] : parseCommandSegments(stripMentionMarkers(seg.value)),
  );
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "mention" ? (
          <BubbleTokenPill
            // biome-ignore lint/suspicious/noArrayIndexKey: segmen statis hasil parse satu string
            key={i}
            kind="mention"
            label={seg.label}
            tooltipTitle={splitTokenLabel(seg.label).text.trim()}
          />
        ) : seg.type === "command" ? (
          <BubbleTokenPill
            // biome-ignore lint/suspicious/noArrayIndexKey: segmen statis hasil parse satu string
            key={i}
            kind="command"
            label={seg.matched}
            tooltipTitle={`${seg.command.slug} · ${seg.command.label}`}
            tooltipDescription={seg.command.description}
          />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segmen statis hasil parse satu string
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  );
}

/** Pill token di bubble user: label ter-truncate CSS, detail penuh di tooltip hover. */
function BubbleTokenPill({
  kind,
  label,
  tooltipTitle,
  tooltipDescription,
}: {
  kind: TokenPillKind;
  label: string;
  tooltipTitle: string;
  tooltipDescription?: string;
}) {
  const { prefix, text } = splitTokenLabel(label);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={tokenPillClass("bubble", kind)}>
          {prefix ? <span className={TOKEN_PILL_PREFIX_CLASS}>{prefix}</span> : null}
          <span className={TOKEN_PILL_LABEL_CLASS}>{text}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div>
          <p className="break-words font-medium">{tooltipTitle}</p>
          {tooltipDescription ? (
            <p className="mt-0.5 break-words opacity-70">{tooltipDescription}</p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Satu pesan asisten (satu turn). Reasoning → blok "Proses" (tool + teks antara) → jawaban
 * (teks TERAKHIR) → artifact → sumber → aksi. `message.streaming` (sudah di-gate `busy` di adapter)
 * mengatur shimmer + sembunyi sumber/aksi selagi mengalir.
 */
function AssistantMessage({
  message,
  sources,
  statsGroupsByToolCallId,
  onRegenerate,
  turnStartedAt,
}: {
  message: TimelineMessage;
  sources?: ResearchSource[];
  statsGroupsByToolCallId?: Map<string, StatsGroup>;
  onRegenerate?: () => void;
  /** Epoch-ms pesan user pemicu turn — anchor timer "Sedang bekerja" yang selamat refresh. */
  turnStartedAt?: number;
}) {
  const { openSources } = useMessageInteractions();
  const streaming = Boolean(message.streaming);
  const texts = message.parts.filter(
    (p): p is Extract<TimelinePart, { kind: "text" }> => p.kind === "text",
  );
  const answer = texts.at(-1);
  const answerId = answer?.id;

  const artifactParts = message.parts.filter((p) => p.kind === "artifact");
  // Proses = reasoning + tool + teks antara (semua teks kecuali jawaban final), URUT ASLI pemanggilan:
  // reasoning ter-interleave dengan tool-call di dalam blok "Proses" (bukan mengambang di atas).
  const processParts = message.parts.filter(
    (p) => p.kind === "tool" || p.kind === "reasoning" || (p.kind === "text" && p.id !== answerId),
  );
  // Pesan laporan `/deep` = punya baris step Workflow (`wf:<stepId>`), live maupun riwayat.
  // Hanya pesan ini yang boleh merender fence `aqsha:viz` sebagai figur (lihat prop `viz` Response).
  const isDeepReport = message.parts.some(
    (p) => p.kind === "tool" && p.model.toolCallId.startsWith("wf:"),
  );
  const toolSteps = processParts.filter((p) => p.kind === "tool").length;
  // Anchor timer "Sedang bekerja": startedAt step Workflow yang SEDANG berjalan (snapshot `/deep`,
  // durable lintas-refresh — sengaja bukan awal run supaya jeda menunggu plan-gate tak terhitung);
  // fallback `createdAt` pesan user pemicu (chat normal), lalu waktu mount di ElapsedLabel.
  let earliestRunningToolStart: number | undefined;
  for (const p of processParts) {
    if (p.kind !== "tool" || !p.model.isRunning) continue;
    const startedAt = p.model.startedAt ?? 0;
    if (startedAt > 0 && (earliestRunningToolStart === undefined || startedAt < earliestRunningToolStart)) {
      earliestRunningToolStart = startedAt;
    }
  }
  const workingSince = earliestRunningToolStart ?? turnStartedAt;

  // Sumber `/deep` dikelompokkan per `subQuestionIndex` → kartu sub-agen pencarian (step
  // search-literature). Hanya sumber bertanda sub-pertanyaan (chat biasa = null → dilewati).
  // Fallback DB untuk jalur refresh/riwayat; live = `sub.sources` yang dipancarkan step.
  const sourcesBySubQ = useMemo(() => {
    if (!sources || sources.length === 0) return undefined;
    const map = new Map<number, ResearchSource[]>();
    for (const s of sources) {
      if (s.subQuestionIndex == null) continue;
      const list = map.get(s.subQuestionIndex);
      if (list) list.push(s);
      else map.set(s.subQuestionIndex, [s]);
    }
    return map.size > 0 ? map : undefined;
  }, [sources]);

  // Kartu sumber pesan ini (sebelum dedup) — SATU sumber kebenaran (`messageSourceCards`) yang dibagi
  // dengan panel detail (`buildThreadPanelLookups`) supaya pemicu "Sumber" inline & panel tak pernah
  // berbeda. Precedence: `research_sources` per-turn (deep) → kartu `search-flat` pesan (chat normal) →
  // sumber laporan deep dari metadata (fallback bila fetch DB meleset). Dipakai DUA arah: peta sitasi
  // (semua pasangan nomor→kartu) dan panel "Sumber" (di-dedup by url/doi).
  const citationCards = useMemo<SourceCardData[]>(
    () => messageSourceCards(message, sources),
    [message, sources],
  );

  // Panel "Sumber" (collapsible di bawah jawaban) — kartu unik (dedup lintas-tool by key).
  const panelSources = useMemo(() => dedupeCards(citationCards), [citationCards]);
  // Peta `nomor [n] → kartu` untuk pill sitasi inline di prosa jawaban (tak di-dedup → tiap nomor,
  // termasuk sumber yang muncul di >1 pencarian, tetap ter-resolve).
  const citationMap = useMemo(() => buildCitationMap(citationCards), [citationCards]);

  // Grup blok hasil analisis milik pesan INI — disaring dari peta thread by toolCallId tool
  // part pesan ini (anti-lintas-turn; penanda `{{stats:<runKey>}}` hanya resolve ke hasil tool
  // milik jawaban ini). Keyed by runKey untuk lookup penanda di FE renderer.
  const messageStatsGroups = useMemo(() => {
    if (!statsGroupsByToolCallId || statsGroupsByToolCallId.size === 0) return undefined;
    const map = new Map<string, StatsGroup>();
    for (const p of message.parts) {
      if (p.kind !== "tool") continue;
      const group = statsGroupsByToolCallId.get(p.model.toolCallId);
      if (group) map.set(group.runKey, group);
    }
    return map.size > 0 ? map : undefined;
  }, [message, statsGroupsByToolCallId]);

  const hasAnswer = Boolean(answer);
  const isEmpty = message.parts.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {processParts.length > 0 ? (
        <ProcessBlock
          parts={processParts}
          streaming={streaming}
          toolSteps={toolSteps}
          sourcesBySubQ={sourcesBySubQ}
          turnId={message.turnId}
          workingSince={workingSince}
        />
      ) : null}

      {answer ? (
        <Response
          text={answer.text}
          streaming={answer.streaming}
          citations={citationMap}
          viz={isDeepReport}
          statsGroups={messageStatsGroups}
        />
      ) : null}

      {artifactParts.map((part) =>
        part.kind === "artifact" ? <ChatArtifactCard key={part.id} model={part.model} /> : null,
      )}

      {!streaming && panelSources.length > 0 ? (
        <InlineSources
          sources={panelSources}
          onOpen={openSources ? () => openSources(message.id) : undefined}
        />
      ) : null}

      {hasAnswer && !streaming ? (
        <MessageActions text={answer?.text ?? ""} onRegenerate={onRegenerate} />
      ) : null}

      {streaming && isEmpty ? <ThinkingRow label="Astra sedang berpikir…" /> : null}
      {streaming && !isEmpty && !hasAnswer ? (
        <ThinkingRow label="Astra sedang menyusun jawaban…" />
      ) : null}
    </div>
  );
}

/**
 * Blok "Proses" collapsible — tool-row + teks antara satu pesan. Terbuka + shimmer selagi streaming;
 * saat settle auto-collapse jadi "Selesai · N langkah" kecuali user membuka manual.
 */
function ProcessBlock({
  parts,
  streaming,
  toolSteps,
  sourcesBySubQ,
  turnId,
  workingSince,
}: {
  parts: TimelinePart[];
  streaming: boolean;
  toolSteps: number;
  sourcesBySubQ?: Map<number, ResearchSource[]>;
  /** Run id of this `/deep` turn — scopes the search/plan detail panels. */
  turnId?: string;
  /** Epoch-ms anchor timer "Sedang bekerja" (durable lintas-refresh); kosong → waktu mount. */
  workingSince?: number;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    if (prevStreaming.current && !streaming) setOverride((cur) => (cur === true ? cur : null));
    prevStreaming.current = streaming;
  }, [streaming]);
  const open = override ?? streaming;
  const settledLabel = toolSteps > 0 ? `Selesai · ${toolSteps} langkah` : "Proses";

  return (
    <Collapsible className="min-w-0" open={open} onOpenChange={(next) => setOverride(next)}>
      <CollapsibleTrigger className="-mx-1.5 group flex w-full min-w-0 items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {streaming ? (
          <>
            <Spinner className="size-3.5 shrink-0 text-primary" />
            {/* Riset mendalam menunggu subagent (task mode) bisa diam bermenit-menit tanpa
                event; elapsed yang berdetak meyakinkan "masih bekerja", bukan beku. */}
            <ElapsedLabel base="Sedang bekerja" startedAt={workingSince} />
          </>
        ) : (
          <span className="font-medium text-muted-foreground">{settledLabel}</span>
        )}
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="mt-2 flex min-w-0 flex-col gap-2.5 text-[13px]">
          {parts.map((part) => (
            <ProcessPartView
              key={part.id}
              part={part}
              sourcesBySubQ={sourcesBySubQ}
              turnId={turnId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProcessPartView({
  part,
  sourcesBySubQ,
  turnId,
}: {
  part: TimelinePart;
  sourcesBySubQ?: Map<number, ResearchSource[]>;
  turnId?: string;
}) {
  if (part.kind === "tool")
    return <ToolRow model={part.model} sourcesBySubQ={sourcesBySubQ} turnId={turnId} />;
  if (part.kind === "reasoning") {
    // Penalaran model — item proses dalam urutan natural (sebelum/antara/sesudah tool-call).
    return <Reasoning text={part.text} isThinking={part.thinking} />;
  }
  if (part.kind === "text") {
    // Teks antara (intermediate) yang diucapkan agen sebelum jawaban final. Dirender polos
    // (tanpa rehype stats) → buang token penanda `{{stats:...}}` supaya tak bocor mentah;
    // grup hasilnya tetap tampil via lampiran di jawaban final.
    return (
      <div className="whitespace-pre-wrap break-words text-muted-foreground">
        {stripStatsMarkers(part.text)}
      </div>
    );
  }
  return null;
}

function MessageActions({ text, onRegenerate }: { text: string; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim() && !onRegenerate) return null;

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="-ml-1.5 flex items-center gap-0.5 pt-0.5">
      {text.trim() ? (
        <button
          type="button"
          onClick={copy}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title="Salin jawaban"
          aria-label="Salin jawaban"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
      ) : null}
      {onRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title="Ulangi jawaban"
          aria-label="Ulangi jawaban"
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Indikator live V1: FlickerSpinner (kiri) + label shimmer (kanan). */
function ThinkingRow({ label }: { label: string }) {
  return (
    <span className="mt-1.5 flex items-center gap-1.5">
      <Spinner className="size-3.5 shrink-0 text-primary" />
      <Shimmer as="span" className="text-[13px]">
        {label}
      </Shimmer>
    </span>
  );
}
