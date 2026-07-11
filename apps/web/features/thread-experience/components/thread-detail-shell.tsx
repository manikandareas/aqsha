"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import {
  PanelCardToolbar,
  PanelExpandButton,
  PanelTabsHeader,
  SidePanelFrame,
  type PanelTab,
} from "@/components/layout/side-panel-frame";
import { PanelTitleDropdownTrigger } from "@/components/panel-title-dropdown-trigger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { panelBodyPaddingClass, panelCardToolbarClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import {
  useWorkspaceLibraryData,
} from "@/features/workspaces/api/use-workspaces-data";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { WorkspaceBoardToolbar } from "@/features/workspaces/components/workspace-board-toolbar";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";
import { ArtifactDetailPanel } from "@/features/workspaces/components/artifact-detail-view";
import { workspaceEmoji } from "@/features/workspaces/utils/workspace-emoji";
import { PanelCloseButton } from "./detail-panel-chrome";
import { PlanDetailPanel } from "./plan-detail-panel";
import { QuestionsDetailPanel } from "./questions-detail-panel";
import { SearchStepPanel } from "./search-step-panel";
import { SourcesListPanel } from "./sources-list-panel";
import { StatsListPanel } from "./stats-list-panel";
import { StepDetailPanel } from "./step-detail-panel";
import { useThreadExperienceData } from "../api/use-thread-experience-data";
import type { ThreadShellLayoutProps } from "./component-types";
import {
  ComposerMentionsProvider,
  usePanelContextSelection,
} from "./composer-context-mentions";
import {
  threadPanelTabOf,
  type ThreadPanelMode,
} from "../utils/thread-panel-model";
import {
  ThreadPanelProvider,
  useThreadPanel,
  useThreadPanelData,
} from "./thread-panel-context";
import { ThreadShellLayout } from "./thread-shell-layout";

export function ThreadDetailShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const {
    workspaces,
    threads,
    selectedThread,
    rateStatus,
    removeThread,
  } = useThreadExperienceData(threadId);
  const title = threadId
    ? (selectedThread?.title ?? "Thread tidak ditemukan")
    : "Thread baru";

  const handleDeleteThread = async () => {
    if (!threadId) return;
    const destination = selectedThread?.workspaceId
      ? `/app/workspaces/${selectedThread.workspaceId}`
      : "/";
    await removeThread({ threadId });
    router.replace(destination);
  };

  const workspaceNameById = new Map(workspaces.map((workspace) => [workspace._id, workspace.name]));
  const panelWorkspaceId = selectedThread?.workspaceId;
  const workspaceName = panelWorkspaceId
    ? (workspaceNameById.get(panelWorkspaceId) ?? "Workspace")
    : undefined;

  return (
    <ComposerMentionsProvider
      threadId={threadId}
      ambientWorkspaceId={selectedThread?.workspaceId ?? null}
    >
      <ThreadPanelProvider key={threadId ?? "__draft__"}>
        <ThreadDetailShellView
          threadId={threadId}
          title={title}
          threads={threads}
          selectedThread={selectedThread}
          workspaces={workspaces}
          workspaceName={workspaceName}
          rateStatus={rateStatus}
          onCreateThread={() => router.push("/app")}
          onSelectThread={(id) => router.push(`/app/threads/${id}`)}
          onDeleteThread={threadId ? handleDeleteThread : undefined}
        />
      </ThreadPanelProvider>
    </ComposerMentionsProvider>
  );
}

type ThreadDetailShellViewProps = Omit<
  ThreadShellLayoutProps,
  "rightPanelOpen" | "onRightPanelOpenChange" | "sidePanel"
> & {
  workspaces: WorkspacePickerOption[];
  workspaceName?: string;
};

