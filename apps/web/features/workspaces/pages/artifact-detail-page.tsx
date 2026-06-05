"use client";

import { Loader2Icon } from "@aqsha/ui/icons";
import { api } from "@aqsha/convex/api";
import { useRouter } from "next/navigation";
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
import { useArtifactDetailData } from "../api/use-workspaces-data";
import { DeleteArtifactDialog } from "../components/artifact-delete-dialog";
import { ArtifactDetailHeader } from "../components/artifact-detail-header";
import {
  ArtifactDetailSidebar,
  MarkdownArtifactDetails,
} from "../components/artifact-detail-sidebar";
import {
  ArtifactDetailSkeleton,
  ArtifactHeaderActions,
  ArtifactMissingState,
  ArtifactReadingColumn,
  type ArtifactRenderPayload,
  type PaperExtractionStatus,
} from "../components/artifact-render-panels";
import { BlockNoteEditorLoader } from "../components/blocknote-editor-loader";
import type { DocumentEditorContent } from "../components/blocknote-document-editor";
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

const twoColumnGridClass =
  "mx-auto grid w-full max-w-[1080px] gap-8 px-5 pb-12 pt-4 sm:px-8 lg:grid-cols-[minmax(0,700px)_260px] lg:gap-10 lg:px-10";
const singleColumnGridClass =
  "mx-auto w-full max-w-[1080px] px-5 pb-12 pt-4 sm:px-8 lg:px-10";

export function ArtifactDetailPage({
  workspaceId,
  artifactId,
}: {
  workspaceId: string;
  artifactId: string;
}) {
  const data = useArtifactDetailData(artifactId);
  const router = useRouter();

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
    ? readableConvexErrorMessage(renderPayloadQuery.error, "We couldn't load this content.")
    : null;
  const workspaceMismatch =
    detail?.artifact.workspaceId && detail.artifact.workspaceId !== workspaceId;
  const [documentSaveState, dispatchDocumentSave] = useReducer(autosaveReducer, initialAutosaveState);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const markdownBlocksJson =
    activeRenderPayload?.artifactType === "markdown"
      ? activeRenderPayload.blocksJson
      : null;

  useEffect(() => {
    if (markdownBlocksJson === null) return;
    dispatchDocumentSave({ type: "reset", json: markdownBlocksJson });
  }, [artifactId, markdownBlocksJson]);

  const ready = Boolean(detail) && !workspaceMismatch;
  const isMarkdown = detail?.artifact.artifactType === "markdown";

  const headerActions =
    ready && detail && activeRenderPayload ? (
      <ArtifactHeaderActions
        payload={activeRenderPayload}
        indexingStatus={detail.artifact.indexingStatus}
        indexingFailureReason={detail.artifact.indexingFailureReason}
        onDelete={() => setDeleteOpen(true)}
      />
    ) : null;

  return (
    <WorkspaceShell
      viewer={data.viewer}
      workspaces={data.workspaces}
      selectedWorkspaceId={workspaceId}
      threads={data.threads}
      createWorkspace={data.createWorkspace}
      removeThread={data.removeThread}
    >
      <main className="min-h-svh bg-background text-foreground">
        {ready && detail ? (
          <ArtifactDetailHeader
            artifactTitle={detail.artifact.title}
            onRenameArtifact={(name) =>
              data.renameArtifact({ artifactId: toArtifactId(artifactId), title: name })
            }
            trailing={
              isMarkdown || headerActions ? (
                <div className="flex items-center gap-2">
                  {isMarkdown ? <SaveStatus state={documentSaveState} /> : null}
                  {headerActions}
                </div>
              ) : null
            }
          />
        ) : null}

        <div className={isMarkdown ? singleColumnGridClass : twoColumnGridClass}>
          {data.isLoading ? (
            <ArtifactDetailSkeleton />
          ) : !ready || !detail ? (
            <ArtifactMissingState workspaceId={workspaceId} />
          ) : activeContentError ? (
            <div className="lg:col-span-2">
              <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
                {activeContentError}
              </p>
            </div>
          ) : !activeRenderPayload ? (
            <ArtifactDetailSkeleton />
          ) : activeRenderPayload.artifactType === "markdown" ? (
            <div className="mx-auto w-full max-w-[820px]">
              <div className="mb-4 flex items-center justify-end">
                <MarkdownArtifactDetails artifact={detail.artifact} />
              </div>
              <DocumentArtifactDetail
                key={artifactId}
                artifactId={artifactId}
                initialBlocksJson={activeRenderPayload.blocksJson}
                initialMarkdown={activeRenderPayload.markdown}
                updateDocument={data.updateDocument}
                saveState={documentSaveState}
                dispatchSaveState={dispatchDocumentSave}
              />
            </div>
          ) : (
            <>
              <section className="min-w-0">
                <ArtifactReadingColumn
                  payload={activeRenderPayload}
                  title={detail.artifact.title}
                  paperExtraction={data.paperExtraction as PaperExtractionStatus}
                />
              </section>
              <ArtifactDetailSidebar
                artifact={detail.artifact}
                payload={activeRenderPayload}
                title={detail.artifact.title}
                paperExtraction={data.paperExtraction as PaperExtractionStatus}
                artifactId={artifactId}
                retryGrobidExtraction={data.retryGrobidExtraction}
                retryUrlExtraction={data.retryUrlExtraction}
              />
            </>
          )}
        </div>

        {ready && detail ? (
          <DeleteArtifactDialog
            open={deleteOpen}
            title={detail.artifact.title}
            onOpenChange={setDeleteOpen}
            onConfirm={async () => {
              await data.removeArtifact({ artifactId: toArtifactId(artifactId) });
              router.push(`/app/workspaces/${workspaceId}`);
            }}
          />
        ) : null}
      </main>
    </WorkspaceShell>
  );
}

function DocumentArtifactDetail({
  artifactId,
  initialBlocksJson,
  initialMarkdown,
  updateDocument,
  saveState,
  dispatchSaveState,
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
  saveState: AutosaveState;
  dispatchSaveState: AutosaveDispatch;
}) {
  const latestContent = useRef<DocumentEditorContent | null>(null);
  const lastSavedJsonRef = useRef(initialBlocksJson);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  useEffect(() => {
    if (saveState.status !== "dirty") return;
    const timeout = window.setTimeout(() => {
      void saveLatestDocumentContent({
        artifactId,
        latestContent,
        lastSavedJsonRef,
        saveInFlightRef,
        queuedSaveRef,
        dispatch: dispatchSaveState,
        updateDocument,
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [
    artifactId,
    dispatchSaveState,
    saveState.pendingJson,
    saveState.status,
    updateDocument,
  ]);

  return (
    <div className="grid w-full gap-3">
      <BlockNoteEditorLoader
        initialBlocksJson={initialBlocksJson}
        initialMarkdown={initialMarkdown}
        onContentChange={(content) => {
          latestContent.current = content;
          dispatchSaveState({ type: "changed", json: content.blocksJson });
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
      message: readableConvexErrorMessage(error, "We couldn't save your changes."),
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
    return <span className="text-[12px] font-medium text-destructive">Couldn&apos;t save</span>;
  }
  if (state.status === "saved") {
    return <span className="text-[12px] font-medium text-muted-foreground">Saved</span>;
  }
  return null;
}
