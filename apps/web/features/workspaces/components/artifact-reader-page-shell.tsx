"use client";

// Shell halaman baca artifact + panel chat Astra (DetailSplitLayout + WorkspaceChatSidePanel).
// Artifact yang sedang dibuka disematkan otomatis sebagai token `@Workspace:Judul` di composer
// (lewat ComposerMentionsProvider `ambientContextRefs`). Toggle "Chat" hidup di header artifact.
// Thread baru tetap difile di bawah workspace ini (WorkspaceChatSidePanel).

import {
  buildPaperMentionLabel,
  buildSelectionMentionLabel,
  type ContextRef,
} from "@aqsha/chat-core";
import { useMemo, useState } from "react";
import type { EditorSelection } from "./blocknote-document-editor";
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
  // Pilihan blok editor ("Tanya Astra") — disematkan sebagai token konteks halaman bersama pill paper.
  // Disimpan BER-SCOPE `artifactId`: shell ini TIDAK di-remount per artifact (route dinamis, tanpa
  // `key`), jadi pilihan diturunkan hanya saat masih cocok dengan artifact aktif — pilihan dari
  // artifact lama otomatis terabaikan saat pindah (tak bocor ke composer artifact baru), tanpa effect.
  const [pinnedSelection, setPinnedSelection] = useState<{
    artifactId: string;
    ref: ContextRef;
  } | null>(null);
  const selectionRef = pinnedSelection?.artifactId === artifactId ? pinnedSelection.ref : null;

  const workspaceData = useWorkspaceDetailData(workspaceId);
  const artifactData = useArtifactDetailData(artifactId);
  const workspaceName = workspaceData.workspace?.name ?? "Workspace";
  const artifactTitle = artifactData.artifact?.artifact.title;

  const ambientContextRefs = useMemo<ContextRef[]>(() => {
    const refs: ContextRef[] = [];
    if (artifactTitle) {
      refs.push({
        kind: "paper",
        workspaceId,
        artifactId,
        // Label penuh — tampilan pill di-truncate CSS (token-pill), detail utuh di tooltip.
        label: buildPaperMentionLabel(workspaceName, artifactTitle),
      });
    }
    if (selectionRef) refs.push(selectionRef);
    return refs;
  }, [workspaceId, artifactId, workspaceName, artifactTitle, selectionRef]);

  const handleThreadChange = (next: string | null) => {
    setThreadId(next);
    if (next !== null) setChatOpen(true);
  };

  const handleAskAstraAboutSelection = (selection: EditorSelection) => {
    setPinnedSelection({
      artifactId,
      ref: {
        kind: "artifact-selection",
        artifactId,
        blockIds: selection.blockIds,
        excerpt: selection.excerpt,
        label: buildSelectionMentionLabel(selection.excerpt, selection.blockIds.length),
      },
    });
    setChatOpen(true);
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
                onAskAstraAboutSelection={handleAskAstraAboutSelection}
              />
            </div>
          }
          side={
            <ResponsiveSidePanel open={chatOpen}>
              <WorkspaceChatSidePanel
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
