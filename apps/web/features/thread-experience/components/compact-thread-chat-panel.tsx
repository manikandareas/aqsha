"use client";

import { MessageSquarePlusIcon } from "@aqsha/ui/icons";
import {
  PanelCardToolbar,
  PanelExpandButton,
  PanelHeaderBar,
  SidePanelFrame,
} from "@/components/layout/side-panel-frame";
import { PanelTitleLabel } from "@/components/panel-title-dropdown-trigger";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "@/components/ui/sidebar";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { AccessDeniedState } from "./access-denied-state";
import { ChatThreadSurface } from "./chat-thread-surface";
import { PanelCloseButton } from "./detail-panel-chrome";
import { ThreadActionsMenu } from "./thread-actions-menu";
import { ThreadRecentSwitcher } from "./thread-recent-switcher";
import type { ThreadSummary } from "./component-types";
import type { RateStatus } from "../types";

type ActivePanelThread =
  | {
      title?: string;
      workspaceId?: string;
    }
  | null
  | undefined;

export function CompactThreadChatPanel({
  activeThreadId,
  activeThread,
  threads,
  onActiveThreadIdChange,
  deleteDescription,
  onDeleteThread,
  rateStatus,
  draftContextLabel,
  seed,
}: {
  activeThreadId: string | null;
  activeThread: ActivePanelThread;
  threads: ThreadSummary[];
  onActiveThreadIdChange: (threadId: string | null) => void;
  deleteDescription: string;
  onDeleteThread: () => Promise<unknown>;
  rateStatus: RateStatus | undefined;
  draftContextLabel?: string;
  seed?: string;
}) {
  const closePanel = useCloseRightPanel();
  const headerLabel = activeThread?.title ?? "Chat baru";

  // Anatomi panel: header flush di luar kartu tinggal judul panel + toggle tutup;
  // fitur chat (switcher thread, hapus, chat baru) turun ke toolbar di dalam kartu.
  return (
    <SidePanelFrame
      header={
        <PanelHeaderBar
          title={<PanelTitleLabel>Chat</PanelTitleLabel>}
          actions={
            <>
              <PanelExpandButton />
              <PanelCloseButton onClose={closePanel} />
            </>
          }
        />
      }
    >
      <PanelCardToolbar
        title={
          <ThreadRecentSwitcher
            title={headerLabel}
            threads={threads}
            onSelectThread={onActiveThreadIdChange}
            onNewThread={() => onActiveThreadIdChange(null)}
            newLabel="Chat baru"
            emptyLabel="Belum ada thread"
          />
        }
        actions={
          <>
            {activeThreadId ? (
              <ThreadActionsMenu
                description={deleteDescription}
                onDelete={async () => {
                  await onDeleteThread();
                  onActiveThreadIdChange(null);
                }}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Chat baru"
              onClick={() => onActiveThreadIdChange(null)}
            >
              <MessageSquarePlusIcon className="size-3.5" />
            </Button>
          </>
        }
      />
      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-background p-0">
        {activeThreadId ? (
          activeThread === null ? (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto",
                panelBodyPaddingClass,
              )}
            >
              <AccessDeniedState />
            </div>
          ) : (
            <ChatThreadSurface
              threadId={activeThreadId}
              isLoading={activeThread === undefined}
              title={activeThread?.title}
              rateStatus={rateStatus}
              threads={threads}
              compact
            />
          )
        ) : (
          <ChatThreadSurface
            isLoading={false}
            rateStatus={rateStatus}
            threads={threads}
            draftContextLabel={draftContextLabel}
            seed={seed}
            compact
          />
        )}
      </SidebarContent>
    </SidePanelFrame>
  );
}
