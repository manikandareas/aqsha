"use client";

import { SparklesIcon } from "@aqsha/ui/icons";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import type { TimelineMessage, TimelinePart } from "../lib/eve-timeline";
import { ToolRow } from "./tool-row";

/**
 * Timeline pesan (Slice 6.3) — renderer PER-PART terurut. User = bubble teks;
 * assistant = aliran parts (reasoning collapsible → tool-row collapsible → teks
 * jawaban). Sumber: adapter pure `evePartsToTimeline` (live) / `chatMessagesToTimeline`
 * (history). Live-only (D-F): tool parts hanya muncul saat turn berjalan.
 */
export function MessageList({
  messages,
  pending,
}: {
  messages: TimelineMessage[];
  pending?: boolean;
}) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <SparklesIcon className="size-6 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Mulai percakapan dengan Astra.</p>
      </div>
    );
  }

  // Indikator "mengetik" standalone hanya saat pesan asisten BELUM ada (user baru
  // kirim). Begitu pesan asisten muncul — meski masih kosong — `AssistantTurn`
  // memegang indikatornya sendiri (hindari avatar dobel).
  const last = messages.at(-1);
  const showTyping = Boolean(pending) && (!last || last.role === "user");

  return (
    <div className="flex flex-col gap-5">
      {messages.map((m) =>
        m.role === "user" ? (
          <UserBubble key={m.id} parts={m.parts} />
        ) : (
          <AssistantTurn key={m.id} message={m} />
        ),
      )}
      {showTyping ? <TypingRow /> : null}
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
    <div className="flex justify-end gap-3">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-primary-foreground text-sm">
        {text}
      </div>
    </div>
  );
}

function AstraAvatar() {
  return (
    <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
      <SparklesIcon className="size-4 text-muted-foreground" />
    </div>
  );
}

function AssistantTurn({ message }: { message: TimelineMessage }) {
  const hasText = message.parts.some((p) => p.kind === "text");
  const empty = message.parts.length === 0;
  return (
    <div className="flex gap-3">
      <AstraAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {message.parts.map((part) => (
          <PartView key={part.id} part={part} />
        ))}
        {message.streaming && empty ? <TypingDots /> : null}
        {message.streaming && !empty && !hasText ? (
          <Shimmer as="span" className="text-[13px]">
            Astra sedang menyusun jawaban…
          </Shimmer>
        ) : null}
      </div>
    </div>
  );
}

function PartView({ part }: { part: TimelinePart }) {
  switch (part.kind) {
    case "reasoning":
      return <Reasoning text={part.text} thinking={part.thinking} />;
    case "tool":
      return <ToolRow model={part.model} />;
    case "text":
      return <Response text={part.text} streaming={part.streaming} />;
    default:
      return null;
  }
}

function TypingRow() {
  return (
    <div className="flex gap-3">
      <AstraAvatar />
      <TypingDots />
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
