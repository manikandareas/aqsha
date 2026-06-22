"use client";

import { CheckIcon, ChevronDownIcon, CopyIcon, RotateCcwIcon, SparklesIcon } from "@aqsha/ui/icons";
import { useEffect, useRef, useState } from "react";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { TimelineMessage, TimelinePart } from "../lib/eve-timeline";
import type { ResearchSource } from "../types";
import { ChatArtifactCard } from "./chat-artifact-card";
import { HitlCard, type HitlResponse } from "./hitl-card";
import { InlineSources } from "./sources-panel";
import { SubagentCard } from "./subagent-card";
import { ToolRow } from "./tool-row";

/**
 * Timeline pesan (Slice 6.3 → message-list V1-inspired). User = bubble teks (tanpa avatar);
 * assistant = reasoning glimpse → blok "Proses" collapsible (tool + sub-agen) → jawaban →
 * artifact → sumber inline (per-turn via `turnId`) → aksi (salin/ulangi). Mengikuti FLOW eve:
 * part sudah terurut reducer; blok Proses auto-collapse saat `metadata.status` settle. Fitur
 * yang tak punya data eve (durasi, nested sub-agen, citation integrity) sengaja tak dipaksakan.
 */
export function MessageList({
  messages,
  pending,
  busy,
  onRespond,
  sourcesByTurn,
  onRegenerate,
}: {
  messages: TimelineMessage[];
  pending?: boolean;
  /** Turn in-flight → matikan interaksi kartu HITL + sembunyikan aksi ulangi. */
  busy?: boolean;
  /** Jawab HITL native eve (`agent.send({ inputResponses })`). Absen = history read-only. */
  onRespond?: (response: HitlResponse) => void;
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
          <AssistantTurn
            key={m.id}
            message={m}
            busy={busy}
            onRespond={onRespond}
            sources={m.turnId ? sourcesByTurn?.get(m.turnId) ?? [] : []}
            onRegenerate={!busy && m.id === lastAssistantId ? onRegenerate : undefined}
          />
        ),
      )}
      {showTyping ? <TypingDots /> : null}
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

function AssistantTurn({
  message,
  busy,
  onRespond,
  sources,
  onRegenerate,
}: {
  message: TimelineMessage;
  busy?: boolean;
  onRespond?: (response: HitlResponse) => void;
  sources: ResearchSource[];
  onRegenerate?: () => void;
}) {
  const reasoningParts = message.parts.filter((p) => p.kind === "reasoning");
  const textParts = message.parts.filter(
    (p): p is Extract<TimelinePart, { kind: "text" }> => p.kind === "text",
  );
  const answer = textParts.at(-1);
  const intermediateIds = new Set(textParts.slice(0, -1).map((p) => p.id));
  // Aktivitas yang dibungkus blok "Proses": tool/sub-agen + teks antara (intermediate),
  // mempertahankan urutan asli. Reasoning dirender di atas (glimpse-nya sendiri).
  const processParts = message.parts.filter(
    (p) => p.kind === "tool" || (p.kind === "text" && intermediateIds.has(p.id)),
  );

  const empty = message.parts.length === 0;
  const hasAnswer = Boolean(answer);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {reasoningParts.map((part) =>
        part.kind === "reasoning" ? (
          <Reasoning key={part.id} text={part.text} isThinking={part.thinking} />
        ) : null,
      )}

      {processParts.length > 0 ? (
        <ProcessBlock parts={processParts} streaming={message.streaming} />
      ) : null}

      {message.parts.map((part) =>
        part.kind === "hitl" ? (
          <HitlCard
            key={part.id}
            model={part.model}
            disabled={busy || !onRespond}
            onRespond={onRespond ?? (() => {})}
          />
        ) : null,
      )}

      {answer ? <Response text={answer.text} streaming={answer.streaming} /> : null}

      {message.parts.map((part) =>
        part.kind === "artifact" ? <ChatArtifactCard key={part.id} model={part.model} /> : null,
      )}

      {!message.streaming && sources.length > 0 ? <InlineSources sources={sources} /> : null}

      {hasAnswer && !message.streaming ? (
        <MessageActions text={answer?.text ?? ""} onRegenerate={onRegenerate} />
      ) : null}

      {message.streaming && empty ? <TypingDots /> : null}
      {message.streaming && !empty && !hasAnswer ? (
        <Shimmer as="span" className="text-[13px]">
          Astra sedang menyusun jawaban…
        </Shimmer>
      ) : null}
    </div>
  );
}

/**
 * Blok "Proses" collapsible — membungkus tool-row + kartu sub-agen satu turn. Terbuka +
 * shimmer selagi streaming; saat settle auto-collapse jadi ringkasan "Selesai · N langkah"
 * (kecuali user membuka manual). Mengikuti `model.isRunning` pola tool-row (override sticky).
 */
function ProcessBlock({ parts, streaming }: { parts: TimelinePart[]; streaming: boolean }) {
  const stepCount = parts.filter((p) => p.kind === "tool").length;
  const [override, setOverride] = useState<boolean | null>(null);
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    // Reset override saat transisi streaming → settle agar auto-collapse berlaku lagi
    // untuk user yang tak pernah menggeser.
    if (prevStreaming.current && !streaming) setOverride((cur) => (cur === true ? cur : null));
    prevStreaming.current = streaming;
  }, [streaming]);
  const open = override ?? streaming;
  const label = streaming
    ? "Sedang bekerja…"
    : stepCount > 0
      ? `Selesai · ${stepCount} langkah`
      : "Proses";

  return (
    <Collapsible className="min-w-0" open={open} onOpenChange={(next) => setOverride(next)}>
      <CollapsibleTrigger className="-mx-1.5 group flex w-full min-w-0 items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {streaming ? (
          <Shimmer as="span" className="font-medium">
            {label}
          </Shimmer>
        ) : (
          <span className="font-medium text-muted-foreground">{label}</span>
        )}
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="mt-2 flex flex-col gap-2.5 border-border/60 border-l pl-3 text-[13px]">
          {parts.map((part) => (
            <ProcessPartView key={part.id} part={part} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProcessPartView({ part }: { part: TimelinePart }) {
  if (part.kind === "tool") {
    return part.model.kind === "subagent-call" ? (
      <SubagentCard model={part.model} />
    ) : (
      <ToolRow model={part.model} />
    );
  }
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
    // ponytail: reset label tanpa cleanup — handler sekali jalan, tak ada race berarti.
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

function TypingDots() {
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <Dot delay="0ms" />
      <Dot delay="150ms" />
      <Dot delay="300ms" />
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className={cn("size-1.5 animate-bounce rounded-full bg-muted-foreground/60")}
      style={{ animationDelay: delay }}
    />
  );
}
