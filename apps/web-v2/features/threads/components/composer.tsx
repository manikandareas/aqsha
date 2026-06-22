"use client";

import {
  type ContextRef,
  DEEP_COMMAND_ID,
  matchPromptCommandInContent,
  type PromptCommand,
  resolveCommandDispatch,
  splitContextRefs,
} from "@aqsha/chat-core";
import { Button } from "@aqsha/ui/components/button";
import { ArrowUpIcon, SquareIcon } from "@aqsha/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useContextPickerArtifacts } from "@/features/artifacts/api";
import { useWorkspacesList } from "@/features/workspaces/api";
import { useHydrateContext, useSendStatus } from "../api";
import {
  type ComposerAgentKind,
  AgentSelector,
  useComposerAgentSelection,
} from "./composer-agent-selector";
import { type ComposerAttachment, ComposerAttachments } from "./composer-attachments";
import {
  type ContextItemOption,
  type ContextWorkspaceOption,
  TokenizedPromptInput,
} from "./tokenized-prompt-input";

const MAX_LENGTH = 8000;

/** Notice blok kirim (Slice 6.2) — billing return-union / cooldown rate-limit. */
export type ComposerNotice = {
  message: string;
  /** Epoch-ms; bila ada → tampil hitung-mundur "(Ndetik)" sampai kirim diizinkan lagi. */
  retryAt?: number;
};

/** Payload kirim (Slice 6.6) — pelebaran dari `string`. `text` = prompt yang diterima
 * agen (command sudah di-expand client-side). `clientContext` = konteks ephemeral
 * (ekspansi command + catatan `@mention`) yang TIDAK dipersist. */
export type ComposerSendPayload = {
  text: string;
  clientContext?: string[];
  agentKind: ComposerAgentKind;
};

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
 * Composer kaya (Slice 6.6) — token editor + `/slash` command + `@context` mention
 * + selektor agen. Command di-expand client-side SEBELUM kirim (eve tak punya
 * interception); pin `@mention` di-hydrate (ownership server) → `clientContext`
 * ephemeral. Enter kirim, Shift+Enter newline.
 */
