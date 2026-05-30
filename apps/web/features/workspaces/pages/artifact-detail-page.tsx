"use client";

import { Loader2Icon } from "lucide-react";
import { api } from "@aqsha/convex/api";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from "react";
import { toArtifactId, type ArtifactId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexActionQueryWithKey } from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { useArtifactDetailData } from "../api/use-workspaces-data";
import { ArtifactDetailHeader } from "../components/artifact-detail-header";
import {
  ArtifactLoading,
  ArtifactMissing,
  TypedArtifactDetail,
  UrlArtifactDetail,
  type ArtifactRenderPayload,
  type PaperExtractionStatus,
} from "../components/artifact-render-panels";
import { BlockNoteEditorLoader } from "../components/blocknote-editor-loader";
import type { DocumentEditorContent } from "../components/blocknote-document-editor";
import { NameDialog } from "../components/workspace-dialogs";
import { WorkspaceShell } from "../components/workspace-shell";
import {
  autosaveReducer,
  type AutosaveState,
} from "../utils/artifact-editor-model";

const initialAutosaveState: AutosaveState = {
  status: "idle",
  lastSavedJson: "",
  pendingJson: "",
  error: null,
};

export function ArtifactDetailPage({
  workspaceId,
  artifactId,
}: {
  workspaceId: string;
  artifactId: string;
}) {
  const data = useArtifactDetailData(artifactId);

  const detail = data.artifact;
  const renderPayloadVersionKey = detail
    ? [
        artifactId,
        detail.artifact.updatedAt,
        detail.content?.updatedAt ?? "no-content",
        detail.url?.updatedAt ?? "no-url",
      ].join(":")
    : null;
  const renderPayloadQuery = useConvexActionQueryWithKey(
    api.artifacts.getRenderPayload,
    ["artifactRenderPayload", artifactId, renderPayloadVersionKey],
    renderPayloadVersionKey
      ? { artifactId: toArtifactId(artifactId) }
      : "skip",
  );

  const activeRenderPayload = (renderPayloadQuery.data ?? null) as ArtifactRenderPayload | null;
  const activeContentError = renderPayloadQuery.error
    ? readableConvexErrorMessage(renderPayloadQuery.error, "Content gagal dimuat.")
    : null;
  const workspaceMismatch =
    detail?.artifact.workspaceId && detail.artifact.workspaceId !== workspaceId;
  const workspaceName =
    data.workspaces.find((workspace) => workspace._id === workspaceId)?.name ?? "Workspace";
  const [documentSaveState, setDocumentSaveState] = useState<AutosaveState>(initialAutosaveState);
  const [renameOpen, setRenameOpen] = useState(false);

  return (
    <WorkspaceShell
      viewer={data.viewer}
      workspaces={data.workspaces}
      selectedWorkspaceId={workspaceId}
      threads={data.threads}
      createWorkspace={data.createWorkspace}
      removeThread={data.removeThread}
    >
      <main className="grid h-svh min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-background">
        {data.isLoading ? (
          <ArtifactLoading />
        ) : !detail || workspaceMismatch ? (
          <ArtifactMissing />
        ) : (
          <>
            <ArtifactDetailHeader
              workspaceId={workspaceId}
              workspaceName={workspaceName}
              artifactTitle={detail.artifact.title}
              onRename={() => setRenameOpen(true)}
              trailing={
                detail.artifact.artifactType === "markdown"
                  ? <SaveStatus state={documentSaveState} />
                  : null
              }
            />
            <section className={cn("h-full min-h-0 overflow-y-auto overflow-x-hidden px-5 pb-0 sm:px-7")}>
              {activeContentError ? (
                <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
                  {activeContentError}
                </p>
              ) : !activeRenderPayload ? (
                <ArtifactLoading />
              ) : activeRenderPayload.artifactType === "url" ? (
                <UrlArtifactDetail
                  artifactId={artifactId}
                  url={activeRenderPayload}
                  retryUrlExtraction={data.retryUrlExtraction}
                />
              ) : activeRenderPayload.artifactType === "markdown" ? (
                <DocumentArtifactDetail
                  key={artifactId}
                  artifactId={artifactId}
                  initialBlocksJson={activeRenderPayload.blocksJson}
                  initialMarkdown={activeRenderPayload.markdown}
                  updateDocument={data.updateDocument}
                  onSaveStateChange={setDocumentSaveState}
                />
              ) : (
                <TypedArtifactDetail
                  payload={activeRenderPayload}
                  title={detail.artifact.title}
                  paperExtraction={data.paperExtraction as PaperExtractionStatus}
                  retryGrobidExtraction={data.retryGrobidExtraction}
                  artifactId={artifactId}
                />
              )}
            </section>
            <NameDialog
              open={renameOpen}
              title="Rename artifact"
              description="Update nama artifact yang tampil di workspace ini."
              submitLabel="Simpan"
              initialName={detail.artifact.title}
              onOpenChange={setRenameOpen}
              onSubmit={async ({ name }) => {
                await data.renameArtifact({
                  artifactId: toArtifactId(artifactId),
                  title: name,
                });
              }}
            />
          </>
        )}
      </main>
    </WorkspaceShell>
  );
}

