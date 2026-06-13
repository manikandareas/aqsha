"use client";

import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  FolderTreeIcon,
  Loader2Icon,
  RotateCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@aqsha/ui/icons";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  toAgentRunId,
  type AgentRunId,
} from "@/lib/convex-refs";
import { parseMentionSegments } from "@/lib/context-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  ResearchRun,
} from "../types";
import { ThreadActivityIndicator } from "./shared";
import { MessageHitlParts } from "./message-hitl-parts";
import type { HitlActions } from "./use-hitl-resume";

export function MessageRow({
  message,
  assistantRun,
  onRetryRun,
  sourceCount = 0,
  hitlActions,
  hitlDisabled,
}: {
  message: ChatMessage;
  assistantRun?: ResearchRun;
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
  sourceCount?: number;
  /** Accepted for caller parity; no longer read by this row. */
  threadWorkspaceId?: string;
  hitlActions?: HitlActions;
  hitlDisabled?: boolean;
}) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isFailed = message.status === "failed";
  const text = getMessageText(message);
  const hasText = Boolean(text.trim());

  if (isUser) {
    // @mentions are encoded inline in the message text (markers) and render as
    // pills at the exact position the user typed them.
    const segments = parseMentionSegments(text);
    return (
      <div className="flex w-full min-w-0 flex-col items-end gap-2 overflow-x-hidden">
        <div className="max-w-full whitespace-pre-wrap break-words rounded-[14px] border border-border/80 bg-card px-4 py-2.5 text-[13px] leading-[1.55] text-foreground sm:max-w-[560px]">
          {segments.map((segment, index) =>
            segment.type === "mention" ? (
              <MessageMentionPill key={`m-${index}`} label={segment.label} />
            ) : (
              <Fragment key={`t-${index}`}>{segment.value}</Fragment>
            ),
          )}
        </div>
      </div>
    );
  }

  return (
    <Message from="assistant" className="min-w-0 overflow-x-hidden">
      <MessageContent className="w-full min-w-0 overflow-hidden bg-transparent p-0 text-[13px] leading-[1.55] text-ink-soft">
        {isFailed ? (
          <div className="flex items-start gap-2 rounded-[10px] border border-coral-soft-border bg-coral-soft px-3 py-2.5 text-[13px] font-medium leading-[1.55] text-coral-foreground">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {hasText
                ? text
                : "Astra belum bisa menjawab pesan ini. Coba kirim ulang sebentar lagi."}
            </span>
          </div>
        ) : hasText ? (
          <MessageResponse className="aqsha-prose aqsha-prose-message">
            {text}
          </MessageResponse>
        ) : isStreaming ? (
          <ThreadActivityIndicator label="Sedang menulis..." />
        ) : null}
      </MessageContent>
      {hitlActions ? (
        <MessageHitlParts
          message={message}
          actions={hitlActions}
          disabled={hitlDisabled}
        />
      ) : null}
      <MessageSourceCount sourceCount={sourceCount} />
      {hasText ? (
        <AssistantMessageActions
          assistantRun={assistantRun}
          text={text}
          onRetryRun={onRetryRun}
        />
      ) : null}
    </Message>
  );
}

function AssistantMessageActions({
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
    } catch (error) {
      toast.error(
        readableConvexErrorMessage(error, "Respons belum bisa dicoba ulang."),
      );
    } finally {
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

function MessageSourceCount({ sourceCount }: { sourceCount: number }) {
  if (sourceCount <= 0) return null;

  return (
    <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-[8px] border border-border/70 bg-muted/35 px-2 py-1 text-[11px] font-medium text-muted-foreground">
      <FolderTreeIcon className="size-3.5" />
      <span>{sourceCount} referensi</span>
    </span>
  );
}

function getMessageText(message: ChatMessage) {
  const partText = message.parts
    ?.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("");
  return partText || message.text || "";
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
