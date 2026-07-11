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
import { CitationsPanel } from "@/features/citations/components/citations-panel";
import { useWorkspaceCitationsEnabled } from "@/features/citations/feature";
import { useWorkspacePanel } from "./workspace-panel-context";
import { WorkspaceChatSidePanel } from "./workspace-chat-side-panel";

const CHAT_ONLY_TABS: PanelTab[] = [{ key: "chat", label: "Chat" }];
const CHAT_CITATIONS_TABS: PanelTab[] = [
  { key: "chat", label: "Chat" },
  { key: "citations", label: "Sitasi" },
];

/**
 * Panel kanan workspace detail bertab `Chat · Sitasi` (menggantikan panel chat
 * tunggal). Frame + tab strip dimiliki shell ini; konten per-tab hanya menyumbang
 * toolbar kartu + body (pola `DetailPanelShell` thread shell). Mode dari
 * `WorkspacePanelProvider` (nuqs `panel`) — deep-linkable `?panel=cite`.
 *
 * Tab Sitasi digate `useWorkspaceCitationsEnabled` (flag rollout §10): saat off,
 * strip kolaps ke label "Chat" dan deep-link `?panel=cite` jatuh ke tab Chat —
 * jangan tampilkan fitur yang belum aktif untuk user ini.
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
  const citationsEnabled = useWorkspaceCitationsEnabled();
  const mode = panel.mode;
  // Flag off → paksa tab Chat meski URL membawa `?panel=cite` (deep-link stale).
  const showCitations = citationsEnabled && mode.kind === "citations";

  return (
    <SidePanelFrame
      header={
        <PanelTabsHeader
          tabs={citationsEnabled ? CHAT_CITATIONS_TABS : CHAT_ONLY_TABS}
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
