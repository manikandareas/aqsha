"use client";

import {
  CheckIcon,
  CopyIcon,
  FolderTreeIcon,
  Loader2Icon,
  RotateCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@aqsha/ui/icons";
import { useSmoothText } from "@convex-dev/agent/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MessageAction,
  MessageActions,
  MessageResponse,
} from "@/components/ai-elements/message";
import { toAgentRunId, type AgentRunId } from "@/lib/convex-refs";
import { parseMentionSegments } from "@/lib/context-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { cn } from "@/lib/utils";
import type { ChatMessage, ResearchRun } from "../types";

// The user prompt bubble + the reusable assistant-answer primitives (streaming
// body, message actions, source count). The assistant answer itself is composed
// by `AssistantTurn` (answer-stream redesign Fase 2); the legacy `MessageRow`
// wrapper was removed when the run timeline and the answer merged into one turn.

/** The right-aligned user prompt bubble (inline @mention pills at their spots). */
export function UserMessageBubble({ message }: { message: ChatMessage }) {
  const text = getMessageText(message);
  const segments = parseMentionSegments(text);
  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-2 overflow-x-hidden">
      <div className="max-w-full whitespace-pre-wrap break-words rounded-[14px] border border-border/80 bg-card px-4 py-2.5 text-[13px] leading-[1.55] text-foreground sm:max-w-[560px]">
        {segments.map((segment, index) =>
          segment.type === "mention" ? (
            <MessageMentionPill key={`m-${segment.label}`} label={segment.label} />
          ) : (
            <Fragment key={`t-${index}`}>{segment.value}</Fragment>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Smooths a single in-flight assistant message's text (the sdk backend writes it
 * in ~RTT-sized jumps). The transcript keys the rendered answer by message id, so
 * a new message remounts this component and the reveal cursor resets to 0. A
 * shared parent-level `useSmoothText` instead carried the previous turn's
 * cursor/text into the next bubble, briefly showing the prior response until the
 * new stream overtook the old length — keep the per-message-id key in
 * `AssistantTurn`.
 */
export function StreamingResponse({ text }: { text: string }) {
  const [smoothed] = useSmoothText(text, { startStreaming: true });
  return (
    <MessageResponse className="aqsha-prose aqsha-prose-message">
      {smoothed}
    </MessageResponse>
  );
}

export function AssistantMessageActions({
  assistantRun,
  text,
  onRetryRun,
}: {
  assistantRun?: ResearchRun;
  text: string;
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
}) {
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const copiedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canRetry =
    Boolean(onRetryRun && assistantRun?.retryable) &&
    (assistantRun?.status === "failed" || assistantRun?.status === "completed");

  useEffect(() => {
    return () => {
      if (copiedResetTimer.current) {
        clearTimeout(copiedResetTimer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    await copyTextToClipboard(text);
    if (copiedResetTimer.current) {
      clearTimeout(copiedResetTimer.current);
    }
    setCopied(true);
    copiedResetTimer.current = setTimeout(() => {
      setCopied(false);
      copiedResetTimer.current = null;
    }, 1200);
  };

  const handleRetry = async () => {
    if (!assistantRun || !onRetryRun || !canRetry) return;
    setIsRetrying(true);
    try {
      await onRetryRun({ runId: toAgentRunId(assistantRun._id) });
      setIsRetrying(false);
    } catch (error) {
      toast.error(
        readableConvexErrorMessage(error, "Respons belum bisa dicoba ulang."),
      );
      setIsRetrying(false);
    }
  };

  return (
    <MessageActions className="mt-1">
      <MessageAction
        disabled={!canRetry || isRetrying}
        label="Retry"
        onClick={() => void handleRetry()}
        tooltip="Coba ulang respons"
      >
        {isRetrying ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RotateCcwIcon className="size-3.5" />
        )}
      </MessageAction>
      <MessageAction disabled label="Like" tooltip="Like">
        <ThumbsUpIcon className="size-3.5" />
      </MessageAction>
      <MessageAction disabled label="Dislike" tooltip="Dislike">
        <ThumbsDownIcon className="size-3.5" />
      </MessageAction>
      <MessageAction
        disabled={!text.trim()}
        label="Copy"
        onClick={() => void handleCopy()}
        tooltip="Salin respons"
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </MessageAction>
    </MessageActions>
  );
}

function messagePillClass(tone: "context" | "default" | "deep") {
  const base =
    "mr-1 inline-flex translate-y-[-1px] items-center rounded-[5px] px-1 align-middle font-semibold leading-[18px] underline decoration-2 underline-offset-4";
  switch (tone) {
    case "default":
      return cn(base, "bg-primary/10 text-primary decoration-primary/55");
    case "deep":
      return cn(
        base,
        "bg-lavender-soft text-lavender-foreground decoration-lavender-foreground/55",
      );
    default:
      return cn(base, "bg-foreground/8 text-foreground decoration-foreground/30");
  }
}

function MessageMentionPill({ label }: { label: string }) {
  return (
    <span contentEditable={false} className={messagePillClass("context")}>
      {label}
    </span>
  );
}

export function MessageSourceCount({ sourceCount }: { sourceCount: number }) {
  if (sourceCount <= 0) return null;

  return (
    <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-[8px] border border-border/70 bg-muted/35 px-2 py-1 text-[11px] font-medium text-muted-foreground">
      <FolderTreeIcon className="size-3.5" />
      <span>{sourceCount} referensi</span>
    </span>
  );
}

export function getMessageText(message: ChatMessage) {
  const partText = message.parts
    ?.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("");
  return partText || message.text || "";
}

export function getMessageReasoning(message: ChatMessage) {
  return (
    message.parts
      ?.flatMap((part) =>
        part.type === "reasoning" && part.text ? [part.text] : [],
      )
      .join("") ?? ""
  );
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      copyTextWithSelection(text);
      return;
    }
  }

  copyTextWithSelection(text);
}

function copyTextWithSelection(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}
