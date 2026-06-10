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
import { AppLoadingOverlay } from "@/components/app-loading-overlay";
import { toArtifactId, type ArtifactId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexActionQueryWithKey } from "@/lib/convex-query";
import { useArtifactDetailData } from "../api/use-workspaces-data";
import { DeleteArtifactDialog } from "../components/artifact-delete-dialog";
import { ArtifactDetailHeader } from "../components/artifact-detail-header";
import {
  ArtifactMetadataPopover,
  MarkdownArtifactDetails,
  PaperStatusBanner,
} from "../components/artifact-detail-sidebar";
import {
  ArtifactHeaderActions,
  ArtifactMissingState,
  ArtifactReadingColumn,
  type ArtifactRenderPayload,
  type PaperExtractionStatus,
} from "../components/artifact-render-panels";
import { BlockNoteEditorLoader } from "../components/blocknote-editor-loader";
import type { DocumentEditorContent } from "../components/blocknote-document-editor";
import { DocumentTitleEditor } from "../components/document-title-editor";
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

const readerColumnClass =
  "mx-auto w-full max-w-[940px] px-4 pb-16 pt-2 sm:px-6";
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
  const detailIsMarkdown = detail?.artifact.artifactType === "markdown";
  // For markdown the render payload is only the initial seed: once loaded, the
  // BlockNote editor owns the content and autosave pushes to Convex. Keeping the
  // key stable per-artifact stops our own saves (which bump content.updatedAt)
  // from churning the query key, which would otherwise blank the payload and
  // remount the editor on every keystroke-batch. Papers/URLs still track
  // updatedAt so extraction retries refresh the reader.
  const renderPayloadVersionKey = !detail
    ? null
    : detailIsMarkdown
      ? `${artifactId}:markdown`
      : [
          artifactId,
          detail.artifact.updatedAt,
          detail.content?.updatedAt ?? "no-content",
          detail.url?.updatedAt ?? "no-url",
        ].join(":");
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

  // Seed autosave state once per artifact, when its content first becomes
  // available. Re-seeding on every payload change would let a DB round-trip
  // clobber in-flight autosave state (dropping edits queued during a save).
  const initializedArtifactRef = useRef<string | null>(null);
  useEffect(() => {
    if (markdownBlocksJson === null) return;
    if (initializedArtifactRef.current === artifactId) return;
    initializedArtifactRef.current = artifactId;
    dispatchDocumentSave({ type: "reset", json: markdownBlocksJson });
  }, [artifactId, markdownBlocksJson]);

  const ready = Boolean(detail) && !workspaceMismatch;
  const isMarkdown = detailIsMarkdown;
  const workspaceName = data.workspaces.find(
    (workspace) => workspace._id === workspaceId,
  )?.name;

  const headerActions =
    ready && detail && activeRenderPayload ? (
      <ArtifactHeaderActions
        payload={activeRenderPayload}
        onDelete={() => setDeleteOpen(true)}
      />
    ) : null;

  const metadataPopover =
    ready && detail && activeRenderPayload && activeRenderPayload.artifactType !== "markdown" ? (
      <ArtifactMetadataPopover
        artifact={detail.artifact}
        payload={activeRenderPayload}
        title={detail.artifact.title}
        paperExtraction={data.paperExtraction as PaperExtractionStatus}
        artifactId={artifactId}
        retryGrobidExtraction={data.retryGrobidExtraction}
        retryUrlExtraction={data.retryUrlExtraction}
      />
    ) : null;

  return (
    <main className="min-h-svh bg-background text-foreground">
        {ready && detail ? (
          <ArtifactDetailHeader
            artifactTitle={detail.artifact.title}
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            onRenameArtifact={(name) =>
              data.renameArtifact({ artifactId: toArtifactId(artifactId), title: name })
            }
            trailing={
              isMarkdown ? (
                <div className="flex items-center gap-1">
                  <SaveStatus state={documentSaveState} />
                  <MarkdownArtifactDetails artifact={detail.artifact} />
                  {headerActions}
                </div>
              ) : metadataPopover || headerActions ? (
                <div className="flex items-center gap-1">
                  {metadataPopover}
                  {headerActions}
                </div>
              ) : null
            }
          />
        ) : null}

        <div className={isMarkdown ? singleColumnGridClass : readerColumnClass}>
          {data.isLoading ? (
            <AppLoadingOverlay variant="absolute" />
          ) : !ready || !detail ? (
            <ArtifactMissingState workspaceId={workspaceId} />
          ) : activeContentError ? (
            <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
              {activeContentError}
            </p>
          ) : !activeRenderPayload ? (
            <AppLoadingOverlay variant="absolute" />
          ) : activeRenderPayload.artifactType === "markdown" ? (
            <div className="mx-auto w-full max-w-[820px]">
              <DocumentArtifactDetail
                key={artifactId}
                artifactId={artifactId}
                initialTitle={detail.artifact.title}
                onRenameTitle={(title) =>
                  data.renameArtifact({ artifactId: toArtifactId(artifactId), title })
                }
                initialBlocksJson={activeRenderPayload.blocksJson}
                initialMarkdown={activeRenderPayload.markdown}
                updateDocument={data.updateDocument}
                saveState={documentSaveState}
                dispatchSaveState={dispatchDocumentSave}
              />
            </div>
          ) : (
            <section className="min-w-0 space-y-5">
              <PaperStatusBanner
                payload={activeRenderPayload}
                paperExtraction={data.paperExtraction as PaperExtractionStatus}
                artifactId={artifactId}
                retryGrobidExtraction={data.retryGrobidExtraction}
                retryUrlExtraction={data.retryUrlExtraction}
              />
              <ArtifactReadingColumn
                payload={activeRenderPayload}
                title={detail.artifact.title}
              />
            </section>
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
  );
}

function DocumentArtifactDetail({
  artifactId,
  initialTitle,
  onRenameTitle,
  initialBlocksJson,
  initialMarkdown,
  updateDocument,
  saveState,
  dispatchSaveState,
}: {
  artifactId: string;
  initialTitle: string;
  onRenameTitle: (title: string) => Promise<unknown>;
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
    <div className="grid w-full gap-1">
      <DocumentTitleEditor initialTitle={initialTitle} onRename={onRenameTitle} />
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
