"use client";

// Shell halaman baca artifact + panel chat Astra (DetailSplitLayout + WorkspaceChatSidePanel).
// Artifact yang sedang dibuka disematkan otomatis sebagai token `@Workspace:Judul` di composer
// (lewat ComposerMentionsProvider `ambientContextRefs`). Toggle "Chat" hidup di header artifact.
// Thread baru tetap difile di bawah workspace ini (WorkspaceChatSidePanel).

import { buildPaperMentionLabel, type ContextRef, messagePreview } from "@aqsha/chat-core";
import { useMemo, useState } from "react";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { ComposerMentionsProvider } from "@/features/thread-experience/components/composer-context-mentions";
import {
  useArtifactDetailData,
  useWorkspaceDetailData,
} from "@/features/workspaces/api/use-workspaces-data";
import { ArtifactDetailView } from "./artifact-detail-view";
import { WorkspaceChatSidePanel } from "./workspace-chat-side-panel";

export function ArtifactReaderPageShell({
  workspaceId,
  artifactId,
}: {
  workspaceId: string;
  artifactId: string;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const workspaceData = useWorkspaceDetailData(workspaceId);
  const artifactData = useArtifactDetailData(artifactId);
  const workspaceName = workspaceData.workspace?.name ?? "Workspace";
  const artifactTitle = artifactData.artifact?.artifact.title;

  const ambientContextRefs = useMemo<ContextRef[]>(
    () =>
      artifactTitle
        ? [
            {
              kind: "paper",
              workspaceId,
              artifactId,
              label: buildPaperMentionLabel(
                messagePreview(workspaceName, 16),
                messagePreview(artifactTitle, 22),
              ),
            },
          ]
        : [],
    [workspaceId, artifactId, workspaceName, artifactTitle],
  );

  const handleThreadChange = (next: string | null) => {
    setThreadId(next);
    if (next !== null) setChatOpen(true);
  };

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <ComposerMentionsProvider
        threadId={threadId ?? undefined}
        ambientWorkspaceId={workspaceId}
        ambientContextRefs={ambientContextRefs}
      >
        <DetailSplitLayout
          sideOpen={chatOpen}
          onSideOpenChange={setChatOpen}
          main={
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ArtifactDetailView
                artifactId={artifactId}
                workspaceId={workspaceId}
                variant="page"
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((open) => !open)}
              />
            </div>
          }
          side={
            <ResponsiveSidePanel open={chatOpen}>
              <WorkspaceChatSidePanel
                workspaceId={workspaceId}
                activeThreadId={threadId}
                onActiveThreadIdChange={handleThreadChange}
                threads={workspaceData.workspaceThreads}
                rateStatus={workspaceData.rateStatus}
              />
            </ResponsiveSidePanel>
          }
        />
      </ComposerMentionsProvider>
    </main>
  );
}
