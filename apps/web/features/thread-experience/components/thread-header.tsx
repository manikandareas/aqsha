"use client";

import { LayersIcon, PanelLeftIcon } from "@aqsha/ui/icons";
import { PanelOpenButton } from "@/components/layout/side-panel-frame";
import { PanelTitleLabel } from "@/components/panel-title-dropdown-trigger";
import { Button } from "@/components/ui/button";
import { panelHeaderBarClass } from "@/lib/panel-surface";
import type { ThreadSummary } from "./component-types";
import { ThreadActionsMenu } from "./thread-actions-menu";
import { ThreadRecentSwitcher } from "./thread-recent-switcher";

export function ThreadHeader({
  title,
  threads,
  onSelectThread,
  onCreateThread,
  showLeftTrigger,
  onToggleLeftSidebar,
  showContextToggle,
  contextPanelOpen,
  onToggleContextPanel,
  threadId,
  onDeleteThread,
}: {
  title: string;
  threads?: ThreadSummary[];
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => void;
  showLeftTrigger: boolean;
  onToggleLeftSidebar: () => void;
  showContextToggle: boolean;
  contextPanelOpen: boolean;
  onToggleContextPanel: () => void;
  threadId?: string;
  onDeleteThread?: () => Promise<void>;
}) {
  const showThreadSwitcher = Boolean(threadId && onSelectThread && onCreateThread && threads);

  return (
    <div className={panelHeaderBarClass}>
      <div className="flex min-w-0 items-center gap-1.5">
        {showLeftTrigger ? (
          <Button
            type="button"
            variant="ghost"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onToggleLeftSidebar}
            aria-label="Buka sidebar kiri"
          >
            <PanelLeftIcon className="size-3.5" />
          </Button>
        ) : null}
        {showThreadSwitcher ? (
          <ThreadRecentSwitcher
            title={title}
            threads={threads ?? []}
            onSelectThread={onSelectThread!}
            onNewThread={onCreateThread!}
            newLabel="Thread baru"
            emptyLabel="Belum ada thread"
          />
        ) : (
          <PanelTitleLabel>{title}</PanelTitleLabel>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {threadId && onDeleteThread ? (
          <ThreadActionsMenu
            description="Thread dan pesannya akan dihapus permanen."
            onDelete={onDeleteThread}
          />
        ) : null}
        {showContextToggle ? (
          // Membuka rumah panel kanan (tab Workspace · Sumber · Pratinjau).
          <PanelOpenButton
            open={contextPanelOpen}
            onOpen={onToggleContextPanel}
            icon={<LayersIcon className="size-3.5" />}
            label="Panel"
            ariaLabel="Buka panel samping"
          />
        ) : null}
      </div>
    </div>
  );
}
