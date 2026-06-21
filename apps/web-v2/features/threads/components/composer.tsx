"use client";

import {
  type ContextRef,
  type PromptCommand,
  resolveCommandDispatch,
  splitContextRefs,
} from "@aqsha/chat-core";
import { Button } from "@aqsha/ui/components/button";
import { ArrowUpIcon, SquareIcon } from "@aqsha/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useContextPickerArtifacts } from "@/features/artifacts/api";
import { useWorkspacesList } from "@/features/workspaces/api";
import { useHydrateContext } from "../api";
import {
  type ComposerAgentKind,
  AgentSelector,
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
  ambientWorkspaceId = null,
  placeholder = "Tulis pesan untuk Astra…",
}: {
  onSend: (payload: ComposerSendPayload) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  notice?: ComposerNotice | null;
  ambientWorkspaceId?: string | null;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [commands, setCommands] = useState<PromptCommand[]>([]);
  const [contextRefs, setContextRefs] = useState<ContextRef[]>([]);
  const [drillWorkspaceId, setDrillWorkspaceId] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(notice?.retryAt);

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

  const canSend = value.trim().length > 0 && !busy && !disabled && !hydrate.isPending;

  async function submit() {
    if (!canSend) return;
    const { displayText, dispatchPrompt } = resolveCommandDispatch(value, commands[0]?.id);
    if (!displayText) return;

    const parts: string[] = [];
    if (dispatchPrompt !== displayText) parts.push(dispatchPrompt);

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
    <div className="flex flex-col gap-2 rounded-2xl border bg-background p-2">
      {notice ? (
        <p className="px-2 pt-1 text-amber-600 text-xs dark:text-amber-500">
          {notice.message}
          {notice.retryAt && secondsLeft > 0 ? ` (${secondsLeft} detik)` : null}
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