export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  notice,
  threadId = null,
  ambientWorkspaceId = null,
  placeholder = "Tulis pesan untuk Astra…",
  errorDraft = null,
}: {
  onSend: (payload: ComposerSendPayload) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  notice?: ComposerNotice | null;
  /** Thread aktif untuk lampiran (Slice 6.7); null = chat baru sebelum turn pertama → attach off. */
  threadId?: string | null;
  ambientWorkspaceId?: string | null;
  placeholder?: string;
  /** Retry (Slice 6.8): teks turn terakhir untuk di-restore saat turn gagal. */
  errorDraft?: string | null;
}) {
  const [value, setValue] = useState("");
  const [commands, setCommands] = useState<PromptCommand[]>([]);
  const [contextRefs, setContextRefs] = useState<ContextRef[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [drillWorkspaceId, setDrillWorkspaceId] = useState<string | null>(null);

  // Pre-check deep (Slice 7.0): saat `/deep` aktif, cek cap bulanan deep research →
  // notice ramah sebelum kirim. Gerbang OTORITATIF tetap `propose_research_plan`.
  const deepActive =
    (commands[0]?.id ?? matchPromptCommandInContent(value)?.id) === DEEP_COMMAND_ID;
  const deepStatus = useSendStatus("deep_research", deepActive);
  const deepNotice: ComposerNotice | null =
    deepActive && deepStatus.data && !deepStatus.data.canSend
      ? {
          message:
            deepStatus.data.reason === "subscription_required"
              ? "Deep Research butuh paket yang sesuai. Tingkatkan paket untuk melanjutkan."
              : "Kuota Deep Research bulan ini sudah habis. Tingkatkan paket atau tunggu reset.",
        }
      : null;

  // Block normal_chat (prop) menang atas notice deep (informasional).
  const shownNotice = notice ?? deepNotice;
  const secondsLeft = useSecondsLeft(shownNotice?.retryAt);

  // Retry (Slice 6.8): turn gagal → kembalikan draft terakhir ke editor (resend = turn baru).
  // Derivasi saat render (pola "adjust state when a prop changes", bukan effect) — `seenDraft`
  // mencegah loop & menghormati edit user setelah restore.
  const [seenDraft, setSeenDraft] = useState<string | null>(null);
  if (errorDraft) {
    if (errorDraft !== seenDraft) {
      setSeenDraft(errorDraft);
      setValue(errorDraft);
    }
  } else if (seenDraft !== null) {
    // Turn baru dimulai (error hilang) → reset supaya retry teks yang sama bisa restore lagi.
    setSeenDraft(null);
  }

  const agentSelection = useComposerAgentSelection();
  const hydrate = useHydrateContext();

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

  const hasText = value.trim().length > 0;
  const canSend = (hasText || attachments.length > 0) && !busy && !disabled && !hydrate.isPending;

  async function submit() {
    if (!canSend) return;

    const parts: string[] = [];
    let displayText: string;
    if (hasText) {
      const r = resolveCommandDispatch(value, commands[0]?.id);
      if (!r.displayText) return;
      displayText = r.displayText;
      if (r.dispatchPrompt !== r.displayText) parts.push(r.dispatchPrompt);
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

    setValue("");
    setCommands([]);
    setContextRefs([]);
    setAttachments([]);
    setDrillWorkspaceId(null);
    onSend({
      text: displayText,
      clientContext: parts.length > 0 ? parts : undefined,
      agentKind: agentSelection.agentKind,
    });
  }

  return (
    // Bukan <form>: submit dipicu tombol + Enter (TokenizedPromptInput.onSubmit),
    // jadi tak perlu form/preventDefault (react-doctor no-prevent-default).
    // Escape (Slice 6.8): batalkan turn berjalan. Bila palette terbuka, handler-nya
    // sudah `stopPropagation` Escape (tutup palette) → tak sampai ke sini.
    <div
      className="flex flex-col gap-2 rounded-2xl border bg-background p-2"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented && busy && onStop) onStop();
      }}
    >
      {shownNotice ? (
        <p className="px-2 pt-1 text-amber-600 text-xs dark:text-amber-500">
          {shownNotice.message}
          {shownNotice.retryAt && secondsLeft > 0 ? ` (${secondsLeft} detik)` : null}
        </p>
      ) : null}
      <div className="px-2 pt-1">
        <TokenizedPromptInput
          value={value}
          onValueChange={setValue}
          onCommandsChange={setCommands}
          onSubmit={() => void submit()}
          disabled={disabled}
          maxLength={MAX_LENGTH}
          placeholder={placeholder}
          pinnedContextRefs={contextRefs}
          onContextRefsChange={setContextRefs}
          contextWorkspaces={contextWorkspaces}
          ambientWorkspaceId={ambientWorkspaceId}
          workspaceItems={workspaceItems}
          workspaceItemsLoading={itemsQuery.isLoading}
          onRequestWorkspaceItems={setDrillWorkspaceId}
        />
      </div>
      <ComposerAttachments
        threadId={threadId}
        attachments={attachments}
        onAdd={(a) => setAttachments((prev) => [...prev, a])}
        onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.artifactId !== id))}
        disabled={disabled}
      />
      <div className="flex items-center justify-between gap-2">
        <AgentSelector
          agentKind={agentSelection.agentKind}
          setAgentKind={agentSelection.setAgentKind}
          canUsePro={agentSelection.canUsePro}
          onUpgrade={agentSelection.handleUpgrade}
          disabled={disabled}
        />
        {busy && onStop ? (
          <Button type="button" size="icon" variant="outline" onClick={onStop} aria-label="Hentikan">
            <SquareIcon />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            disabled={!canSend}
            onClick={() => void submit()}
            aria-label="Kirim"
          >
            <ArrowUpIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
