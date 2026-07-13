"use client";

import {
  PanelExpandButton,
  PanelTabsHeader,
  type PanelTab,
  SidePanelFrame,
} from "@/components/layout/side-panel-frame";
import { PanelCloseButton } from "@/features/thread-experience/components/detail-panel-chrome";
import type { ThreadSummary } from "@/features/thread-experience/components/component-types";
import type { RateStatus } from "@/features/thread-experience/types";
import { buildWorkspaceCitationMentionLabel } from "@aqsha/chat-core";
import { CitationsPanel } from "@/features/citations/components/citations-panel";
import { useComposerSelection } from "@/features/thread-experience/components/composer-context-mentions";
import { useWorkspacePanel } from "./workspace-panel-context";
import { WorkspaceChatSidePanel } from "./workspace-chat-side-panel";

const CHAT_CITATIONS_TABS: PanelTab[] = [
  { key: "chat", label: "Chat" },
  { key: "citations", label: "Sitasi" },
];

/**
 * Panel kanan workspace detail bertab `Chat · Sitasi` (menggantikan panel chat
 * tunggal). Frame + tab strip dimiliki shell ini; konten per-tab hanya menyumbang
 * toolbar kartu + body (pola `DetailPanelShell` thread shell). Mode dari
 * `WorkspacePanelProvider` (nuqs `panel`) — deep-linkable `?panel=cite`.
 */
export function WorkspaceSidePanel({
  workspaceId,
  activeThreadId,
  onActiveThreadIdChange,
  threads,
  rateStatus,
}: {
  workspaceId: string;
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
  threads: ThreadSummary[];
  rateStatus: RateStatus | undefined;
}) {
  const panel = useWorkspacePanel();
  const selection = useComposerSelection();
  const mode = panel.mode;
  const showCitations = mode.kind === "citations";

  // Fase 4 — sematkan referensi ke composer chat lalu pindah ke tab Chat agar chip terlihat.
  const addCitationToChat = (citation: { id: string; title: string }) => {
    selection.addSelectionRef({
      kind: "workspace-citation",
      workspaceId,
      citationId: citation.id,
      label: buildWorkspaceCitationMentionLabel(citation.title),
    });
    panel.openChat();
  };

  return (
    <SidePanelFrame
      header={
        <PanelTabsHeader
          tabs={CHAT_CITATIONS_TABS}
          activeKey={showCitations ? "citations" : "chat"}
          onSelect={(key) => {
            if (key === "citations") panel.openCitations();
            else panel.openChat();
          }}
          actions={
            <>
              <PanelExpandButton />
              <PanelCloseButton onClose={panel.closePanel} />
            </>
          }
        />
      }
    >
      {showCitations ? (
        <CitationsPanel
          workspaceId={workspaceId}
          citationId={mode.citationId ?? null}
          onOpenCitation={panel.openCitationDetail}
          onBackToList={panel.openCitations}
          onAddToChat={addCitationToChat}
        />
      ) : (
        <WorkspaceChatSidePanel
          activeThreadId={activeThreadId}
          onActiveThreadIdChange={onActiveThreadIdChange}
          threads={threads}
          rateStatus={rateStatus}
          chrome="content"
        />
      )}
    </SidePanelFrame>
  );
}
