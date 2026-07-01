"use client";

import { useContextPickerArtifacts } from "@/features/artifacts/api";
import { UPLOAD_ACCEPT } from "@/features/artifacts/types";
import {
  useAmbientContextEpoch,
  useComposerSelection,
} from "@/features/thread-experience/components/composer-context-mentions";
import { useWorkspacesList } from "@/features/workspaces/api";
import { cn } from "@/lib/utils";
import {
  type ContextRef,
  contextRefKey,
  DEEP_COMMAND_ID,
  getPromptCommand,
  matchPromptCommandInContent,
  MENTION_MARKER_OPEN,
  type PromptCommand,
  resolveCommandDispatch,
  splitContextRefs,
  stripPromptCommandSlug,
} from "@aqsha/chat-core";
import {
  AlertCircleIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  Loader2Icon,
  MessageSquareIcon,
  PaperclipIcon,
  SquareIcon,
} from "@aqsha/ui/icons";
import { LayoutGroup, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useHydrateContext,
  useRemoveThreadAttachment,
  useThreadArtifacts,
  useThreadAttachments,
} from "../api";
import {
  AgentSelector,
  type ComposerAgentKind,
  useComposerAgentSelection,
} from "./composer-agent-selector";
import { FileChip } from "./file-chip";
import {
  type ComposerPlaceholder,
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
  /** Varian `text` yang menyimpan penanda `@mention` (U+E000/E001) untuk DITAMPILKAN + DIPERSIST
   * sebagai pill. Hanya ada bila pesan memuat mention; agen menerima `text` yang bersih (penanda
   * di-strip server-side). */
  richText?: string;
  clientContext?: string[];
  agentKind: ComposerAgentKind;
  /** `"deep"` → jalankan Workflow deep-research (bukan turn chat); `text` = pertanyaan riset. */
  command?: "deep";
  /** Id artifact lampiran yang dikirim bersama pesan ini → dipetakan EKSAK ke bubble user live
   * (tanpa menebak via jendela waktu). Undefined bila tak ada lampiran. */
  attachmentIds?: string[];
};

/** Thread ringkas untuk panel "Thread terbaru" (start panel landing). */
export type RecentThread = {
  threadId: string;
  title: string;
  lastActivityAt: number;
};

/** Lampiran composer ter-finalize pada thread (Slice 6.7). `indexingStatus` melacak index async
 * (D5): `pending` = file besar masih diproses worker; `ready`/`failed` setelah selesai. */
type ComposerAttachment = {
  artifactId: string;
  title: string;
  indexingStatus?: string;
};

const EMPTY_CONTEXT_REFS: ContextRef[] = [];

/** Reducer merge-pin bersama dua epoch-merge (ambient + selection library): buang `removeKeys`
 * dari set saat ini, lalu prepend `addRefs` yang belum ada (dedup by key). Satu tempat supaya
 * perbaikan (mis. perbandingan key/urutan) tak luput di salah satu jalur. */
