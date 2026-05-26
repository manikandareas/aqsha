"use client";

import {
  AlertCircleIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  FileTextIcon,
  LayoutGridIcon,
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { api } from "@aqsha/convex/api";
import { useAction, useMutation } from "convex/react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { PromptCommand } from "@aqsha/convex/prompt-commands";
import {
  PromptInput,
  type PromptInputFile,
  type PromptInputMessage,
  PromptInputSubmit,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toArtifactId, toStorageId, type ArtifactId, type StorageId } from "@/lib/convex-refs";
import type { RateStatus, ResearchRun, SendResult } from "../types";
import { formatDate } from "../utils/datetime";
import {
  buildComposerSubmission,
  createVisibleComposerContent,
  getComposerAvailability,
  restoreComposerContentAfterBlockedSend,
} from "../utils/composer-model";
import type {
  DraftContextArtifact,
  SendMessage,
  StartThread,
} from "./component-types";
import { TokenizedPromptInput } from "./composer-token-input";

type ComposerVariant = "hero" | "docked";

const COMPOSER_EASE_OUT = [0.23, 1, 0.32, 1] as const;

function composerShellTransition(
  isExpanded: boolean,
  shouldReduceMotion: boolean | null,
) {
  if (shouldReduceMotion) {
    return { duration: 0 };
  }

  return {
    duration: isExpanded ? 0.28 : 0.22,
    ease: COMPOSER_EASE_OUT,
  };
}

function composerLayoutTransition(
  isExpanded: boolean,
  shouldReduceMotion: boolean | null,
) {
  if (shouldReduceMotion) {
    return { layout: { duration: 0 } };
  }

  return {
    layout: {
      duration: isExpanded ? 0.28 : 0.22,
      ease: COMPOSER_EASE_OUT,
    },
  };
}

type ComposerSharedProps = {
  disabled: boolean;
  rateStatus: RateStatus | undefined;
  onThreadCreated?: (threadId: string) => void;
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  variant?: ComposerVariant;
  contextLabel?: string;
  showVoiceInput?: boolean;
  activeRun?: ResearchRun;
  onCancelRun?: (runId: string) => Promise<unknown>;
};

export type ComposerProps = ComposerSharedProps &
  (
    | {
        mode?: "draft";
        threadId?: undefined;
        onStartThread: StartThread;
        onSend?: never;
      }
    | {
        mode: "thread";
        threadId: string;
        onSend: SendMessage;
        onStartThread?: StartThread;
      }
    | {
        mode: "disabled";
        threadId?: undefined;
        onStartThread?: never;
        onSend?: never;
        disabled: true;
      }
  );

export function Composer(props: ComposerProps) {
  const {
    disabled,
    rateStatus,
    onThreadCreated,
    contextArtifacts = [],
    onRemoveContextArtifact,
    variant = "docked",
    contextLabel,
    showVoiceInput = false,
    activeRun,
    onCancelRun,
  } = props;

  const threadId = props.mode === "thread" ? props.threadId : undefined;
  const onSend = props.mode === "thread" ? props.onSend : undefined;
  const onStartThread = props.mode === "disabled" ? undefined : props.onStartThread;

  const [content, setContent] = useState("");
  const [selectedCommand, setSelectedCommand] = useState<PromptCommand | null>(null);
  const [mode, setMode] = useState<"normal" | "deep">("normal");
  const [isSending, setIsSending] = useState(false);
  const [localRetryAt, setLocalRetryAt] = useState<number | null>(null);
  const [billingBlock, setBillingBlock] = useState<SendResult & { ok: false } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editorHeight, setEditorHeight] = useState(24);
  const [isExpanded, setIsExpanded] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<PromptInputFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const generateUploadUrl = useMutation(api.artifacts.generateUploadUrl);
  const createThreadAttachment = useAction(api.artifactUploads.createThreadAttachmentFromStorage);

  const retryAt = localRetryAt ?? rateStatus?.retryAt ?? null;
  const retrySeconds =
    retryAt && retryAt > now
      ? Math.max(1, Math.ceil((retryAt - now) / 1000))
      : 0;
  const isRateLimited = retrySeconds > 0;
  const visibleContent = createVisibleComposerContent(content, selectedCommand);
  const effectiveMode = selectedCommand?.mode === "deep" ? "deep" : mode;
  const { canSend, isDeepActive } = getComposerAvailability({
    visibleContent,
    hasAttachments: attachmentFiles.length > 0,
    disabled,
    isSending,
    isRateLimited,
    activeRun,
  });
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const isContentEmpty = content.trim().length === 0 && !selectedCommand;
  const shellExpanded =
    isExpanded ||
    attachmentFiles.length > 0 ||
    contextArtifacts.length > 0 ||
    Boolean(contextLabel);

  // Sticky expand: once multiline, stay expanded until empty. Prevents reflow
  // oscillation when collapsed (narrow) vs expanded (wide) widths flip line count.
  useLayoutEffect(() => {
    if (isContentEmpty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this state is a sticky layout latch driven by measured editor height.
      setIsExpanded(false);
      return;
    }

    if (content.includes("\n") || editorHeight > 34 || selectedCommand) {
      setIsExpanded(true);
    }
  }, [isContentEmpty, content, editorHeight, selectedCommand]);

  const shellTransition = useMemo(
    () => composerShellTransition(shellExpanded, shouldReduceMotion),
    [shellExpanded, shouldReduceMotion],
  );
  const layoutTransition = useMemo(
    () => composerLayoutTransition(isExpanded, shouldReduceMotion),
    [isExpanded, shouldReduceMotion],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleSuggestion = (event: Event) => {
      const suggestion = (event as CustomEvent<string>).detail;
      if (typeof suggestion === "string") {
        setSelectedCommand(null);
        setContent(suggestion);
      }
    };
    window.addEventListener("aqsha:suggestion", handleSuggestion);
    return () => window.removeEventListener("aqsha:suggestion", handleSuggestion);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isDeepActive && activeRun && onCancelRun) {
        void onCancelRun(activeRun._id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRun, isDeepActive, onCancelRun]);

  const handleSubmit = async (message?: PromptInputMessage) => {
    if (!canSend) {
      return;
    }

    if (!threadId && !onSend && !onStartThread) {
      console.error("Composer is missing onSend/onStartThread handlers");
      return;
    }

    setUploadError(null);
    setIsSending(true);
    const nextCommand = selectedCommand;
    let nextContent = content;
    try {
      const { attachments: uploadedArtifacts, pendingAttachments } = await uploadAttachments(
        message?.files ?? [],
      );
      const fallbackContent =
        (uploadedArtifacts.length > 0 || pendingAttachments.length > 0) &&
        content.trim().length === 0
          ? `Use the attached document${uploadedArtifacts.length + pendingAttachments.length > 1 ? "s" : ""} as context: ${[
              ...uploadedArtifacts.map((artifact) => artifact.title),
              ...pendingAttachments.map((attachment) => attachment.fileName.replace(/\.[^.]+$/, "") || attachment.fileName),
            ].join(", ")}.`
          : content;
      const messageAttachmentArtifactIds = uploadedArtifacts.map((artifact) => artifact.artifactId);
      const submission = buildComposerSubmission({
        content: fallbackContent,
        selectedCommand,
        mode: effectiveMode,
      });
      nextContent = submission.content;
      setContent("");
      setSelectedCommand(null);

      const attachmentArgs = {
        ...(messageAttachmentArtifactIds.length > 0
          ? { messageAttachmentArtifactIds }
          : {}),
        ...(pendingAttachments.length > 0 ? { pendingAttachments } : {}),
      };
      const result = threadId && onSend
        ? await onSend({
            threadId,
            content: nextContent,
            mode: submission.mode,
            commandId: submission.commandId,
            ...attachmentArgs,
          })
        : await onStartThread!({
            content: nextContent,
            mode: submission.mode,
            commandId: submission.commandId,
            ...attachmentArgs,
          });
      if (!result.ok) {
        if (result.reason === "rate_limited" && result.retryAt) {
          setLocalRetryAt(result.retryAt);
          setBillingBlock(null);
        } else {
          setBillingBlock(result);
        }
        setContent(restoreComposerContentAfterBlockedSend(nextContent, nextCommand));
        setSelectedCommand(nextCommand);
        return;
      }
      setBillingBlock(null);
      if (!threadId && result.threadId) {
        if (onThreadCreated) {
          onThreadCreated(result.threadId);
        } else {
          router.push(`/threads/${result.threadId}`);
        }
      }
    } finally {
      setIsSending(false);
    }
  };

  const uploadAttachments = async (
    files: Array<PromptInputMessage["files"][number]>,
  ): Promise<{
    attachments: Array<{ artifactId: ArtifactId; title: string }>;
    pendingAttachments: Array<{
      storageId: StorageId;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }> => {
    if (files.length === 0) {
      return { attachments: [], pendingAttachments: [] };
    }

    const attachments: Array<{ artifactId: ArtifactId; title: string }> = [];
    const pendingAttachments: Array<{
      storageId: StorageId;
      fileName: string;
      mimeType: string;
      size: number;
    }> = [];

    for (const filePart of files) {
      const file = filePart.file;
      if (!file) {
        const message = "File attachment tidak bisa dibaca. Pilih ulang file tersebut.";
        setUploadError(message);
        throw new Error(message);
      }
      const uploadUrl = await generateUploadUrl(
        threadId ? { threadId } : {},
      );
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        const message = `Upload gagal untuk ${file.name}.`;
        setUploadError(message);
        throw new Error(message);
      }
      const body = (await response.json()) as { storageId?: string };
      if (!body.storageId) {
        const message = `Storage ID tidak tersedia untuk ${file.name}.`;
        setUploadError(message);
        throw new Error(message);
      }

      if (threadId) {
        const artifact = await createThreadAttachment({
          threadId,
          storageId: body.storageId as never,
          fileName: file.name,
          mimeType: file.type || filePart.mediaType || "application/octet-stream",
          size: file.size,
        });
        attachments.push({
          artifactId: toArtifactId(String(artifact.artifactId)),
          title: artifact.title,
        });
      } else {
        pendingAttachments.push({
          storageId: toStorageId(body.storageId),
          fileName: file.name,
          mimeType: file.type || filePart.mediaType || "application/octet-stream",
          size: file.size,
        });
      }
    }
    return { attachments, pendingAttachments };
  };

  const requestFormSubmit = () => {
    if (canSend) {
      const activeElement = document.activeElement;
      const form = activeElement instanceof HTMLElement
        ? activeElement.closest("form")
        : null;
      if (form instanceof HTMLFormElement) {
        form.requestSubmit();
        return;
      }
      void handleSubmit({ text: visibleContent, files: attachmentFiles });
    }
  };

  return (
    <div className="flex w-full flex-col">
      <motion.div
        className={cn(
          "w-full overflow-hidden border border-border/85 bg-card/95 text-foreground shadow-sm",
          variant === "hero" && "shadow-aqsha",
        )}
        animate={{
          borderRadius: shellExpanded ? 24 : 9999,
        }}
        transition={shellTransition}
      >
        <PromptInput
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,text/html,application/json"
          multiple
          maxFiles={4}
          maxFileSize={25 * 1024 * 1024}
          onFilesChange={setAttachmentFiles}
          onError={(error) => setUploadError(error.message)}
          onSubmit={(message) => handleSubmit(message)}
          className="flex flex-col justify-between overflow-hidden bg-transparent text-left has-disabled:opacity-100"
        >
          {isRateLimited || billingBlock ? (
            <div className="grid gap-2 border-b border-border/60 px-4 py-2.5">
              {isRateLimited ? (
                <div className="rounded-lg border border-lemon-soft-border bg-lemon-soft px-2.5 py-2 text-[11px] font-medium leading-5 text-lemon-foreground animate-in slide-in-from-top-2 duration-200">
                  Perlu istirahat sebentar. Coba lagi dalam {retrySeconds || 1} detik.
                </div>
              ) : null}
              {billingBlock ? (
                <div className="rounded-lg border border-coral-soft-border bg-coral-soft px-2.5 py-2 text-[11px] font-medium leading-5 text-coral-foreground animate-in slide-in-from-top-2 duration-200">
                  {billingBlock.reason === "quota_exceeded"
                    ? `Credits habis. Reset ${billingBlock.resetAt ? formatDate(billingBlock.resetAt) : "periode berikutnya"}.`
                    : billingBlock.reason === "subscription_required"
                      ? `Butuh plan ${billingBlock.requiredPlan ?? "berbayar"} untuk mode ini.`
                      : "Billing belum aktif. Periksa subscription di halaman Billing."}{" "}
                  <a href="/settings/usage-billing" className="font-semibold underline underline-offset-2">
                    Buka Billing
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          <LayoutGroup id="composer-prompt">
            <ComposerChipRow
              contextLabel={contextLabel}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              uploadError={uploadError}
              isSending={isSending}
            />
            <div
              className={cn(
                "flex w-full min-h-0 transition-[padding,gap] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
                isExpanded
                  ? "flex-col gap-3 p-3.5 pb-2.5 pt-2"
                  : shellExpanded
                    ? "min-h-[46px] flex-row items-center gap-2 p-2 pl-2.5 pr-1.5"
                    : "min-h-[46px] flex-row items-center gap-2 py-1 pl-2 pr-1.5",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-start",
                  isExpanded ? "w-full px-1" : "gap-2",
                )}
              >
                {!isExpanded ? (
                  <ComposerUploadButton
                    disabled={disabled || isDeepActive || isSending}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <TokenizedPromptInput
                    value={content}
                    command={selectedCommand}
                    onValueChange={setContent}
                    onHeightChange={setEditorHeight}
                    onCommandChange={(command) => {
                      setSelectedCommand(command);
                      if (command?.mode === "deep") {
                        setMode("deep");
                      }
                    }}
                    onSubmit={requestFormSubmit}
                    disabled={disabled || isDeepActive}
                    maxLength={8000}
                    placeholder="Select board items, or / for voices..."
                    className={isExpanded ? "py-0.5" : "py-1"}
                  />
                </div>
              </div>

              <div
                className={cn(
                  "flex shrink-0 items-center gap-1",
                  isExpanded ? "w-full justify-between pt-1" : "",
                )}
              >
                {isExpanded ? (
                  <ComposerUploadButton
                    disabled={disabled || isDeepActive || isSending}
                  />
                ) : null}
                <div className="flex shrink-0 items-center gap-1">
                  <ModeSelector mode={mode} setMode={setMode} disabled={isDeepActive} />
                  {showVoiceInput ? <MicButton disabled={disabled || isDeepActive} /> : null}
                  <ComposerSubmitButton
                    canSend={canSend}
                    isSending={isSending}
                    isDeepActive={isDeepActive}
                    activeRun={activeRun}
                    onCancelRun={onCancelRun}
                  />
                </div>
              </div>
            </div>
          </LayoutGroup>
        </PromptInput>
      </motion.div>
    </div>
  );
}

function ComposerChipRow({
  contextLabel,
  contextArtifacts,
  onRemoveContextArtifact,
  uploadError,
  isSending,
}: {
  contextLabel?: string;
  contextArtifacts: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  uploadError: string | null;
  isSending: boolean;
}) {
  const attachments = usePromptInputAttachments();
  const hasContextLabel = Boolean(contextLabel && contextArtifacts.length === 0);
  const hasChips =
    hasContextLabel ||
    contextArtifacts.length > 0 ||
    attachments.files.length > 0 ||
    Boolean(uploadError);

  if (!hasChips) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-1 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {hasContextLabel ? (
        <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card/75 px-2.5 text-[11px] font-semibold text-foreground shadow-sm">
          <LayoutGridIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[12rem] truncate">{contextLabel}</span>
        </div>
      ) : null}
      {contextArtifacts.map((artifact) => (
        <div
          key={artifact.artifactId}
          className="inline-flex h-7 animate-in items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground shadow-sm zoom-in-95 duration-150"
        >
          <LayoutGridIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[12rem] truncate">{artifact.title}</span>
          {onRemoveContextArtifact && !isSending ? (
            <button
              type="button"
              onClick={() => onRemoveContextArtifact(artifact.artifactId)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Hapus ${artifact.title} dari konteks`}
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </div>
      ))}
      {attachments.files.map((file) => (
        <div
          key={file.id}
          className="inline-flex h-7 animate-in items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground shadow-sm zoom-in-95 duration-150"
        >
          <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">{file.filename}</span>
          <span className="text-[10px] font-medium text-muted-foreground">Lampiran chat</span>
          {!isSending ? (
            <button
              type="button"
              onClick={() => attachments.remove(file.id)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Hapus ${file.filename}`}
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </div>
      ))}
      {uploadError ? (
        <div className="inline-flex min-h-7 max-w-full items-start gap-1.5 rounded-full border border-coral-soft-border bg-coral-soft px-2.5 py-1 text-[11px] font-medium leading-5 text-coral-foreground">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      ) : null}
    </div>
  );
}

function ComposerUploadButton({
  disabled,
}: {
  disabled?: boolean;
}) {
  const attachments = usePromptInputAttachments();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => attachments.openFileDialog()}
      className="aqsha-composer-toolbar-btn flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-muted/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      title="Upload document"
      aria-label="Upload document"
    >
      <PaperclipIcon className="size-3.5" />
    </button>
  );
}

function ModeSelector({
  mode,
  setMode,
  disabled,
}: {
  mode: "normal" | "deep";
  setMode: (mode: "normal" | "deep") => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="aqsha-composer-toolbar-btn inline-flex h-8 items-center gap-1 rounded-full bg-muted/20 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all duration-150 cursor-pointer disabled:opacity-50"
        >
          <span className="capitalize">{mode}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => setMode("normal")} className="gap-2">
          <SparklesIcon className="size-3.5 shrink-0 text-primary" />
          <span className="font-semibold text-[11px]">Normal Mode</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setMode("deep")} className="gap-2">
          <SparklesIcon className="size-3.5 shrink-0 text-lavender" />
          <span className="font-semibold text-[11px] text-lavender">Deep Mode</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MicButton({ disabled }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="aqsha-composer-toolbar-btn flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-all duration-150 disabled:opacity-50 cursor-pointer"
      title="Voice Input (Segera hadir)"
    >
      <MicIcon className="size-3.5" />
    </button>
  );
}

function ComposerSubmitButton({
  canSend,
  isSending,
  isDeepActive,
  activeRun,
  onCancelRun,
}: {
  canSend: boolean;
  isSending: boolean;
  isDeepActive: boolean;
  activeRun?: ResearchRun;
  onCancelRun?: (runId: string) => Promise<unknown>;
}) {
  if (isDeepActive && activeRun && onCancelRun) {
    return (
      <PromptInputSubmit
        status="streaming"
        onStop={() => onCancelRun(activeRun._id)}
        size="sm"
        className="aqsha-composer-toolbar-btn h-8 shrink-0 rounded-full border border-coral-soft-border bg-coral-soft px-2.5 text-[11px] font-semibold text-coral-foreground hover:bg-coral-soft"
      >
        <SquareIcon className="size-3" />
        Stop
      </PromptInputSubmit>
    );
  }

  return (
    <PromptInputSubmit
      size="icon-sm"
      className={cn(
        "aqsha-composer-toolbar-btn size-8 shrink-0 rounded-full flex items-center justify-center shadow-none transition-all duration-200 active:scale-95",
        !canSend && "bg-muted/30 text-muted-foreground/30 cursor-not-allowed",
      )}
      disabled={!canSend}
      status={isSending ? "submitted" : undefined}
    >
      {isSending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <ArrowUpIcon className="size-3.5" />
      )}
    </PromptInputSubmit>
  );
}
