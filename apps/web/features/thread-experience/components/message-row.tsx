"use client";

import { api } from "@aqsha/convex/api";
import {
  AlertCircleIcon,
  BracesIcon,
  CheckIcon,
  Code2Icon,
  CopyIcon,
  FileIcon,
  FileTextIcon,
  FolderTreeIcon,
  GitBranchIcon,
  ImageIcon,
  LayoutGridIcon,
  Link2Icon,
  LinkIcon,
  Loader2Icon,
  RotateCcwIcon,
  TableIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  toAgentRunId,
  toArtifactId,
  toWorkspaceId,
  type AgentRunId,
} from "@/lib/convex-refs";
import { parseMentionSegments } from "@/lib/context-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexMutationFn,
  useConvexQueryData,
} from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import type {
  ChatMessage,
  MessageContextArtifactMetadata,
  PromptCommandMetadata,
  ResearchRun,
} from "../types";
import { ThreadActivityIndicator } from "./shared";
import { MessageWorkspaceActions } from "./message-workspace-actions";
import { MessageHitlParts } from "./message-hitl-parts";
import type { HitlActions } from "./use-hitl-resume";

export function MessageRow({
  message,
  assistantRun,
  onRetryRun,
  sourceCount = 0,
  threadWorkspaceId,
  hitlActions,
  hitlDisabled,
}: {
  message: ChatMessage;
  assistantRun?: ResearchRun;
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
  sourceCount?: number;
  threadWorkspaceId?: string;
  hitlActions?: HitlActions;
  hitlDisabled?: boolean;
}) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isFailed = message.status === "failed";
  const text = getMessageText(message);
  const hasText = Boolean(text.trim());
  const workspaceActions = useConvexQueryData(
    api.workspaces.listActionsForMessage,
    isUser && message.id ? { messageId: message.id } : "skip",
  );

  if (isUser) {
    const promptCommand = message.metadata?.promptCommand;
    const contextArtifacts = message.metadata?.contextArtifacts ?? [];
    // Uploaded files keep their card (they carry a save-to-workspace action).
    // @mentions are encoded inline in the message text (markers) and render as
    // pills at the exact position the user typed them.
    const uploadedArtifacts = contextArtifacts.filter(
      (artifact) => artifact.source === "upload",
    );
    // Prefer the marked rich content (mention pills in place); fall back to the
    // plain message text (older messages, or no mentions).
    const sourceText = message.metadata?.richContent ?? text;
    const displayText = promptCommand
      ? stripVisibleCommandText(sourceText, promptCommand)
      : sourceText;
    const segments = parseMentionSegments(displayText);
    return (
      <div className="flex w-full min-w-0 flex-col items-end gap-2 overflow-x-hidden">
        {uploadedArtifacts.length > 0 ? (
          <UserMessageContextArtifacts
            artifacts={uploadedArtifacts}
            threadWorkspaceId={threadWorkspaceId}
          />
        ) : null}
        <div className="max-w-full whitespace-pre-wrap break-words rounded-[14px] border border-border/80 bg-card px-4 py-2.5 text-[13px] leading-[1.55] text-foreground sm:max-w-[560px]">
          {promptCommand ? <PromptCommandChip command={promptCommand} /> : null}
          {segments.map((segment, index) =>
            segment.type === "mention" ? (
              <MessageMentionPill key={`m-${index}`} label={segment.label} />
            ) : (
              <Fragment key={`t-${index}`}>{segment.value}</Fragment>
            ),
          )}
        </div>
        <MessageWorkspaceActions actions={workspaceActions ?? []} align="end" />
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

function UserMessageContextArtifacts({
  artifacts,
  threadWorkspaceId,
}: {
  artifacts: MessageContextArtifactMetadata[];
  threadWorkspaceId?: string;
}) {
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-2 sm:max-w-[560px]">
      {artifacts.map((artifact) => (
        <UserMessageContextArtifactCard
          key={artifact.artifactId}
          artifact={artifact}
          threadWorkspaceId={threadWorkspaceId}
        />
      ))}
    </div>
  );
}

function UserMessageContextArtifactCard({
  artifact,
  threadWorkspaceId,
}: {
  artifact: MessageContextArtifactMetadata;
  threadWorkspaceId?: string;
}) {
  const router = useRouter();
  const saveAttachment = useConvexMutationFn(api.artifacts.saveAttachmentToWorkspace);
  const workspacePage = useConvexQueryData(api.workspaces.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedState, setSavedState] = useState<{
    workspaceId: string;
    workspaceName: string;
  } | null>(
    artifact.savedWorkspaceId
      ? {
          workspaceId: artifact.savedWorkspaceId,
          workspaceName: artifact.savedWorkspaceName ?? "Workspace",
        }
      : null,
  );
  const presentation = getContextArtifactPresentation(artifact);
  const workspaceCount = workspacePage?.page.length ?? 0;
  const canSave =
    artifact.source === "upload" &&
    !savedState &&
    artifact.artifactType !== "url";
  const requiresPicker = canSave && !threadWorkspaceId && workspaceCount > 1;

  const handleSave = async (workspaceId?: string) => {
    setIsSaving(true);
    try {
      const result = await saveAttachment({
        artifactId: toArtifactId(artifact.artifactId),
        workspaceId: workspaceId ? toWorkspaceId(workspaceId) : undefined,
      });
      setSavedState({
        workspaceId: String(result.workspaceId),
        workspaceName: result.workspaceName,
      });
      setIsSaving(false);
    } catch (error) {
      setIsSaving(false);
      throw error;
    }
  };

  return (
    <>
      <div
        className={cn(
          "relative flex w-[168px] max-w-full shrink-0 flex-col overflow-hidden rounded-[10px] border bg-card shadow-sm",
          presentation.borderClass,
        )}
      >
        <div
          className={cn(
            "relative flex h-[52px] items-end justify-start overflow-hidden px-2.5 pb-2 pt-2.5",
            presentation.surfaceClass,
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 size-4 bg-background/35"
            style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
          />
          <presentation.Icon className={cn("size-4 shrink-0", presentation.iconClass)} />
        </div>
        <div className="border-t border-border/60 px-2.5 py-2">
          <p className="truncate text-[11px] font-semibold leading-snug text-foreground">
            {artifact.title}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
            {savedState
              ? `Di ${savedState.workspaceName}`
              : artifact.source === "upload"
                ? "Lampiran chat"
                : presentation.label}
          </p>
          {savedState ? (
            <Link
              href={`/app/workspaces/${savedState.workspaceId}`}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
            >
              Buka workspace
            </Link>
          ) : canSave ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={isSaving}
                  aria-label="Simpan ke workspace"
                  onClick={() => {
                    if (requiresPicker) {
                      setPickerOpen(true);
                      return;
                    }
                    void handleSave(threadWorkspaceId);
                  }}
                  className="mt-2 inline-flex size-6 items-center justify-center rounded-full border border-border/80 bg-background text-foreground transition-colors hover:bg-muted/40 disabled:opacity-60"
                >
                  {isSaving ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <Link2Icon className="size-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Simpan ke workspace
              </TooltipContent>
            </Tooltip>
          ) : artifact.source === "workspace" && artifact.savedWorkspaceId ? (
            <button
              type="button"
              onClick={() => router.push(`/app/workspaces/${artifact.savedWorkspaceId}`)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
            >
              Buka workspace
            </button>
          ) : null}
        </div>
      </div>
      <WorkspacePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(workspaceId) => handleSave(workspaceId)}
      />
    </>
  );
}

function getContextArtifactPresentation(artifact: MessageContextArtifactMetadata) {
  if (artifact.artifactType === "url") {
    return {
      Icon: LinkIcon,
      label: "Tautan tersimpan",
      surfaceClass: "bg-sky-soft",
      iconClass: "text-sky-foreground",
      borderClass: "border-sky-soft-border/80",
    };
  }

  if (artifact.source === "upload") {
    const uploadPresentation = getArtifactTypePresentation(artifact.artifactType);
    return {
      Icon: uploadPresentation.Icon,
      label: "Lampiran chat",
      surfaceClass: uploadPresentation.surfaceClass,
      iconClass: uploadPresentation.iconClass,
      borderClass: uploadPresentation.borderClass,
    };
  }

  const workspacePresentation = getArtifactTypePresentation(artifact.artifactType);
  return {
    Icon: workspacePresentation.Icon,
    label: workspacePresentation.label,
    surfaceClass: workspacePresentation.surfaceClass,
    iconClass: workspacePresentation.iconClass,
    borderClass: workspacePresentation.borderClass,
  };
}

function getArtifactTypePresentation(artifactType: string | undefined) {
  switch (artifactType) {
    case "pdf":
      return {
        Icon: FileTextIcon,
        label: "PDF",
        surfaceClass: "bg-lavender-soft",
        iconClass: "text-lavender-foreground",
        borderClass: "border-lavender-soft-border/80",
      };
    case "docx":
      return {
        Icon: FileIcon,
        label: "DOCX",
        surfaceClass: "bg-mint-soft",
        iconClass: "text-mint-foreground",
        borderClass: "border-mint-soft-border/80",
      };
    case "html":
      return {
        Icon: Code2Icon,
        label: "HTML",
        surfaceClass: "bg-lemon-soft",
        iconClass: "text-lemon-foreground",
        borderClass: "border-lemon-soft-border/80",
      };
    case "svg":
      return {
        Icon: ImageIcon,
        label: "SVG",
        surfaceClass: "bg-lavender-soft",
        iconClass: "text-lavender-foreground",
        borderClass: "border-lavender-soft-border/80",
      };
    case "mermaid":
      return {
        Icon: GitBranchIcon,
        label: "Mermaid",
        surfaceClass: "bg-sky-soft",
        iconClass: "text-sky-foreground",
        borderClass: "border-sky-soft-border/80",
      };
    case "json":
      return {
        Icon: BracesIcon,
        label: "JSON",
        surfaceClass: "bg-muted/45",
        iconClass: "text-muted-foreground",
        borderClass: "border-border/80",
      };
    case "csv":
      return {
        Icon: TableIcon,
        label: "CSV",
        surfaceClass: "bg-muted/45",
        iconClass: "text-muted-foreground",
        borderClass: "border-border/80",
      };
    case "code":
      return {
        Icon: Code2Icon,
        label: "Code",
        surfaceClass: "bg-muted/45",
        iconClass: "text-muted-foreground",
        borderClass: "border-border/80",
      };
    case "plain_text":
      return {
        Icon: FileTextIcon,
        label: "Text",
        surfaceClass: "bg-mint-soft",
        iconClass: "text-mint-foreground",
        borderClass: "border-mint-soft-border/80",
      };
    case "markdown":
      return {
        Icon: FileTextIcon,
        label: "Markdown",
        surfaceClass: "bg-mint-soft",
        iconClass: "text-mint-foreground",
        borderClass: "border-mint-soft-border/80",
      };
    default:
      return {
        Icon: LayoutGridIcon,
        label: "Artifact workspace",
        surfaceClass: "bg-muted/45",
        iconClass: "text-muted-foreground",
        borderClass: "border-border/80",
      };
  }
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

function PromptCommandChip({ command }: { command: PromptCommandMetadata }) {
  return (
    <span
      contentEditable={false}
      className={messagePillClass(command.mode === "deep" ? "deep" : "default")}
    >
      {command.commandSlug.replace(/^\//, "")}
    </span>
  );
}

function stripVisibleCommandText(text: string, command: PromptCommandMetadata) {
  const trimmed = text.trim();
  if (trimmed === command.commandSlug) {
    return "";
  }
  if (trimmed.startsWith(`${command.commandSlug} `)) {
    return trimmed.slice(command.commandSlug.length).trimStart();
  }
  return text;
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