function reconcilePinnedRefs(
  current: ContextRef[],
  removeKeys: Set<string>,
  addRefs: ContextRef[],
): ContextRef[] {
  const kept = current.filter((ref) => !removeKeys.has(contextRefKey(ref)));
  const keptKeys = new Set(kept.map(contextRefKey));
  const toAdd = addRefs.filter((ref) => !keptKeys.has(contextRefKey(ref)));
  return [...toAdd, ...kept];
}

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
  threadAgentKind = "lite",
  ambientWorkspaceId = null,
  ambientContextRefs = EMPTY_CONTEXT_REFS,
  errorDraft = null,
  showSuggestions = false,
  recentThreads = [],
  initialContent,
  placeholder,
}: {
  onSend: (payload: ComposerSendPayload) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  notice?: ComposerNotice | null;
  /** Thread aktif untuk lampiran (Slice 6.7); null = chat baru sebelum turn pertama → attach off. */
  threadId?: string | null;
  /** Tier TERSIMPAN thread (`chat_threads.agent_kind`) = default selektor; di-baca sekali di surface
   * (gated thread existing → tak ada GET untuk thread baru). Override sesi tetap lokal di selektor. */
  threadAgentKind?: ComposerAgentKind;
  ambientWorkspaceId?: string | null;
  /** Token konteks ambient dari halaman tempat panel chat dibuka (workspace/artifact/paper/berita).
   * Di-seed otomatis sebagai pill di awal komposer; user tetap bisa mencabutnya. */
  ambientContextRefs?: ContextRef[];
  /** Retry (Slice 6.8): teks turn terakhir untuk di-restore saat turn gagal. */
  errorDraft?: string | null;
  showSuggestions?: boolean;
  recentThreads?: RecentThread[];
  /** Pre-seed teks (mis. item Explore). */
  initialContent?: string;
  /** Teks placeholder. String = dipakai apa adanya di semua lebar; pasangan
   * `{ narrow, wide }` membiarkan composer memilih per-lebar KONTAINER lewat container
   * query (bukan viewport `useIsMobile`) — jadi panel chat sempit tetap memakai teks
   * ringkas walau di desktop. Kosong = default @-mention/slash. */
  placeholder?: ComposerPlaceholder;
}) {
  "use no memo";

  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const resolvedPlaceholder: ComposerPlaceholder = placeholder ?? {
    narrow: "Tulis pesan…",
    wide: "Tulis pesan untuk Astra…",
  };

  const [content, setContent] = useState(initialContent ?? "");
  // Varian `content` dengan penanda `@mention` (dari `serializeComposerEditorWithMarkers`) — dipakai
  // membangun teks tampil/persist ber-pill. Di-sync dari editor lewat `onRichValueChange`. Di-seed
  // dari `initialContent` (teks polos, tanpa marker) supaya tak drift dari `content` sebelum edit.
  const [richContent, setRichContent] = useState(initialContent ?? "");
  const [commands, setCommands] = useState<PromptCommand[]>([]);
  const [contextRefs, setContextRefs] =
    useState<ContextRef[]>(EMPTY_CONTEXT_REFS);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [drillWorkspaceId, setDrillWorkspaceId] = useState<string | null>(null);
  const [editorHeight, setEditorHeight] = useState(24);
  const [isSending, setIsSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const secondsLeft = useSecondsLeft(notice?.retryAt);
  const agentSelection = useComposerAgentSelection(threadAgentKind);
  const hydrate = useHydrateContext();
  const attachmentUpload = useThreadAttachments(threadId ?? "");
  const removeAttachment = useRemoveThreadAttachment(threadId ?? "");

  // D5: lampiran besar di-index async (status awal `pending`). Poll daftar artifact thread HANYA
  // selama ada upload pending; status chip LIVE diturunkan dari hasil poll (derive, tak mirror ke
  // state → hindari cascading render) + toast sekali per artifact bila index gagal.
  const hasPendingUpload = attachments.some(
    (a) => a.indexingStatus === "pending",
  );
  const threadArtifacts = useThreadArtifacts(
    hasPendingUpload ? (threadId ?? null) : null,
    {
      pollWhilePending: true,
    },
  );
  const attachmentsView = useMemo(
    () =>
      attachments.map((a) => {
        const live = threadArtifacts.data?.find(
          (it) => it._id === a.artifactId,
        )?.indexingStatus;
        return live ? { ...a, indexingStatus: live } : a;
      }),
    [attachments, threadArtifacts.data],
  );
  const toastedFailuresRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of attachmentsView) {
      if (
        a.indexingStatus === "failed" &&
        !toastedFailuresRef.current.has(a.artifactId)
      ) {
        toastedFailuresRef.current.add(a.artifactId);
        toast.warning(
          `"${a.title}" gagal diindeks; Astra mungkin tak bisa membaca isinya.`,
        );
      }
    }
  }, [attachmentsView]);

  // Re-seed pre-seeded text (e.g. an Explore item) only while the user hasn't
  // diverged from the previously seeded text.
  const lastSeedRef = useRef(initialContent ?? "");
  useEffect(() => {
    const nextSeed = initialContent ?? "";
    if (nextSeed === lastSeedRef.current) return;
    setContent((current) =>
      current === lastSeedRef.current ? nextSeed : current,
    );
    lastSeedRef.current = nextSeed;
  }, [initialContent]);

  // Auto-mention konteks halaman (ambient): saat panel chat dibuka di halaman workspace/artifact/
  // paper/berita — atau saat "Tanya Astra" di kartu feed mengganti item — sematkan token-nya
  // sebagai pill di awal komposer. Pola "adjust state when a prop changes" saat render (BUKAN
  // effect → hindari cascading render), sama seperti errorDraft di bawah. Replace-aware: token
  // ambient LAMA yang tak lagi ambient dibuang (mis. ganti item), token ambient baru disisipkan,
  // dan token MANUAL (ditambah user via palette) selalu dipertahankan. Re-merge hanya saat
  // signature ambient berganti supaya tak ada loop dengan ekstraksi editor.
  // Merge berdasar EPOCH (naik tiap set ambient), bukan signature: klik-ulang "Tanya Astra" pada item
  // yang sama setelah user menghapus pill-nya menghasilkan signature identik tapi epoch baru → pill
  // tetap disisipkan ulang (signature-only dulu membuat tombol seakan mati). Epoch hanya naik saat ada
  // set sungguhan, jadi penghapusan pill oleh user TIDAK memicu re-merge (token tak muncul lagi sendiri).
  const ambientEpoch = useAmbientContextEpoch();
  const [ambientMerge, setAmbientMerge] = useState<{
    epoch: number;
    refs: ContextRef[];
  }>({
    epoch: -1,
    refs: EMPTY_CONTEXT_REFS,
  });
  if (ambientEpoch !== ambientMerge.epoch) {
    // Buang SEMUA token ambient (lama + baru) dari set saat ini, sisakan token MANUAL (palette), lalu
    // prepend token ambient SAAT INI → ganti item bersih, token manual selalu aman.
    const ambientKeys = new Set(
      [...ambientMerge.refs, ...ambientContextRefs].map(contextRefKey),
    );
    setAmbientMerge({ epoch: ambientEpoch, refs: ambientContextRefs });
    setContextRefs((current) => reconcilePinnedRefs(current, ambientKeys, ambientContextRefs));
  }

  // Selection library ("klik 1× = konteks", provider) → pill `@paper` di composer. Pola epoch-merge
  // sama seperti ambient: saat selection berubah, buang pill selection yang tak lagi terpilih dan
  // sisipkan yang baru, PERTAHANKAN pill lain (manual/@ + ambient). Injeksi ini tak lewat editor →
  // tak memicu `onContextRefsChange`, jadi back-prop di bawah hanya menangkap pencabutan oleh user.
  const selection = useComposerSelection();
  const [selectionMerge, setSelectionMerge] = useState<{
    epoch: number;
    keys: string[];
  }>({
    epoch: -1,
    keys: [],
  });
  if (selection.selectionEpoch !== selectionMerge.epoch) {
    const nextKeys = selection.selectionRefs.map(contextRefKey);
    const nextKeySet = new Set(nextKeys);
    // Buang HANYA pill yang tadinya selection tapi kini tak terpilih; ref manual/ambient tetap.
    const removedKeys = new Set(
      selectionMerge.keys.filter((key) => !nextKeySet.has(key)),
    );
    setSelectionMerge({ epoch: selection.selectionEpoch, keys: nextKeys });
    setContextRefs((current) =>
      reconcilePinnedRefs(current, removedKeys, selection.selectionRefs),
    );
  }

  // Sinkron DUA ARAH: pill selection yang dicabut user di editor → deselect kartu library. Hanya
  // terpanggil dari event editor (bukan injeksi programatik), jadi ref `paper` terpilih yang hilang
  // dari `next` = benar-benar dicabut user. Non-selection (manual @) diabaikan (bukan bagian selection).
  const handleContextRefsChange = (next: ContextRef[]) => {
    if (selection.selectionRefs.length > 0) {
      const nextKeys = new Set(next.map(contextRefKey));
      for (const ref of selection.selectionRefs) {
        if (ref.kind === "paper" && !nextKeys.has(contextRefKey(ref))) {
          selection.removeSelectionArtifact(ref.artifactId);
        }
      }
    }
    setContextRefs(next);
  };

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
        page.items.map((w) => ({
          workspaceId: w.id,
          name: w.name,
          emoji: w.emoji ?? undefined,
        })),
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
  const shellTransition = composerShellTransition(
    shellExpanded,
    shouldReduceMotion,
  );

  const canSend =
    (hasText || attachments.length > 0) &&
    !busy &&
    !disabled &&
    !isSending &&
    !hydrate.isPending;
  const canAttach =
    Boolean(threadId) && !disabled && !attachmentUpload.isPending && !isSending;

  async function submit() {
    if (!canSend) return;
    setIsSending(true);
    setUploadError(null);

    const parts: string[] = [];
    let displayText: string;
    // Varian ber-marker sejajar `displayText` (sama persis, hanya menyisipkan `label` di
    // posisi mention) — untuk ditampilkan + dipersist sebagai pill. `content` (bersih) tetap dasar
    // deteksi command; `richContent` cuma beda di penanda mention, jadi logika slug-strip identik.
    let displayMarked: string;
    let command: "deep" | undefined;
    if (hasText) {
      const matched =
        getPromptCommand(commands[0]?.id) ??
        matchPromptCommandInContent(content);
      if (matched?.id === DEEP_COMMAND_ID) {
        // `/deep` → Workflow deep-research: kirim PERTANYAAN (slug di-strip), bukan ekspansi skill.
        const question = stripPromptCommandSlug(content, matched);
        if (!question.trim()) {
          setIsSending(false);
          return;
        }
        displayText = question;
        displayMarked = stripPromptCommandSlug(richContent, matched);
        command = "deep";
      } else {
        const r = resolveCommandDispatch(content, commands[0]?.id);
        if (!r.displayText) {
          setIsSending(false);
          return;
        }
        displayText = r.displayText;
        displayMarked = richContent.trim();
        if (r.dispatchPrompt !== r.displayText) parts.push(r.dispatchPrompt);
      }
    } else {
      // Lampiran tanpa teks → prompt sintetik supaya turn punya pesan (eve butuh non-empty).
      displayText = "Tolong baca berkas terlampir.";
      displayMarked = displayText;
    }

    // Catatan ephemeral nama berkas: agen menemukan isinya via tool list_artifacts/
    // search_thread_documents (scope thread), catatan ini cuma sinyal "ada lampiran".
    if (attachments.length > 0) {
      parts.push(
        `Berkas terlampir: ${attachments.map((a) => a.title).join(", ")}.`,
      );
    }

    if (contextRefs.length > 0) {
      const { workspaceIds, artifactIds, paperKeys, feedItemIds, selections } =
        splitContextRefs(contextRefs);
      try {
        const hydrated = await hydrate.mutateAsync({
          workspaceIds,
          artifactIds,
          paperKeys,
          feedItemIds,
          selections,
        });
        if (hydrated.note) parts.push(hydrated.note);
      } catch {
        // Hydrate gagal (mis. jaringan) → kirim tanpa catatan konteks daripada blok.
      }
    }

    // Snapshot id lampiran SEBELUM clear → dipetakan eksak ke bubble user live.
    const attachmentIds = attachments.map((a) => a.artifactId);
    setContent("");
    setRichContent("");
    setCommands([]);
    setContextRefs([]);
    // Konteks terpakai untuk pesan ini → bersihkan selection library (highlight kartu + pill hilang
    // bersamaan; keputusan owner: "Bersihkan" setelah kirim).
    selection.clearSelectionRefs();
    setAttachments([]);
    setDrillWorkspaceId(null);
    setIsSending(false);
    onSend({
      text: displayText,
      // Hanya kirim varian ber-marker bila benar ada mention (mengandung penanda) → selain itu
      // identik dengan `text`, tak perlu dikirim.
      richText: displayMarked.includes(MENTION_MARKER_OPEN)
        ? displayMarked
        : undefined,
      clientContext: parts.length > 0 ? parts : undefined,
      agentKind: agentSelection.agentKind,
      command,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    });
  }

  async function onPickFile(file: File | undefined) {
    if (!file || !threadId) return;
    setUploadError(null);
    const res = await attachmentUpload.mutateAsync({ file }).catch(() => null);
    if (res) {
      setAttachments((prev) => [
        ...prev,
        {
          artifactId: res.artifactId,
          title: res.title,
          indexingStatus: res.indexingStatus,
        },
      ]);
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
        className="@container/composer w-full overflow-hidden border border-border/85 bg-card/95 text-foreground"
        animate={{
          borderRadius: shellExpanded
            ? COMPOSER_EXPANDED_RADIUS
            : COMPOSER_COLLAPSED_RADIUS,
        }}
        transition={shellTransition}
      >
        <div
          className="flex flex-col justify-between overflow-hidden bg-transparent text-left"
          onKeyDown={(e) => {
            // Escape (Slice 6.8): batalkan turn berjalan. Bila palette terbuka, handler-nya
            // sudah stopPropagation Escape (tutup palette) → tak sampai ke sini.
            if (e.key === "Escape" && !e.defaultPrevented && busy && onStop)
              onStop();
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
          {notice ? (
            <ComposerBlockingNotice notice={notice} secondsLeft={secondsLeft} />
          ) : null}
          <LayoutGroup id="composer-prompt">
            <ComposerChipRow
              attachments={attachmentsView}
              onRemoveAttachment={(id) => {
                // Cabut staged: buang dari komposer + soft-delete artifact-nya supaya berkas yang
                // ditarik tak ikut terpetakan ke pesan saat join sisi-baca (message row). Bila
                // soft-delete GAGAL, artifact tetap aktif → kembalikan chip (rollback) supaya UI
                // jujur dan user bisa coba lagi (idempoten di service → aman re-try).
                const removed = attachments.find((a) => a.artifactId === id);
                setAttachments((prev) =>
                  prev.filter((a) => a.artifactId !== id),
                );
                if (threadId && removed) {
                  removeAttachment.mutate(
                    { artifactId: id },
                    {
                      onError: () =>
                        setAttachments((prev) =>
                          prev.some((a) => a.artifactId === id)
                            ? prev
                            : [...prev, removed],
                        ),
                    },
                  );
                }
              }}
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
                    onRichValueChange={setRichContent}
                    onCommandsChange={setCommands}
                    onHeightChange={setEditorHeight}
                    onSubmit={() => void submit()}
                    disabled={disabled}
                    maxLength={MAX_LENGTH}
                    isCollapsed={!isExpanded}
                    placeholder={resolvedPlaceholder}
                    className={isExpanded ? "py-0.5" : undefined}
                    pinnedContextRefs={contextRefs}
                    onContextRefsChange={handleContextRefsChange}
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
        {disabled ? null : <ComposerAffordanceHint />}
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
    prompt:
      "Cari sumber akademik terbaru tentang dampak AI pada pembelajaran mandiri.",
  },
  {
    emoji: "🧭",
    label: "Buat peta riset",
    prompt: "Buat peta riset awal untuk topik literasi digital siswa SMA.",
  },
  {
    emoji: "🧪",
    label: "Susun metodologi",
    prompt:
      "Susun rancangan metodologi penelitian kualitatif untuk evaluasi chatbot belajar.",
  },
  {
    emoji: "📝",
    label: "Buat outline tulisan",
    prompt:
      "Buat outline artikel ilmiah tentang penggunaan AI sebagai tutor personal.",
  },
] as const;

/** Chip mono kecil untuk memvisualkan tuts `@` / `/` di dalam kalimat hint. */
function HintKey({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[5px] border border-border/70 bg-background px-1 font-mono text-[10px] font-semibold leading-none text-foreground">
      {children}
    </kbd>
  );
}

/**
 * Zona footer edukasi di DALAM shell composer — berbagi border, radius, dan clip lewat
 * `overflow-hidden` shell, jadi menyatu sebagai satu permukaan dengan area input dan hanya
 * dipisah garis rambut. Menyadarkan user akan `@` (tautkan konteks) & `/` (perintah).
 */
function ComposerAffordanceHint() {
  return (
    <div className="flex items-center gap-2 border-t border-border/50 bg-foreground/[0.02] px-3.5 py-2 text-muted-foreground animate-in fade-in duration-200">
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium leading-4">
        <HintKey>@</HintKey>
        <span>tautkan konteks</span>
        <span className="text-muted-foreground/40" aria-hidden>
          ·
        </span>
        <HintKey>/</HintKey>
        <span>jalankan perintah</span>
      </p>
    </div>
  );
}

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
          <ThreadListEmpty />
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
              delay: shouldReduceMotion
                ? 0
                : (index + sortedThreads.length) * 0.035,
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

// Placeholder rows mirror the real thread item shape so the frosted base reads
// as "this is where your threads land" — varied widths avoid a too-regular grid.
const THREAD_EMPTY_ROW_WIDTHS = ["74%", "56%", "82%", "44%"];

function ThreadListEmpty() {
  return (
    <div className="relative isolate min-h-[8.75rem] overflow-hidden rounded-xl border border-dashed border-border/70 bg-muted/15">
      <div
        inert={true}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 grid select-none gap-1.5 p-2"
      >
        {THREAD_EMPTY_ROW_WIDTHS.map((width) => (
          <div
            key={width}
            className="grid min-h-8 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-background/45 px-2.5"
          >
            <MessageSquareIcon
              className="size-3.5 shrink-0 text-muted-foreground/40"
              aria-hidden
            />
            <span
              className="block h-2 justify-self-start self-center rounded-full bg-muted-foreground/15"
              style={{ width }}
            />
            <ArrowUpRightIcon
              className="size-3.5 shrink-0 text-muted-foreground/40"
              aria-hidden
            />
          </div>
        ))}
      </div>

      {/* Frosted glass: blur the placeholder rows + a top→bottom vignette so the
          hint stays legible and the rows dissolve toward the bottom edge. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/45 via-background/65 to-background/85 backdrop-blur-[2px]" />

      <div className="relative grid min-h-[inherit] place-items-center p-4 text-center">
        <div className="grid max-w-[15rem] justify-items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground backdrop-blur-sm">
            <MessageSquareIcon className="size-4" />
          </span>
          <p className="text-[13px] font-semibold text-foreground">
            Mulai percakapan sekarang
          </p>
        </div>
      </div>
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
    <div className="flex flex-wrap items-center gap-2 px-3.5 pb-1 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {attachments.map((file) => (
        <div
          key={file.artifactId}
          className="animate-in zoom-in-95 duration-150"
        >
          <FileChip
            id={file.artifactId}
            title={file.title}
            indexingStatus={file.indexingStatus}
            onRemove={
              isSending ? undefined : () => onRemoveAttachment(file.artifactId)
            }
          />
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
      title={
        hasThread
          ? "Lampirkan berkas"
          : "Kirim pesan dulu untuk melampirkan berkas"
      }
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
