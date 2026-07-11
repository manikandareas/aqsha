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
import { useWorkspacePanel } from "./workspace-panel-context";
import { workspacePanelTabOf } from "../utils/workspace-panel-model";
import { WorkspaceChatSidePanel } from "./workspace-chat-side-panel";

const TABS: PanelTab[] = [
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
  const mode = panel.mode;

  return (
    <SidePanelFrame
      header={
        <PanelTabsHeader
          tabs={TABS}
          activeKey={workspacePanelTabOf(mode)}
          onSelect={(key) => {
            if (key === "chat") panel.openChat();
            else panel.openCitations();
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
      {mode.kind === "citations" ? (
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
