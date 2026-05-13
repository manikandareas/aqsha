"use client";

import {
  ArrowUpIcon,
  Loader2Icon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  promptCommands,
  type PromptCommand,
} from "@aqsha/convex/prompt-commands";
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RateStatus, ResearchRun, SendResult } from "../types";
import { formatDate } from "../utils/datetime";
import {
  buildComposerSubmission,
  createVisibleComposerContent,
  getComposerAvailability,
  restoreComposerContentAfterBlockedSend,
  stripCommandFromSubmittedContent,
} from "../utils/composer-model";
import type { SendMessage, StartThread } from "./component-types";

export function Composer({
  threadId,
  disabled,
  rateStatus,
  activeRun,
  onCancelRun,
  onStartThread,
  onSend,
}: {
  threadId?: string;
  disabled: boolean;
  rateStatus: RateStatus | undefined;
  onStartThread: StartThread;
  onSend: SendMessage;
  activeRun?: ResearchRun;
  onCancelRun?: (runId: string) => Promise<unknown>;
}) {
  const [content, setContent] = useState("");
  const [selectedCommand, setSelectedCommand] = useState<PromptCommand | null>(null);
  const [mode, setMode] = useState<"normal" | "deep">("normal");
  const [isSending, setIsSending] = useState(false);
  const [localRetryAt, setLocalRetryAt] = useState<number | null>(null);
  const [billingBlock, setBillingBlock] = useState<SendResult & { ok: false } | null>(null);
  const [now, setNow] = useState(() => Date.now());
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

  const handleSubmit = async ({ text }: { text: string }) => {
    if (!canSend) {
      return;
    }

    const submission = buildComposerSubmission({
      content: stripCommandFromSubmittedContent(text, selectedCommand),
      selectedCommand,
      mode: effectiveMode,
    });
    const nextContent = submission.content;
    const nextCommand = selectedCommand;
    setContent("");
    setSelectedCommand(null);
    setIsSending(true);
    try {
      const result = threadId
        ? await onSend({
            threadId,
            content: nextContent,
            mode: submission.mode,
            commandId: submission.commandId,
          })
        : await onStartThread({
            content: nextContent,
            mode: submission.mode,
            commandId: submission.commandId,
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
        router.push(`/threads/${result.threadId}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PromptInput
      onSubmit={handleSubmit}
      data-aqsha-composer-form="true"
      className="rounded-[14px] border border-input bg-card text-foreground shadow-none transition-colors focus-within:border-ring/70 focus-within:ring-3 focus-within:ring-ring/20 has-disabled:bg-card has-disabled:opacity-100 dark:border-input dark:bg-card dark:text-foreground dark:focus-within:border-ring/65 dark:focus-within:ring-ring/18 dark:has-disabled:bg-card"
    >
      {isRateLimited ? (
        <div className="mx-3 mt-3 rounded-[9px] border border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] px-3 py-2 text-[12px] font-medium text-[var(--lemon)]">
          Perlu istirahat sebentar. Coba lagi dalam {retrySeconds || 1} detik.
        </div>
      ) : null}
      {billingBlock ? (
        <div className="mx-3 mt-3 rounded-[9px] border border-[var(--coral-soft-border)] bg-[var(--coral-soft)] px-3 py-2 text-[12px] font-medium leading-5 text-[var(--coral)]">
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
      <TokenizedPromptInput
        value={content}
        command={selectedCommand}
        onValueChange={setContent}
        onCommandChange={(command) => {
          setSelectedCommand(command);
          if (command?.mode === "deep") {
            setMode("deep");
          }
        }}
        onSubmit={() => {
          if (canSend) {
            document
              .querySelector<HTMLFormElement>("[data-aqsha-composer-form='true']")
              ?.requestSubmit();
          }
        }}
        disabled={disabled || isDeepActive}
        maxLength={8000}
        placeholder={
          threadId
            ? "Tulis follow up, atau ketik / untuk perintah riset..."
            : "Tulis pertanyaan, atau ketik / untuk perintah riset..."
        }
      />
      <input type="hidden" name="message" value={visibleContent} />
      <PromptInputFooter className="flex w-full items-end justify-between gap-3 border-t-0 px-4 pb-4 pt-1 text-[var(--ink-soft)] dark:text-[#d4d4d4]">
        <PromptInputTools className="min-w-0 flex-wrap gap-2">
          <div className="inline-flex rounded-full border border-border bg-muted p-0.5 text-[13px] font-semibold text-[var(--ink-soft)] dark:border-input dark:bg-muted dark:text-[#d4d4d4]">
            <ModeButton
              active={mode === "normal"}
              onClick={() => setMode("normal")}
              disabled={isDeepActive}
              variant="normal"
            >
              Normal
            </ModeButton>
            <ModeButton
              active={mode === "deep"}
              onClick={() => setMode("deep")}
              disabled={isDeepActive}
              variant="deep"
            >
              Deep
            </ModeButton>
          </div>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger
              tooltip="Tambah konteks"
              disabled={mode === "deep" || !threadId || disabled || isDeepActive}
              className="size-9 rounded-[9px] text-[var(--ink-soft)] hover:bg-muted hover:text-foreground disabled:text-muted-foreground disabled:opacity-75 dark:text-[#d4d4d4] dark:hover:bg-muted dark:hover:text-foreground dark:disabled:text-[#a3a3a3] dark:disabled:opacity-85"
            >
              <PlusIcon className="size-4" />
            </PromptInputActionMenuTrigger>
            <PromptInputActionMenuContent>
              <PromptInputActionMenuItem disabled>
                <PaperclipIcon className="mr-2 size-4" />
                Lampirkan sumber
              </PromptInputActionMenuItem>
              <PromptInputActionMenuItem disabled>
                <PlusIcon className="mr-2 size-4" />
                Tambah konteks thread
              </PromptInputActionMenuItem>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <PromptInputButton
            tooltip="Lampirkan"
            className="size-9 rounded-[9px] text-[var(--ink-soft)] hover:bg-muted hover:text-foreground disabled:text-muted-foreground disabled:opacity-75 dark:text-[#d4d4d4] dark:hover:bg-muted dark:hover:text-foreground dark:disabled:text-[#a3a3a3] dark:disabled:opacity-85"
            disabled
          >
            <PaperclipIcon className="size-4" />
          </PromptInputButton>
        </PromptInputTools>
        {isDeepActive && activeRun && onCancelRun ? (
          <PromptInputSubmit
            status="streaming"
            onStop={() => onCancelRun(activeRun._id)}
            size="sm"
            className="h-10 shrink-0 rounded-[10px] border border-[var(--coral-soft-border)] bg-[var(--coral-soft)] px-3.5 font-semibold text-[var(--coral)] hover:bg-[var(--coral-soft)]"
          >
            <SquareIcon className="size-3.5" />
            Hentikan
          </PromptInputSubmit>
        ) : (
          <PromptInputSubmit
            size="icon-sm"
            className="size-10 shrink-0 rounded-[12px] bg-primary text-primary-foreground shadow-none transition-colors hover:bg-[#2f73d6] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 dark:bg-[#0b7cff] dark:text-white dark:hover:bg-[#2f8cff] dark:disabled:bg-muted dark:disabled:text-[#a3a3a3]"
            disabled={!canSend}
            status={isSending ? "submitted" : undefined}
          >
            {isSending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ArrowUpIcon className="size-4" />
            )}
          </PromptInputSubmit>
        )}
      </PromptInputFooter>
    </PromptInput>
  );
}

function TokenizedPromptInput({
  value,
  command,
  onValueChange,
  onCommandChange,
  onSubmit,
  disabled,
  maxLength,
  placeholder,
}: {
  value: string;
  command: PromptCommand | null;
  onValueChange: (value: string) => void;
  onCommandChange: (command: PromptCommand | null) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const isArgumentEmpty = value.length === 0;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const shouldSyncWhileFocused = value.length === 0;
    if (
      editor.innerText !== value &&
      (document.activeElement !== editor || shouldSyncWhileFocused)
    ) {
      editor.innerText = value;
    }
  }, [value]);

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      moveCaretToEnd(editor);
    });
  }, []);

  const handleSelectCommand = useCallback(
    (selected: PromptCommand) => {
      onCommandChange(selected);
      setCommandOpen(false);
      focusEditor();
    },
    [focusEditor, onCommandChange],
  );

  const clearCommand = useCallback(() => {
    onCommandChange(null);
    focusEditor();
  }, [focusEditor, onCommandChange]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const text = editor.innerText.replace(/\u00a0/g, " ");
    if (text.length <= maxLength) {
      onValueChange(text);
      return;
    }
    const trimmed = text.slice(0, maxLength);
    editor.innerText = trimmed;
    moveCaretToEnd(editor);
    onValueChange(trimmed);
  }, [maxLength, onValueChange]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onSubmit();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit();
        return;
      }
      if (event.key === "/" && !command && isSlashCommandPosition(editorRef.current)) {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        command &&
        isArgumentEmpty
      ) {
        event.preventDefault();
        clearCommand();
        return;
      }
      if (event.key === "Escape" && commandOpen) {
        event.preventDefault();
        setCommandOpen(false);
        focusEditor();
      }
    },
    [clearCommand, command, commandOpen, focusEditor, isArgumentEmpty, onSubmit],
  );

  return (
    <Popover open={commandOpen} onOpenChange={setCommandOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex min-h-16 w-full items-start gap-2 px-4 pb-3 pt-4 text-[15px] font-medium leading-6 text-foreground",
            disabled && "opacity-100",
          )}
          onKeyDownCapture={(event) => {
            if (
              (event.key === "Backspace" || event.key === "Delete") &&
              command &&
              isArgumentEmpty
            ) {
              event.preventDefault();
              event.stopPropagation();
              clearCommand();
            }
          }}
        >
          {command ? (
            <button
              type="button"
              disabled={disabled}
              onClick={clearCommand}
              className={cn(
                "mt-0.5 shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold leading-none",
                command.mode === "deep"
                  ? "border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] text-[var(--lavender)]"
                  : "border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary",
              )}
            >
              {command.slug}
            </button>
          ) : null}
          <div className="relative min-w-0 flex-1">
            {value.length === 0 ? (
              <span className="pointer-events-none absolute left-0 top-0 font-medium text-muted-foreground dark:text-[#b8b8b8]">
                {command?.placeholder ?? placeholder}
              </span>
            ) : null}
            <div
              ref={editorRef}
              contentEditable={!disabled}
              role="textbox"
              aria-label="Pesan"
              aria-multiline="true"
              data-slot="input-group-control"
              className="min-h-10 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-foreground caret-primary outline-none disabled:opacity-100"
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              suppressContentEditableWarning
            />
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="top"
        className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusEditor();
        }}
      >
        <Command
          key={commandOpen ? "open" : "closed"}
          shouldFilter={false}
          className="rounded-lg p-0"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setCommandOpen(false);
              focusEditor();
            }
          }}
        >
          <CommandList className="max-h-[17rem] py-1">
            {promptCommandGroups.map((group) => (
              <CommandGroup
                key={group}
                heading={group}
                className="border-b border-border/70 p-1 last:border-b-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:pt-0 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:leading-3"
              >
                {promptCommands
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelectCommand(item)}
                      className="min-h-10 items-start gap-2 rounded-md px-2 py-1.5 text-[13px]"
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate font-medium leading-4">
                          {item.slug}
                        </span>
                        <span className="block whitespace-normal text-[10px] leading-3 text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      {item.mode === "deep" ? (
                        <span className="shrink-0 rounded-full bg-[var(--lavender-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--lavender)]">
                          Deep
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const promptCommandGroups = [
  "Tulis Akademik",
  "Rancang Riset",
  "Riset Mendalam",
] as const;

function isSlashCommandPosition(editor: HTMLDivElement | null) {
  if (!editor) {
    return false;
  }
  const beforeCursor = getTextBeforeCursor(editor);
  return beforeCursor.length === 0 || /\s$/.test(beforeCursor);
}

function getTextBeforeCursor(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return editor.innerText;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) {
    return editor.innerText;
  }
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(editor);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  return beforeRange.toString();
}

function moveCaretToEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function ModeButton({
  active,
  onClick,
  disabled,
  variant,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant: "normal" | "deep";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 transition-colors disabled:opacity-75 dark:disabled:opacity-80",
        active
          ? "bg-card text-foreground shadow-[0_1px_2px_rgb(26_31_43_/_0.08)]"
          : "text-[var(--ink-soft)] hover:text-foreground dark:text-[#cfcfcf] dark:hover:text-foreground",
        active && variant === "deep" && "text-[var(--lavender)]",
        active && variant === "normal" && "text-foreground",
      )}
    >
      {children}
    </button>
  );
}
