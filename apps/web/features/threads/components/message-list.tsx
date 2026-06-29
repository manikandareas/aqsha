"use client";

import { CheckIcon, ChevronDownIcon, CopyIcon, RotateCcwIcon, SparklesIcon } from "@aqsha/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import type { TimelineMessage, TimelinePart } from "../lib/timeline-types";
import type { ResearchSource } from "../types";
import { ChatArtifactCard } from "./chat-artifact-card";
import { ElapsedLabel } from "./elapsed-label";
import { InlineSources } from "./sources-panel";
import { ToolRow } from "./tool-row";

/**
 * Timeline pesan (simplifikasi eve-chat-template) — render DATAR per pesan, mengikuti urutan
 * `defaultMessageReducer`. User = bubble; assistant = reasoning → blok "Proses" collapsible
 * (tool generik) → jawaban → artifact → sumber inline (per `turnId`) → aksi. TAK ADA grouping
 * run berfase / kartu verifikasi-subagen (verify+subagen = tool-row generik). HITL approval /
 * ask_question yang MENUNGGU jawaban dirender sebagai kartu di atas composer
 * (`InputRequestPrompt`); jejak yang sudah diresolve tetap tampil sebagai tool-row.
 */
export function MessageList({
  messages,
  pending,
  busy,
  sourcesByTurn,
  onRegenerate,
}: {
  messages: TimelineMessage[];
  pending?: boolean;
  /** Turn in-flight → sembunyikan aksi ulangi. */
  busy?: boolean;
  /** Sumber riset dikelompokkan per `turnId` (dari `research_sources`). */
  sourcesByTurn?: Map<string, ResearchSource[]>;
  /** Ulangi (regenerate) turn terakhir — kirim ulang pesan user terakhir sebagai turn baru. */
  onRegenerate?: () => void;
}) {
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
    <div className="flex flex-col gap-6">
      {messages.map((m) =>
        m.role === "user" ? (
          <UserBubble key={m.id} parts={m.parts} />
        ) : (
          <AssistantMessage
            key={m.id}
            message={m}
            sources={m.turnId ? sourcesByTurn?.get(m.turnId) : undefined}
            onRegenerate={!busy && m.id === lastAssistantId ? onRegenerate : undefined}
          />
        ),
      )}
      {showTyping ? <ThinkingRow label="Astra sedang berpikir…" /> : null}
    </div>
  );
}

function UserBubble({ parts }: { parts: TimelinePart[] }) {
  const text = parts
    .filter((p): p is Extract<TimelinePart, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("");
  if (!text) return null;
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-primary-foreground text-sm">
        {text}
      </div>
    </div>
  );
}

/**
 * Satu pesan asisten (satu eve-turn). Reasoning → blok "Proses" (tool + teks antara) → jawaban
 * (teks TERAKHIR) → artifact → sumber → aksi. `message.streaming` (sudah di-gate `busy` di adapter)
 * mengatur shimmer + sembunyi sumber/aksi selagi mengalir.
 */
function AssistantMessage({
  message,
  sources,
  onRegenerate,
}: {
  message: TimelineMessage;
  sources?: ResearchSource[];
  onRegenerate?: () => void;
}) {
  const streaming = Boolean(message.streaming);
  const texts = message.parts.filter(
    (p): p is Extract<TimelinePart, { kind: "text" }> => p.kind === "text",
  );
  const answer = texts.at(-1);
  const answerId = answer?.id;

  const reasoningParts = message.parts.filter((p) => p.kind === "reasoning");
  const artifactParts = message.parts.filter((p) => p.kind === "artifact");
  // Proses = tool + teks antara (semua teks kecuali jawaban final), urut asli.
  const processParts = message.parts.filter(
    (p) => p.kind === "tool" || (p.kind === "text" && p.id !== answerId),
  );
  const toolSteps = processParts.filter((p) => p.kind === "tool").length;

  // Sumber `/deep` dikelompokkan per `subQuestionIndex` → kartu sub-agen pencarian (step
  // search-literature). Hanya sumber bertanda sub-pertanyaan (chat biasa = null → dilewati).
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

  const hasAnswer = Boolean(answer);
  const isEmpty = message.parts.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {reasoningParts.map((part) =>
        part.kind === "reasoning" ? (
          <Reasoning key={part.id} text={part.text} isThinking={part.thinking} />
        ) : null,
      )}

      {processParts.length > 0 ? (
        <ProcessBlock
          parts={processParts}
          streaming={streaming}
          toolSteps={toolSteps}
          sourcesBySubQ={sourcesBySubQ}
        />
      ) : null}

      {answer ? <Response text={answer.text} streaming={answer.streaming} /> : null}

      {artifactParts.map((part) =>
        part.kind === "artifact" ? <ChatArtifactCard key={part.id} model={part.model} /> : null,
      )}

      {!streaming && sources && sources.length > 0 ? <InlineSources sources={sources} /> : null}

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
}: {
  parts: TimelinePart[];
  streaming: boolean;
  toolSteps: number;
  sourcesBySubQ?: Map<number, ResearchSource[]>;
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
            <ElapsedLabel base="Sedang bekerja" />
          </>
        ) : (
          <span className="font-medium text-muted-foreground">{settledLabel}</span>
        )}
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="mt-2 flex min-w-0 flex-col gap-2.5 text-[13px]">
          {parts.map((part) => (
            <ProcessPartView key={part.id} part={part} sourcesBySubQ={sourcesBySubQ} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProcessPartView({
  part,
  sourcesBySubQ,
}: {
  part: TimelinePart;
  sourcesBySubQ?: Map<number, ResearchSource[]>;
}) {
  if (part.kind === "tool") return <ToolRow model={part.model} sourcesBySubQ={sourcesBySubQ} />;
  if (part.kind === "text") {
    // Teks antara (intermediate) yang diucapkan agen sebelum jawaban final.
    return <div className="whitespace-pre-wrap break-words text-muted-foreground">{part.text}</div>;
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
