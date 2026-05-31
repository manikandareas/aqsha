"use client";

import {
  AlertCircleIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  FileTextIcon,
  LayoutGridIcon,
  Loader2Icon,
  MessageSquareIcon,
  MicIcon,
  PaperclipIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "@aqsha/ui/icons";
import { api } from "@aqsha/convex/api";
import { LayoutGroup, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { MAX_UPLOAD_BYTES } from "@aqsha/convex/artifact-upload-limits";
import type { PromptCommand } from "@aqsha/convex/prompt-commands";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputProvider,
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
import {
  useConvexActionFn,
  useConvexMutationFn,
} from "@/lib/convex-query";
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
  ThreadSummary,
} from "./component-types";
import { TokenizedPromptInput } from "./composer-token-input";

type ComposerVariant = "hero" | "docked";

const COMPOSER_EASE_OUT = [0.23, 1, 0.32, 1] as const;
const COMPOSER_COLLAPSED_RADIUS = 23;
const COMPOSER_EXPANDED_RADIUS = 24;
const COMPOSER_START_ITEM_TRANSFORM = "translateY(0px) scale(1)";
const COMPOSER_START_ITEM_ANIMATE = {
  opacity: 1,
  transform: COMPOSER_START_ITEM_TRANSFORM,
};

function composerShellTransition(
  isExpanded: boolean,
  shouldReduceMotion: boolean | null,
) {
  if (shouldReduceMotion) {
    return { duration: 0 };
  }

  return {
    duration: isExpanded ? 0.2 : 0.16,
    ease: COMPOSER_EASE_OUT,
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
  hitlBlocking?: boolean;
  showSuggestions?: boolean;
  threads?: ThreadSummary[];
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
  return (
    <PromptInputProvider>
      <ComposerContent {...props} />
    </PromptInputProvider>
  );
}

function ComposerContent(props: ComposerProps) {
  "use no memo";

  const {
    disabled,
    rateStatus,
    onThreadCreated,
    contextArtifacts = [],
    onRemoveContextArtifact,
    contextLabel,
    showVoiceInput = false,
    activeRun,
    onCancelRun,
    hitlBlocking = false,
    showSuggestions = false,
    threads = [],
  } = props;

  const threadId = props.mode === "thread" ? props.threadId : undefined;
  const onSend = props.mode === "thread" ? props.onSend : undefined;
  const onStartThread = props.mode === "disabled" ? undefined : props.onStartThread;

  const [content, setContent] = useState("");
  const [inlineCommands, setInlineCommands] = useState<PromptCommand[]>([]);
  const [mode, setMode] = useState<"normal" | "deep">("normal");
  const [isSending, setIsSending] = useState(false);
  const [localRetryAt, setLocalRetryAt] = useState<number | null>(null);
  const [billingBlock, setBillingBlock] = useState<SendResult & { ok: false } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editorHeight, setEditorHeight] = useState(24);
  const attachments = usePromptInputAttachments();
  const attachmentFiles = attachments.files;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const generateUploadUrl = useConvexMutationFn(api.artifacts.generateUploadUrl);
  const createThreadAttachment = useConvexActionFn(api.artifactUploads.createThreadAttachmentFromStorage);

  const retryAt = localRetryAt ?? rateStatus?.retryAt ?? null;
  const retrySeconds =
    retryAt && retryAt > now
      ? Math.max(1, Math.ceil((retryAt - now) / 1000))
      : 0;
  const isRateLimited = retrySeconds > 0;
  const visibleContent = createVisibleComposerContent(content);
  const hasDeepInlineCommand = inlineCommands.some((command) => command.mode === "deep");
  const effectiveMode = hasDeepInlineCommand ? "deep" : mode;
  const { canSend, isDeepActive } = getComposerAvailability({
    visibleContent,
    hasAttachments: attachmentFiles.length > 0,
    disabled,
    isSending,
    isRateLimited,
    activeRun,
    hitlBlocking,
  });
  const isInteractionLocked = isDeepActive || hitlBlocking;
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const isContentEmpty = content.trim().length === 0 && inlineCommands.length === 0;
  const hasComposerContext =
    attachmentFiles.length > 0 ||
    contextArtifacts.length > 0 ||
    Boolean(contextLabel);
  const isExpanded =
    hasComposerContext ||
    (!isContentEmpty &&
      (content.includes("\n") || editorHeight > 34 || inlineCommands.length > 0));
  const shellExpanded = isExpanded;

  const shellTransition = composerShellTransition(shellExpanded, shouldReduceMotion);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleSuggestion = (event: Event) => {
      const suggestion = (event as CustomEvent<string>).detail;
      if (typeof suggestion === "string") {
        setInlineCommands([]);
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
    const submittedCommands = inlineCommands;
    try {
      const { attachments: uploadedArtifacts, pendingAttachments } = await uploadAttachments(
        message?.files ?? [],
      );
      const fallbackContent =
        (uploadedArtifacts.length > 0 || pendingAttachments.length > 0) &&
        content.trim().length === 0
          ? `Use the attached artifact${uploadedArtifacts.length + pendingAttachments.length > 1 ? "s" : ""} as context: ${[
              ...uploadedArtifacts.map((artifact) => artifact.title),
              ...pendingAttachments.map((attachment) => attachment.fileName.replace(/\.[^.]+$/, "") || attachment.fileName),
            ].join(", ")}.`
          : content;
      const messageAttachmentArtifactIds = uploadedArtifacts.map((artifact) => artifact.artifactId);
      const submission = buildComposerSubmission({
        visibleContent: fallbackContent,
        commands: submittedCommands,
        mode: effectiveMode,
      });
      setContent("");
      setInlineCommands([]);

      const attachmentArgs = {
        ...(messageAttachmentArtifactIds.length > 0
          ? { messageAttachmentArtifactIds }
          : {}),
        ...(pendingAttachments.length > 0 ? { pendingAttachments } : {}),
      };
      const result = threadId && onSend
        ? await onSend({
            threadId,
            content: submission.content,
            mode: submission.mode,
            commandId: submission.commandId,
            ...attachmentArgs,
          })
        : await onStartThread!({
            content: submission.content,
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
        setContent(restoreComposerContentAfterBlockedSend(submission.content));
        setIsSending(false);
        return;
      }
      setBillingBlock(null);
      if (!threadId && result.threadId) {
        if (onThreadCreated) {
          onThreadCreated(result.threadId);
        } else {
          router.push(`/app/threads/${result.threadId}`);
        }
      }
      setIsSending(false);
    } catch (error) {
      setIsSending(false);
      throw error;
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

    const uploadedFiles = await Promise.all(files.map(async (filePart) => {
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
        return {
          kind: "artifact" as const,
          artifactId: toArtifactId(String(artifact.artifactId)),
          title: artifact.title,
        };
      }

      return {
        kind: "pending" as const,
        storageId: toStorageId(body.storageId),
        fileName: file.name,
        mimeType: file.type || filePart.mediaType || "application/octet-stream",
        size: file.size,
      };
    }));

    const attachments = uploadedFiles.flatMap((file) =>
      file.kind === "artifact"
        ? [{ artifactId: file.artifactId, title: file.title }]
        : [],
    );
    const pendingAttachments = uploadedFiles.flatMap((file) =>
      file.kind === "pending"
        ? [
            {
              storageId: file.storageId,
              fileName: file.fileName,
              mimeType: file.mimeType,
              size: file.size,
            },
          ]
        : [],
    );

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

  const handleSuggestionSelect = (prompt: string) => {
    setInlineCommands([]);
    setContent(prompt);
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <m.div
        initial={false}
        layout
        className="w-full overflow-hidden border border-border/85 bg-card/95 text-foreground"
        animate={{
          borderRadius: shellExpanded ? COMPOSER_EXPANDED_RADIUS : COMPOSER_COLLAPSED_RADIUS,
        }}
        transition={shellTransition}
      >
        <PromptInput
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm,.svg,.mmd,.mermaid,.js,.jsx,.ts,.tsx,.css,.py,.java,.go,.rs,.sql,.sh,.yml,.yaml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,text/html,application/json,image/svg+xml,text/javascript,application/javascript,text/css,text/yaml,application/x-yaml"
          multiple
          maxFiles={4}
          maxFileSize={MAX_UPLOAD_BYTES}
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
                  <Link href="/app/settings/usage-billing" className="font-semibold underline underline-offset-2">
                    Buka Billing
                  </Link>
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
                "flex w-full min-h-0 transition-[padding,gap] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
                isExpanded
                  ? "flex-col gap-3 p-3.5 pb-2.5 pt-2"
                  : shellExpanded
                    ? "min-h-[46px] flex-row items-center gap-2 p-2 pl-2.5 pr-1.5"
                    : "min-h-[46px] flex-row items-center gap-2 py-1 pl-2 pr-1.5",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-1",
                  isExpanded ? "w-full items-start px-1" : "items-center gap-2",
                )}
              >
                {!isExpanded ? (
                  <ComposerUploadButton
                    disabled={disabled || isInteractionLocked || isSending}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <TokenizedPromptInput
                    value={content}
                    onValueChange={setContent}
                    onCommandsChange={(commands) => {
                      setInlineCommands(commands);
                      if (commands.some((command) => command.mode === "deep")) {
                        setMode("deep");
                      }
                    }}
                    onHeightChange={setEditorHeight}
                    onSubmit={requestFormSubmit}
                    disabled={disabled || isInteractionLocked}
                    maxLength={8000}
                    isCollapsed={!isExpanded}
                    placeholder={
                      hitlBlocking
                        ? "Selesaikan langkah di atas terlebih dahulu…"
                        : "Select board items, or / for voices..."
                    }
                    className={isExpanded ? "py-0.5" : undefined}
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
                    disabled={disabled || isInteractionLocked || isSending}
                  />
                ) : null}
                <div className="flex shrink-0 items-center gap-1">
                  <ModeSelector mode={mode} setMode={setMode} disabled={isInteractionLocked} />
                  {showVoiceInput ? <MicButton disabled={disabled || isInteractionLocked} /> : null}
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
      </m.div>
      {showSuggestions && !disabled ? (
        <ComposerStartPanel
          threads={threads}
          onSelectSuggestion={handleSuggestionSelect}
          onSelectThread={(selectedThreadId) => router.push(`/app/threads/${selectedThreadId}`)}
        />
      ) : null}
    </div>
  );
}

const composerSuggestions = [
  {
    emoji: "🔎",
    label: "Cari sumber akademik",
    prompt: "Cari sumber akademik terbaru tentang dampak AI pada pembelajaran mandiri.",
  },
  {
    emoji: "🧭",
    label: "Buat peta riset",
    prompt: "Buat peta riset awal untuk topik literasi digital siswa SMA.",
  },
  {
    emoji: "🧪",
    label: "Susun metodologi",
    prompt: "Susun rancangan metodologi penelitian kualitatif untuk evaluasi chatbot belajar.",
  },
  {
    emoji: "📝",
    label: "Buat outline tulisan",
    prompt: "Buat outline artikel ilmiah tentang penggunaan AI sebagai tutor personal.",
  },
] as const;

function ComposerStartPanel({
  threads,
  onSelectThread,
  onSelectSuggestion,
}: {
  threads: ThreadSummary[];
  onSelectThread: (threadId: string) => void;
  onSelectSuggestion: (prompt: string) => void;
}) {
  const recentThreads = threads.toSorted((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 4);
  const shouldReduceMotion = useReducedMotion();
  const startItemInitial = shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, transform: "translateY(6px) scale(0.985)" };
  const startItemHover = shouldReduceMotion
    ? undefined
    : {
        transform: "translateY(-1px) scale(1)",
        transition: { duration: 0.12, ease: COMPOSER_EASE_OUT },
      };
  const startItemTap = shouldReduceMotion
    ? undefined
    : {
        transform: "translateY(0px) scale(0.985)",
        transition: { duration: 0.1, ease: COMPOSER_EASE_OUT },
      };

  return (
    <div className="grid gap-4 sm:grid-cols-[1.05fr_0.95fr]">
      <ComposerStartColumn title="Thread terbaru">
        {recentThreads.length > 0 ? (
          recentThreads.map((thread, index) => (
            <m.button
              key={thread.threadId}
              type="button"
              onClick={() => onSelectThread(thread.threadId)}
              className="group grid min-h-8 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-background/45 px-2.5 text-left transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-card"
              initial={startItemInitial}
              animate={COMPOSER_START_ITEM_ANIMATE}
              whileHover={startItemHover}
              whileTap={startItemTap}
              transition={{
                duration: shouldReduceMotion ? 0.12 : 0.18,
                delay: shouldReduceMotion ? 0 : index * 0.035,
                ease: COMPOSER_EASE_OUT,
              }}
            >
              <MessageSquareIcon
                className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 truncate text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                {thread.title}
              </span>
              <ArrowUpRightIcon
                className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
                aria-hidden
              />
            </m.button>
          ))
        ) : (
          <p className="rounded-xl bg-background/45 p-3 text-[12px] leading-5 text-muted-foreground">
            Belum ada thread terbaru.
          </p>
        )}
      </ComposerStartColumn>

      <ComposerStartColumn title="Suggestion">
        {composerSuggestions.map((item, index) => (
          <m.button
            key={item.label}
            type="button"
            onClick={() => onSelectSuggestion(item.prompt)}
            className="group flex min-h-8 items-center gap-2 rounded-lg bg-background/45 px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-card hover:text-foreground"
            initial={startItemInitial}
            animate={COMPOSER_START_ITEM_ANIMATE}
            whileHover={startItemHover}
            whileTap={startItemTap}
            transition={{
              duration: shouldReduceMotion ? 0.12 : 0.18,
              delay: shouldReduceMotion ? 0 : (index + recentThreads.length) * 0.035,
              ease: COMPOSER_EASE_OUT,
            }}
            aria-label={`Gunakan suggestion: ${item.label}`}
          >
            <span
              className="grid size-5 shrink-0 place-items-center rounded-md bg-muted/55 text-[12px] transition-colors group-hover:bg-muted"
              aria-hidden
            >
              {item.emoji}
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </m.button>
        ))}
      </ComposerStartColumn>
    </div>
  );
}

function ComposerStartColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2">
      <h2 className="px-1 text-left text-[12px] font-semibold tracking-normal text-foreground/72">
        {title}
      </h2>
      <div className="grid gap-1.5">{children}</div>
    </section>
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
      title="Upload artifact"
      aria-label="Upload artifact"
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
