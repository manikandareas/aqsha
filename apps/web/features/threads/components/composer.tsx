"use client";

import {
  type ContextRef,
  DEEP_COMMAND_ID,
  getPromptCommand,
  matchPromptCommandInContent,
  type PromptCommand,
  resolveCommandDispatch,
  splitContextRefs,
  stripPromptCommandSlug,
} from "@aqsha/chat-core";
import {
  AlertCircleIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  FileTextIcon,
  Loader2Icon,
  MessageSquareIcon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from "@aqsha/ui/icons";
import { LayoutGroup, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useContextPickerArtifacts } from "@/features/artifacts/api";
import { UPLOAD_ACCEPT } from "@/features/artifacts/types";
import { useWorkspacesList } from "@/features/workspaces/api";
import { cn } from "@/lib/utils";
import { useHydrateContext, useThreadAttachments } from "../api";
import {
  AgentSelector,
  type ComposerAgentKind,
  useComposerAgentSelection,
} from "./composer-agent-selector";
import {
  type ContextItemOption,
  type ContextWorkspaceOption,
  TokenizedPromptInput,
} from "./tokenized-prompt-input";

const MAX_LENGTH = 8000;

/** Notice blok kirim (Slice 6.2) — billing return-union / cooldown rate-limit. */
export type ComposerNotice = {
  message: string;
  /** Epoch-ms; bila ada → tampil hitung-mundur "(N detik)" sampai kirim diizinkan lagi. */
  retryAt?: number;
};

/** Payload kirim (Slice 6.6). `text` = prompt yang diterima agen (command sudah di-expand
 * client-side). `clientContext` = konteks ephemeral (ekspansi command + catatan `@mention`)
 * yang TIDAK dipersist. */
export type ComposerSendPayload = {
  text: string;
  clientContext?: string[];
  agentKind: ComposerAgentKind;
  /** `"deep"` → jalankan Workflow deep-research (bukan turn chat); `text` = pertanyaan riset. */
  command?: "deep";
};

/** Thread ringkas untuk panel "Thread terbaru" (start panel landing). */
export type RecentThread = { threadId: string; title: string; lastActivityAt: number };

/** Lampiran composer ter-finalize pada thread (Slice 6.7). */
type ComposerAttachment = { artifactId: string; title: string };

const EMPTY_CONTEXT_REFS: ContextRef[] = [];

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

/** Sisa detik sampai `retryAt` (live tick per detik). 0 bila lewat / tak ada. */
function useSecondsLeft(retryAt?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);
  if (!retryAt) return 0;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/**
 * Composer kaya — token editor (expand/collapse animasi) + `/slash` command +
 * `@context` mention + selektor agen, identik visual/UX dengan V1 (apps/web). Data
 * di-wire ke eve/api: command di-expand client-side via `resolveCommandDispatch`,
 * pin `@mention` di-hydrate (ownership server) → `clientContext` ephemeral, kirim
 * via `onSend`. Enter kirim, Shift+Enter newline, Escape hentikan turn berjalan.
 */
export function Composer({
  onSend,
  onStop,
  busy = false,
  disabled = false,
  notice,
  threadId = null,
  ambientWorkspaceId = null,
  errorDraft = null,
  showSuggestions = false,
  recentThreads = [],
  initialContent,
  placeholder = "Ketik @ untuk workspace, / untuk perintah…",
}: {
  onSend: (payload: ComposerSendPayload) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  notice?: ComposerNotice | null;
  /** Thread aktif untuk lampiran (Slice 6.7); null = chat baru sebelum turn pertama → attach off. */
  threadId?: string | null;
  ambientWorkspaceId?: string | null;
  /** Retry (Slice 6.8): teks turn terakhir untuk di-restore saat turn gagal. */
  errorDraft?: string | null;
  showSuggestions?: boolean;
  recentThreads?: RecentThread[];
  /** Pre-seed teks (mis. item Explore). */
  initialContent?: string;
  placeholder?: string;
}) {
  "use no memo";

  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  const [content, setContent] = useState(initialContent ?? "");
  const [commands, setCommands] = useState<PromptCommand[]>([]);
  const [contextRefs, setContextRefs] = useState<ContextRef[]>(EMPTY_CONTEXT_REFS);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [drillWorkspaceId, setDrillWorkspaceId] = useState<string | null>(null);
  const [editorHeight, setEditorHeight] = useState(24);
  const [isSending, setIsSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const secondsLeft = useSecondsLeft(notice?.retryAt);
  const agentSelection = useComposerAgentSelection();
  const hydrate = useHydrateContext();
  const attachmentUpload = useThreadAttachments(threadId ?? "");

  // Re-seed pre-seeded text (e.g. an Explore item) only while the user hasn't
  // diverged from the previously seeded text.
  const lastSeedRef = useRef(initialContent ?? "");
  useEffect(() => {
    const nextSeed = initialContent ?? "";
    if (nextSeed === lastSeedRef.current) return;
    setContent((current) => (current === lastSeedRef.current ? nextSeed : current));
    lastSeedRef.current = nextSeed;
  }, [initialContent]);

  // Retry (Slice 6.8): turn gagal → kembalikan draft terakhir ke editor (resend = turn
  // baru). Derivasi saat render (pola "adjust state when a prop changes", bukan effect).
  const [seenDraft, setSeenDraft] = useState<string | null>(null);
  if (errorDraft) {
    if (errorDraft !== seenDraft) {
      setSeenDraft(errorDraft);
      setContent(errorDraft);
    }
  } else if (seenDraft !== null) {
    setSeenDraft(null);
  }

  const workspacesQuery = useWorkspacesList(false);
  const contextWorkspaces: ContextWorkspaceOption[] = useMemo(
    () =>
      (workspacesQuery.data?.pages ?? []).flatMap((page) =>
        page.items.map((w) => ({ workspaceId: w.id, name: w.name, emoji: w.emoji ?? undefined })),
      ),
    [workspacesQuery.data],
  );

  const itemsQuery = useContextPickerArtifacts(drillWorkspaceId);
  const workspaceItems: ContextItemOption[] = useMemo(
    () =>
      drillWorkspaceId
        ? (itemsQuery.data?.items ?? []).map((a) => ({
            workspaceId: drillWorkspaceId,
            artifactId: a._id,
            title: a.title,
          }))
        : [],
    [itemsQuery.data, drillWorkspaceId],
  );

  const hasText = content.trim().length > 0;
  const isContentEmpty = !hasText && commands.length === 0;
  const hasComposerContext = attachments.length > 0 || contextRefs.length > 0;
  const isExpanded =
    hasComposerContext ||
    (!isContentEmpty &&
      (content.includes("\n") || editorHeight > 34 || commands.length > 0));
  const shellExpanded = isExpanded;
  const shellTransition = composerShellTransition(shellExpanded, shouldReduceMotion);

  const canSend =
    (hasText || attachments.length > 0) &&
    !busy &&
    !disabled &&
    !isSending &&
    !hydrate.isPending;
  const canAttach = Boolean(threadId) && !disabled && !attachmentUpload.isPending && !isSending;

  async function submit() {
    if (!canSend) return;
    setIsSending(true);
    setUploadError(null);

    const parts: string[] = [];
    let displayText: string;
    let command: "deep" | undefined;
    if (hasText) {
      const matched = getPromptCommand(commands[0]?.id) ?? matchPromptCommandInContent(content);
      if (matched?.id === DEEP_COMMAND_ID) {
        // `/deep` → Workflow deep-research: kirim PERTANYAAN (slug di-strip), bukan ekspansi skill.
        const question = stripPromptCommandSlug(content, matched);
        if (!question.trim()) {
          setIsSending(false);
          return;
        }
        displayText = question;
        command = "deep";
      } else {
        const r = resolveCommandDispatch(content, commands[0]?.id);
        if (!r.displayText) {
          setIsSending(false);
          return;
        }
        displayText = r.displayText;
        if (r.dispatchPrompt !== r.displayText) parts.push(r.dispatchPrompt);
      }
    } else {
      // Lampiran tanpa teks → prompt sintetik supaya turn punya pesan (eve butuh non-empty).
      displayText = "Tolong baca berkas terlampir.";
    }

    // Catatan ephemeral nama berkas: agen menemukan isinya via tool list_artifacts/
    // search_thread_documents (scope thread), catatan ini cuma sinyal "ada lampiran".
    if (attachments.length > 0) {
      parts.push(`Berkas terlampir: ${attachments.map((a) => a.title).join(", ")}.`);
    }

    if (contextRefs.length > 0) {
      const { workspaceIds, artifactIds } = splitContextRefs(contextRefs);
      try {
        const hydrated = await hydrate.mutateAsync({ workspaceIds, artifactIds });
        if (hydrated.note) parts.push(hydrated.note);
      } catch {
        // Hydrate gagal (mis. jaringan) → kirim tanpa catatan konteks daripada blok.
      }
    }

    setContent("");
    setCommands([]);
    setContextRefs([]);
    setAttachments([]);
    setDrillWorkspaceId(null);
    setIsSending(false);
    onSend({
      text: displayText,
      clientContext: parts.length > 0 ? parts : undefined,
      agentKind: agentSelection.agentKind,
      command,
    });
  }

  async function onPickFile(file: File | undefined) {
    if (!file || !threadId) return;
    setUploadError(null);
    const res = await attachmentUpload.mutateAsync({ file }).catch(() => null);
    if (res) {
      setAttachments((prev) => [...prev, { artifactId: res.artifactId, title: res.title }]);
    } else {
      setUploadError(`Gagal melampirkan ${file.name}.`);
    }
  }

  const onUploadClick = () => fileInputRef.current?.click();

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
        <div
          className="flex flex-col justify-between overflow-hidden bg-transparent text-left"
          onKeyDown={(e) => {
            // Escape (Slice 6.8): batalkan turn berjalan. Bila palette terbuka, handler-nya
            // sudah stopPropagation Escape (tutup palette) → tak sampai ke sini.
            if (e.key === "Escape" && !e.defaultPrevented && busy && onStop) onStop();
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void onPickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {notice ? <ComposerBlockingNotice notice={notice} secondsLeft={secondsLeft} /> : null}
          <LayoutGroup id="composer-prompt">
            <ComposerChipRow
              attachments={attachments}
              onRemoveAttachment={(id) =>
                setAttachments((prev) => prev.filter((a) => a.artifactId !== id))
              }
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
                    disabled={!canAttach}
                    pending={attachmentUpload.isPending}
                    hasThread={Boolean(threadId)}
                    onClick={onUploadClick}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <TokenizedPromptInput
                    value={content}
                    onValueChange={setContent}
                    onCommandsChange={setCommands}
                    onHeightChange={setEditorHeight}
                    onSubmit={() => void submit()}
                    disabled={disabled}
                    maxLength={MAX_LENGTH}
                    isCollapsed={!isExpanded}
                    placeholder={placeholder}
                    className={isExpanded ? "py-0.5" : undefined}
                    pinnedContextRefs={contextRefs}
                    onContextRefsChange={setContextRefs}
                    contextWorkspaces={contextWorkspaces}
                    ambientWorkspaceId={ambientWorkspaceId}
                    workspaceItems={workspaceItems}
                    workspaceItemsLoading={itemsQuery.isLoading}
                    onRequestWorkspaceItems={setDrillWorkspaceId}
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
                    disabled={!canAttach}
                    pending={attachmentUpload.isPending}
                    hasThread={Boolean(threadId)}
                    onClick={onUploadClick}
                  />
                ) : null}
                <div className="flex shrink-0 items-center gap-1">
                  <AgentSelector
                    agentKind={agentSelection.agentKind}
                    setAgentKind={agentSelection.setAgentKind}
                    canUsePro={agentSelection.canUsePro}
                    onUpgrade={agentSelection.handleUpgrade}
                    disabled={disabled}
                  />
                  <ComposerSubmitButton
                    canSend={canSend}
                    isSending={isSending}
                    busy={busy}
                    onStop={onStop}
                    onSubmit={() => void submit()}
                  />
                </div>
              </div>
            </div>
          </LayoutGroup>
        </div>
      </m.div>
      {showSuggestions && !disabled ? (
        <ComposerStartPanel
          recentThreads={recentThreads}
          onSelectSuggestion={(prompt) => {
            setCommands([]);
            setContent(prompt);
          }}
          onSelectThread={(id) => router.push(`/app/threads/${id}`)}
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

function ComposerBlockingNotice({
  notice,
  secondsLeft,
}: {
  notice: ComposerNotice;
  secondsLeft: number;
}) {
  const isCooldown = Boolean(notice.retryAt);
  return (
    <div className="grid gap-2 border-b border-border/60 px-4 py-2.5">
      {isCooldown ? (
        <div className="rounded-lg border border-lemon-soft-border bg-lemon-soft px-2.5 py-2 text-[11px] font-medium leading-5 text-lemon-foreground animate-in slide-in-from-top-2 duration-200">
          {notice.message}
          {secondsLeft > 0 ? ` (${secondsLeft} detik)` : null}
        </div>
      ) : (
        <div className="rounded-lg border border-coral-soft-border bg-coral-soft px-2.5 py-2 text-[11px] font-medium leading-5 text-coral-foreground animate-in slide-in-from-top-2 duration-200">
          {notice.message}{" "}
          <Link
            href="/app/settings/usage-billing"
            className="font-semibold underline underline-offset-2"
          >
            Buka Billing
          </Link>
        </div>
      )}
    </div>
  );
}

function ComposerStartPanel({
  recentThreads,
  onSelectThread,
  onSelectSuggestion,
}: {
  recentThreads: RecentThread[];
  onSelectThread: (threadId: string) => void;
  onSelectSuggestion: (prompt: string) => void;
}) {
  const sortedThreads = recentThreads
    .toSorted((a, b) => b.lastActivityAt - a.lastActivityAt)
    .slice(0, 4);
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
        {sortedThreads.length > 0 ? (
          sortedThreads.map((thread, index) => (
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
              delay: shouldReduceMotion ? 0 : (index + sortedThreads.length) * 0.035,
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
  attachments,
  onRemoveAttachment,
  uploadError,
  isSending,
}: {
  attachments: ComposerAttachment[];
  onRemoveAttachment: (artifactId: string) => void;
  uploadError: string | null;
  isSending: boolean;
}) {
  const hasChips = attachments.length > 0 || Boolean(uploadError);
  if (!hasChips) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-1 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {attachments.map((file) => (
        <div
          key={file.artifactId}
          className="inline-flex h-7 animate-in items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground shadow-sm zoom-in-95 duration-150"
        >
          <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">{file.title}</span>
          {!isSending ? (
            <button
              type="button"
              onClick={() => onRemoveAttachment(file.artifactId)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Hapus ${file.title}`}
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
  pending,
  hasThread,
  onClick,
}: {
  disabled?: boolean;
  pending?: boolean;
  hasThread: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="aqsha-composer-toolbar-btn flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-muted/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      title={hasThread ? "Lampirkan berkas" : "Kirim pesan dulu untuk melampirkan berkas"}
      aria-label="Lampirkan berkas"
    >
      {pending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <PaperclipIcon className="size-3.5" />
      )}
    </button>
  );
}

function ComposerSubmitButton({
  canSend,
  isSending,
  busy,
  onStop,
  onSubmit,
}: {
  canSend: boolean;
  isSending: boolean;
  busy: boolean;
  onStop?: () => void;
  onSubmit: () => void;
}) {
  if (busy && onStop) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="aqsha-composer-toolbar-btn inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-coral-soft-border bg-coral-soft px-2.5 text-[11px] font-semibold text-coral-foreground hover:bg-coral-soft"
        aria-label="Hentikan"
      >
        <SquareIcon className="size-3" />
        Stop
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={!canSend}
      aria-label="Kirim"
      className={cn(
        "aqsha-composer-toolbar-btn flex size-8 shrink-0 items-center justify-center rounded-full shadow-none transition-all duration-200 active:scale-95",
        !canSend && "cursor-not-allowed bg-muted/30 text-muted-foreground/30",
      )}
    >
      {isSending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <ArrowUpIcon className="size-3.5" />
      )}
    </button>
  );
}