// Inside `ThreadPanelProvider`: the side panel is a HOME for several panels behind one
// tab strip (Workspace · Sumber · Statistik · Pratinjau). The shell owns the single
// `SidePanelFrame` (flush tabs header + floating card); each mode contributes IN-CARD
// content only. Message-part detail modes share the Pratinjau slot — its tab appears
// while a preview is remembered and hides when the panel closes. Open/close stay in
// sync with `DetailSplitLayout` via `panel.isOpen` / `panel.setOpen` (so the mobile
// close + header toggle keep working — answer-stream redesign Fase 4 §7).
function ThreadDetailShellView({
  threadId,
  title,
  threads,
  selectedThread,
  workspaces,
  workspaceName,
  rateStatus,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: ThreadDetailShellViewProps) {
  const panel = useThreadPanel();
  const lookups = useThreadPanelData();
  const hasStats = (lookups?.stats.length ?? 0) > 0;
  const rawMode = panel?.mode ?? { kind: "closed" as const };
  // Shell home (tanpa threadId) tak punya sumber/statistik thread — keduanya tak akan pernah
  // terisi di draft shell, jadi deep-link `?panel=m`/`?panel=s` jatuh ke tab Workspace, bukan
  // panel kosong.
  const mode: ThreadPanelMode =
    !threadId && (rawMode.kind === "sources" || rawMode.kind === "stats")
      ? { kind: "context" }
      : rawMode;

  const contextContent = !threadId ? (
    <ThreadGlobalContextPanel workspaces={workspaces} />
  ) : selectedThread != null ? (
    selectedThread.workspaceId ? (
      <ThreadWorkspaceLibraryPanel
        workspaceId={selectedThread.workspaceId}
        workspaceName={workspaceName ?? "Workspace"}
      />
    ) : (
      <ThreadGlobalContextPanel workspaces={workspaces} />
    )
  ) : null;

  // In-card content per mode. Preview modes (artifact / search / step / plan /
  // questions) share the single Pratinjau slot — opening another card replaces it.
  const panelContent =
    mode.kind === "artifact" ? (
      <ArtifactDetailPanel artifactId={mode.artifactId} onClose={panel?.closePanel} />
    ) : mode.kind === "sources" ? (
      <SourcesListPanel messageId={mode.messageId} threadId={threadId} />
    ) : mode.kind === "stats" ? (
      <StatsListPanel runKey={mode.runKey} threadId={threadId} />
    ) : mode.kind === "search" ? (
      <SearchStepPanel turnId={mode.turnId} subQuestionIndex={mode.subQuestionIndex} />
    ) : mode.kind === "step" ? (
      <StepDetailPanel toolCallId={mode.toolCallId} />
    ) : mode.kind === "plan" ? (
      <PlanDetailPanel turnId={mode.turnId} />
    ) : mode.kind === "questions" ? (
      <QuestionsDetailPanel />
    ) : (
      contextContent
    );

  // The Pratinjau tab only exists while a preview is remembered (a card was clicked
  // and the panel stayed open) — decision: hide, don't disable, when empty.
  const tabs: PanelTab[] = [
    { key: "workspace", label: "Workspace" },
    // Sumber hanya relevan pada thread nyata — shell home tak pernah mengakumulasi sumber.
    ...(threadId ? [{ key: "sources", label: "Sumber" }] : []),
    // Statistik hidden-when-empty (keputusan Pratinjau); tetap tampil saat mode aktif = stats
    // (deep-link `?panel=s` pada thread tanpa hasil) supaya activeKey selalu punya tab-nya.
    ...(hasStats || mode.kind === "stats" ? [{ key: "statistics", label: "Statistik" }] : []),
    ...(panel?.previewMode ? [{ key: "preview", label: "Pratinjau" }] : []),
  ];
  const selectTab = (key: string) => {
    if (key === "workspace") panel?.openContextPanel();
    else if (key === "sources") panel?.openSourcesPanel();
    else if (key === "statistics") panel?.openStatsPanel();
    else if (key === "preview") panel?.openPreviewPanel();
  };

  const sidePanel = panelContent ? (
    <ResponsiveSidePanel open={panel?.isOpen ?? false}>
      <SidePanelFrame
        header={
          <PanelTabsHeader
            tabs={tabs}
            activeKey={threadPanelTabOf(mode)}
            onSelect={selectTab}
            actions={
              <>
                <PanelExpandButton />
                <PanelCloseButton onClose={panel?.closePanel} />
              </>
            }
          />
        }
      >
        {panelContent}
      </SidePanelFrame>
    </ResponsiveSidePanel>
  ) : undefined;

  return (
    <ThreadShellLayout
      threads={threads}
      onCreateThread={onCreateThread}
      onSelectThread={onSelectThread}
      title={title}
      threadId={threadId}
      selectedThread={selectedThread}
      rateStatus={rateStatus}
      rightPanelOpen={panel?.isOpen ?? false}
      onRightPanelOpenChange={(open) => panel?.setOpen(open)}
      onDeleteThread={onDeleteThread}
      sidePanel={sidePanel}
    />
  );
}

function ThreadWorkspaceLibraryPanel({
  workspaceId,
  workspaceName,
  titleSlot,
}: {
  workspaceId: string;
  workspaceName: string;
  titleSlot?: ReactNode;
}) {
  const router = useRouter();
  const libraryData = useWorkspaceLibraryData(workspaceId);
  const dialogState = useWorkspaceLibraryDialogState();
  const titleById = (() => {
    const map = new Map<string, string>();
    for (const artifact of libraryData.artifacts) {
      map.set(artifact._id, artifact.title);
    }
    return map;
  })();
  const contextSelection = usePanelContextSelection({
    workspaceId,
    workspaceName,
    titleById,
  });

  if (libraryData.isLoading) {
    return (
      <>
        {titleSlot ? <PanelCardToolbar title={titleSlot} /> : null}
        <div className={cn("grid gap-3", panelBodyPaddingClass)}>
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </>
    );
  }

  return (
    <WorkspaceLibrarySurface
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      titleSlot={titleSlot}
      libraryData={libraryData}
      dialogState={dialogState}
      getArtifactSelected={contextSelection.getArtifactSelected}
      onToggleArtifactContext={contextSelection.onToggleArtifactContext}
      onSetArtifactContextSelection={contextSelection.onSetArtifactContextSelection}
      onAfterArchive={() => router.push("/app/workspaces")}
      showCreateActions
      showWorkspaceSettings
      variant="panel"
    />
  );
}

type WorkspacePickerOption = {
  _id: string;
  name: string;
  emoji?: string;
};

function WorkspacePanelSwitcher({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  placeholder = "Pilih workspace",
}: {
  workspaces: WorkspacePickerOption[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  placeholder?: string;
}) {
  const selectedWorkspace = selectedWorkspaceId
    ? workspaces.find((workspace) => workspace._id === selectedWorkspaceId)
    : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PanelTitleDropdownTrigger className="font-serif text-base font-normal">
          {selectedWorkspace ? (
            <>
              <span className="shrink-0">{workspaceEmoji(selectedWorkspace.emoji)}</span>
              <span className="truncate">{selectedWorkspace.name}</span>
            </>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
        </PanelTitleDropdownTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
        {workspaces.length === 0 ? (
          <DropdownMenuItem disabled>Belum ada workspace</DropdownMenuItem>
        ) : (
          workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace._id}
              onClick={() => onSelectWorkspace(workspace._id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">{workspaceEmoji(workspace.emoji)}</span>
                <span className="truncate">{workspace.name}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThreadGlobalContextPanel({
  workspaces,
}: {
  workspaces: WorkspacePickerOption[];
}) {
  const [selectedPanelWorkspaceId, setSelectedPanelWorkspaceId] = useState<string | null>(null);
  const selectedWorkspaceName = selectedPanelWorkspaceId
    ? (workspaces.find((workspace) => workspace._id === selectedPanelWorkspaceId)?.name ?? "Workspace")
    : null;

  const workspaceSwitcher = (
    <WorkspacePanelSwitcher
      workspaces={workspaces}
      selectedWorkspaceId={selectedPanelWorkspaceId}
      onSelectWorkspace={setSelectedPanelWorkspaceId}
    />
  );

  if (selectedPanelWorkspaceId && selectedWorkspaceName) {
    return (
      <ThreadWorkspaceLibraryPanel
        workspaceId={selectedPanelWorkspaceId}
        workspaceName={selectedWorkspaceName}
        titleSlot={workspaceSwitcher}
      />
    );
  }

  // In-card content: the switcher rides the card toolbar (close lives on the tabs
  // header), the empty-state prompt fills the body below.
  return (
    <>
      <WorkspaceBoardToolbar
        barClassName={panelCardToolbarClass}
        workspaceName="Workspace"
        titleSlot={workspaceSwitcher}
        breadcrumb={[{ id: "root", label: "Root" }]}
        onNavigate={() => {}}
        onCreateFolder={() => {}}
        onCreateDocument={() => {}}
        onCreateUrl={() => {}}
        onRenameWorkspace={async () => {}}
        onUpdateWorkspaceEmoji={async () => {}}
        onArchiveWorkspace={() => {}}
        showCreateActions={false}
        showWorkspaceSettings={false}
      />
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background",
          panelBodyPaddingClass,
        )}
      >
        <p className="text-center text-[13px] font-medium text-muted-foreground">
          Silakan pilih workspace terlebih dahulu.
        </p>
      </div>
    </>
  );
}