function DocumentArtifactDetail({
  artifactId,
  initialBlocksJson,
  initialMarkdown,
  updateDocument,
  onSaveStateChange,
}: {
  artifactId: string;
  initialBlocksJson: string;
  initialMarkdown: string;
  updateDocument: (args: {
    artifactId: ArtifactId;
    blocksJson: string;
    markdown: string;
    plainText: string;
  }) => Promise<unknown>;
  onSaveStateChange: (state: AutosaveState) => void;
}) {
  const latestContent = useRef<DocumentEditorContent | null>(null);
  const lastSavedJsonRef = useRef(initialBlocksJson);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const [state, dispatch] = useReducer(autosaveReducer, {
    ...initialAutosaveState,
    lastSavedJson: initialBlocksJson,
    pendingJson: initialBlocksJson,
  });

  useEffect(() => {
    onSaveStateChange(state);
  }, [onSaveStateChange, state]);

  useEffect(() => {
    if (state.status !== "dirty") return;
    const timeout = window.setTimeout(() => {
      void saveLatestDocumentContent({
        artifactId,
        latestContent,
        lastSavedJsonRef,
        saveInFlightRef,
        queuedSaveRef,
        dispatch,
        updateDocument,
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [artifactId, state.pendingJson, state.status, updateDocument]);

  return (
    <div className="grid w-full gap-3">
      <BlockNoteEditorLoader
        initialBlocksJson={initialBlocksJson}
        initialMarkdown={initialMarkdown}
        onContentChange={(content) => {
          latestContent.current = content;
          dispatch({ type: "changed", json: content.blocksJson });
        }}
      />
    </div>
  );
}

type AutosaveDispatch = Dispatch<Parameters<typeof autosaveReducer>[1]>;

async function saveLatestDocumentContent({
  artifactId,
  latestContent,
  lastSavedJsonRef,
  saveInFlightRef,
  queuedSaveRef,
  dispatch,
  updateDocument,
}: {
  artifactId: string;
  latestContent: RefObject<DocumentEditorContent | null>;
  lastSavedJsonRef: RefObject<string>;
  saveInFlightRef: RefObject<boolean>;
  queuedSaveRef: RefObject<boolean>;
  dispatch: AutosaveDispatch;
  updateDocument: (args: {
    artifactId: ArtifactId;
    blocksJson: string;
    markdown: string;
    plainText: string;
  }) => Promise<unknown>;
}) {
  const content = latestContent.current;
  if (!content) return;

  if (content.blocksJson === lastSavedJsonRef.current) {
    dispatch({ type: "changed", json: content.blocksJson });
    return;
  }

  if (saveInFlightRef.current) {
    queuedSaveRef.current = true;
    return;
  }

  saveInFlightRef.current = true;
  dispatch({ type: "saving" });
  const snapshot = content;

  try {
    await updateDocument({
      artifactId: toArtifactId(artifactId),
      blocksJson: snapshot.blocksJson,
      markdown: snapshot.markdown,
      plainText: snapshot.plainText,
    });
    lastSavedJsonRef.current = snapshot.blocksJson;
    dispatch({ type: "saved", json: snapshot.blocksJson });
  } catch (error: unknown) {
    dispatch({
      type: "failed",
      message: readableConvexErrorMessage(error, "Autosave gagal."),
    });
  } finally {
    saveInFlightRef.current = false;
    if (queuedSaveRef.current) {
      queuedSaveRef.current = false;
      await saveLatestDocumentContent({
        artifactId,
        latestContent,
        lastSavedJsonRef,
        saveInFlightRef,
        queuedSaveRef,
        dispatch,
        updateDocument,
      });
    }
  }
}

function SaveStatus({ state }: { state: AutosaveState }) {
  if (state.status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Saving
      </span>
    );
  }
  if (state.status === "failed") {
    return (
      <span className="text-[12px] font-medium text-destructive">
        Failed{state.error ? ` / ${state.error}` : ""}
      </span>
    );
  }
  if (state.status === "saved") {
    return <span className="text-[12px] font-medium text-muted-foreground">Saved</span>;
  }
  return <span className="text-[12px] font-medium text-muted-foreground">Idle</span>;
}
