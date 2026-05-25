"use client";

import {
  ArrowUpIcon,
  ChevronDownIcon,
  LayoutGridIcon,
  Loader2Icon,
  MicIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PromptCommand } from "@aqsha/convex/prompt-commands";
import {
  PromptInput,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
import { ComposerContextMenu } from "./composer-context-menu";
import { TokenizedPromptInput } from "./composer-token-input";

type ComposerVariant = "hero" | "docked";

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
  const onStartThread = props.mode === "draft" ? props.onStartThread : props.mode === "thread" ? props.onStartThread : undefined;
  const onSend = props.mode === "thread" ? props.onSend : undefined;

  const [content, setContent] = useState("");
  const [selectedCommand, setSelectedCommand] = useState<PromptCommand | null>(null);
  const [mode, setMode] = useState<"normal" | "deep">("normal");
  const [isSending, setIsSending] = useState(false);
  const [localRetryAt, setLocalRetryAt] = useState<number | null>(null);
  const [billingBlock, setBillingBlock] = useState<SendResult & { ok: false } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editorHeight, setEditorHeight] = useState(24);

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
    disabled,
    isSending,
    isRateLimited,
    activeRun,
  });
  const router = useRouter();
  const isExpanded = editorHeight > 30 || content.includes("\n");

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

  const handleSubmit = async () => {
    if (!canSend) {
      return;
    }

    const submission = buildComposerSubmission({
      content,
      selectedCommand,
      mode: effectiveMode,
    });
    const nextContent = submission.content;
    const nextCommand = selectedCommand;
    setContent("");
    setSelectedCommand(null);
    setIsSending(true);
    try {
      const result = threadId && onSend
        ? await onSend({
            threadId,
            content: nextContent,
            mode: submission.mode,
            commandId: submission.commandId,
          })
        : onStartThread
          ? await onStartThread({
              content: nextContent,
              mode: submission.mode,
              commandId: submission.commandId,
            })
          : { ok: false as const, reason: "subscription_required" as const };
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

  const requestFormSubmit = () => {
    if (canSend) {
      void handleSubmit();
    }
  };

  return (
    <div className="flex w-full flex-col">
      {(contextArtifacts.length > 0 || contextLabel) && (
        <div className="flex flex-wrap gap-1.5 mb-2.5 px-1 animate-in fade-in slide-in-from-bottom-2 duration-200 justify-start">
          {contextLabel && contextArtifacts.length === 0 && (
            <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card/75 px-2.5 text-[11px] font-semibold text-foreground shadow-sm">
              <LayoutGridIcon className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[12rem]">{contextLabel}</span>
            </div>
          )}
          {contextArtifacts.map((artifact) => (
            <div
              key={artifact.artifactId}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground shadow-sm animate-in zoom-in-95 duration-150"
            >
              <LayoutGridIcon className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[12rem]">{artifact.title}</span>
              {onRemoveContextArtifact && (
                <button
                  type="button"
                  onClick={() => onRemoveContextArtifact(artifact.artifactId)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={`Hapus ${artifact.title} dari konteks`}
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <PromptInput
        onSubmit={handleSubmit}
        className={cn(
          "border border-border/85 bg-card/95 text-foreground transition-all duration-300 ease-out has-disabled:opacity-100 flex flex-col justify-between overflow-hidden shadow-sm text-left",
          isExpanded ? "rounded-[24px]" : "rounded-full",
          variant === "hero" && "shadow-aqsha",
        )}
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

        <div
          className={cn(
            "flex w-full min-h-0 transition-all duration-300 ease-out",
            isExpanded ? "flex-col gap-3 p-3.5 pb-2.5 pt-3" : "flex-row items-center gap-2 pl-2 pr-1.5 py-1 min-h-[46px]",
          )}
        >
          <div className={cn("flex items-start flex-1 min-w-0", isExpanded ? "w-full px-1" : "gap-2")}>
            {!isExpanded ? (
              <ComposerContextMenu
                threadId={threadId}
                disabled={disabled}
                isDeepActive={isDeepActive}
                mode={mode}
              />
            ) : null}

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
              placeholder="Select board items, @ mention creators, or / for voices..."
              className={isExpanded ? "py-0.5" : "py-1"}
            />
          </div>

          <div
            className={cn(
              "flex items-center shrink-0",
              isExpanded ? "w-full justify-between pt-1 border-t border-border/40" : "gap-1",
            )}
          >
            {isExpanded ? (
              <ComposerContextMenu
                threadId={threadId}
                disabled={disabled}
                isDeepActive={isDeepActive}
                mode={mode}
              />
            ) : null}

            <div className="flex items-center gap-1 shrink-0 ml-auto">
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
      </PromptInput>
    </div>
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
          <SparklesIcon
            className={cn(
              "size-3 shrink-0",
              mode === "deep" ? "text-lavender" : "text-primary",
            )}
          />
          <span className="capitalize">{mode}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => setMode("normal")}>
          <span className="font-semibold text-[11px]">Normal Mode</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setMode("deep")}>
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
        canSend
          ? "bg-mint text-white hover:opacity-90"
          : "bg-muted/30 text-muted-foreground/30 cursor-not-allowed",
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
