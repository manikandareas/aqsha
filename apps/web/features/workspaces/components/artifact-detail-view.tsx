"use client";

import {
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  Trash2Icon,
} from "@aqsha/ui/icons";
import { api } from "@aqsha/convex/api";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { AppLoadingOverlay } from "@/components/app-loading-overlay";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toArtifactId, type ArtifactId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexActionQueryWithKey } from "@/lib/convex-query";
import { panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useArtifactDetailData } from "../api/use-workspaces-data";
import { DeleteArtifactDialog } from "./artifact-delete-dialog";
import { ArtifactDetailHeader } from "./artifact-detail-header";
import {
  ArtifactMetadataPanel,
  ArtifactMetadataPopover,
  MarkdownArtifactDetails,
  MarkdownArtifactInfo,
  PaperStatusBanner,
} from "./artifact-detail-sidebar";
import {
  ArtifactHeaderActions,
  ArtifactMissingState,
  ArtifactReadingColumn,
  type ArtifactRenderPayload,
  type PaperExtractionStatus,
} from "./artifact-render-panels";
import { BlockNoteEditorLoader } from "./blocknote-editor-loader";
import type { DocumentEditorContent } from "./blocknote-document-editor";
import { DocumentTitleEditor } from "./document-title-editor";
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

export type ArtifactDetailVariant = "page" | "panel";

/**
 * The artifact reader, shared by the full route page (`variant="page"`) and the
 * thread-detail artifact side panel (`variant="panel"`, answer-stream redesign
 * Fase 4). The data flow (`api.artifacts.get` + `getRenderPayload` re-fetched on
 * `updatedAt`, so the panel refreshes as the agent finishes writing) and the body
 * (loading / missing / error / markdown editor / reader) are identical; only the
 * chrome differs — the page keeps the sticky workspace breadcrumb, the panel uses
 * a framed surface with a back-to-library + close toolbar and derives the
 * workspace from the loaded artifact.
 */
export function ArtifactDetailView({
  artifactId,
  workspaceId: workspaceIdProp,
  variant,
  onClose,
}: {
  artifactId: string;
  /** Required for the page route; the panel derives it from the loaded artifact. */
  workspaceId?: string;
  variant: ArtifactDetailVariant;
  /** Panel only: close the side panel. */
  onClose?: () => void;
}) {
  const data = useArtifactDetailData(artifactId);
  const router = useRouter();

  const detail = data.artifact;
  const detailIsMarkdown = detail?.artifact.artifactType === "markdown";
  const resolvedWorkspaceId = workspaceIdProp ?? detail?.artifact.workspaceId ?? "";
  // For markdown on the PAGE the render payload is only the initial seed: once
  // loaded, the BlockNote editor owns the content and autosave pushes to Convex.
  // Keeping the key stable per-artifact stops our own saves (which bump
  // content.updatedAt) from churning the query key, which would otherwise blank
  // the payload and remount the editor on every keystroke-batch. The PANEL is a
  // read-only viewer (no editor → no autosave churn), so it CAN track updatedAt —
  // and must, so the agent re-writing a markdown doc refreshes the open panel
  // (plan §7 "panel ikut update saat agen selesai menulis"). Papers/URLs always
  // track updatedAt (extraction retries + agent writes refresh the reader).
  const markdownKey =
    variant === "panel"
      ? `${artifactId}:markdown:${detail?.artifact.updatedAt ?? 0}:${
          detail?.content?.updatedAt ?? "no-content"
        }`
      : `${artifactId}:markdown`;
  const renderPayloadVersionKey = !detail
    ? null
    : detailIsMarkdown
      ? markdownKey
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
  // The page route guards against a workspace/artifact mismatch in the URL; the
  // panel always shows the artifact's own workspace, so there is nothing to
  // mismatch against.
  const workspaceMismatch =
    variant === "page" &&
    Boolean(detail?.artifact.workspaceId) &&
    detail!.artifact.workspaceId !== workspaceIdProp;
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
    (workspace) => workspace._id === resolvedWorkspaceId,
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

  const renameArtifact = (name: string) =>
    data.renameArtifact({ artifactId: toArtifactId(artifactId), title: name });

  // Side-panel "Info" content (same metadata the popover shows on the page),
  // surfaced from the panel's More menu instead of its own header trigger.
  const infoContent =
    ready && detail && activeRenderPayload ? (
      activeRenderPayload.artifactType === "markdown" ? (
        <MarkdownArtifactInfo artifact={detail.artifact} />
      ) : (
        <ArtifactMetadataPanel
          artifact={detail.artifact}
          payload={activeRenderPayload}
          title={detail.artifact.title}
          paperExtraction={data.paperExtraction as PaperExtractionStatus}
          artifactId={artifactId}
          retryGrobidExtraction={data.retryGrobidExtraction}
          retryUrlExtraction={data.retryUrlExtraction}
        />
      )
    ) : null;

  // The side panel collapses every action into one More menu (Info + Delete),
  // sitting next to the close toggle. The full page keeps its richer `trailing`.
  const panelActions =
    ready && detail && infoContent ? (
      <ArtifactPanelActions
        infoContent={infoContent}
        onDelete={() => setDeleteOpen(true)}
      />
    ) : null;

  const trailing =
    ready && detail ? (
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
    ) : null;

  const header =
    ready && detail ? (
      variant === "page" ? (
        <ArtifactDetailHeader
          artifactTitle={detail.artifact.title}
          workspaceId={resolvedWorkspaceId}
          workspaceName={workspaceName}
          onRenameArtifact={renameArtifact}
          trailing={trailing}
        />
      ) : (
        <ArtifactPanelToolbar onClose={onClose} trailing={panelActions} />
      )
    ) : variant === "panel" ? (
      <ArtifactPanelToolbar onClose={onClose} />
    ) : null;

  const body = (
    <div className={isMarkdown ? singleColumnGridClass : readerColumnClass}>
      {data.isLoading ? (
        <AppLoadingOverlay variant="absolute" />
      ) : !ready || !detail ? (
        <ArtifactMissingState workspaceId={resolvedWorkspaceId} />
      ) : activeContentError ? (
        <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
          {activeContentError}
        </p>
      ) : !activeRenderPayload ? (
        <AppLoadingOverlay variant="absolute" />
      ) : activeRenderPayload.artifactType === "markdown" ? (
        <div className="mx-auto w-full max-w-[820px]">
          {variant === "panel" ? (
            // The side panel is a read-only viewer: render the markdown as prose
            // (keyed on updatedAt above, so the agent re-writing the doc refreshes
            // it) instead of the editable BlockNote editor — editing lives on the
            // full route.
            <MessageResponse className="aqsha-prose aqsha-prose-message min-w-0">
              {activeRenderPayload.markdown}
            </MessageResponse>
          ) : (
            <DocumentArtifactDetail
              key={artifactId}
              artifactId={artifactId}
              initialTitle={detail.artifact.title}
              onRenameTitle={renameArtifact}
              initialBlocksJson={activeRenderPayload.blocksJson}
              initialMarkdown={activeRenderPayload.markdown}
              updateDocument={data.updateDocument}
              saveState={documentSaveState}
              dispatchSaveState={dispatchDocumentSave}
            />
          )}
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
  );

  const deleteDialog =
    ready && detail ? (
      <DeleteArtifactDialog
        open={deleteOpen}
        title={detail.artifact.title}
        onOpenChange={setDeleteOpen}
        onConfirm={async () => {
          await data.removeArtifact({ artifactId: toArtifactId(artifactId) });
          if (variant === "panel") {
            onClose?.();
          } else {
            router.push(`/app/workspaces/${resolvedWorkspaceId}`);
          }
        }}
      />
    ) : null;

  if (variant === "panel") {
    // The framed surface comes from the side-panel slot (ResponsiveSidePanel →
    // SidebarInset / Sidebar), so this fills it without re-framing (mirrors the
    // workspace-library panel content).
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        {header}
        <div className="relative min-h-0 flex-1 overflow-y-auto">{body}</div>
        {deleteDialog}
      </div>
    );
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      {header}
      {body}
      {deleteDialog}
    </main>
  );
}

function ArtifactPanelToolbar({
  onClose,
  trailing,
}: {
  onClose?: () => void;
  trailing?: ReactNode;
}) {
  // Borderless action bar matching the workspace panel header padding: no back
  // arrow, no title — just the More menu (`trailing`) and the close toggle,
  // which mirrors the workspace panel's close affordance.
  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-end gap-0.5 bg-background",
        panelHeaderPaddingClass,
      )}
    >
      {trailing}
      {onClose ? (
        <Button
          type="button"
          variant="ghost"
          className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="Tutup panel"
        >
          <PanelLeftIcon className="size-3.5 rotate-180" />
        </Button>
      ) : null}
    </header>
  );
}

/**
 * Side-panel header actions: a single More popover next to the close toggle.
 *
 * One overlay, two views. The "menu" view lists Info + Delete; choosing Info
 * swaps the SAME popover to the metadata "info" view (the panel the page header
 * shows in its own popover). This deliberately avoids nesting a Popover inside a
 * DropdownMenu — two dismissable layers sharing an anchor fight each other (the
 * menu closing dismisses the just-opened popover → flicker), which is the bug we
 * hit before. A single controlled surface sidesteps that entirely.
 */
function ArtifactPanelActions({
  infoContent,
  onDelete,
}: {
  infoContent: ReactNode;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "info">("menu");

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Always reopen on the menu view, never stuck on a stale info panel.
    if (!next) setView("menu");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Tindakan lainnya"
        >
          <MoreHorizontalIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          view === "info"
            ? "max-h-[72svh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-4"
            : "w-44 p-1",
        )}
      >
        {view === "menu" ? (
          <div className="grid gap-0.5">
            <button
              type="button"
              onClick={() => setView("info")}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <InfoIcon className="size-4 text-muted-foreground" />
              Info
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
            >
              <Trash2Icon className="size-4" />
              Delete
            </button>
          </div>
        ) : (
          infoContent
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Thread-detail artifact side panel (answer-stream redesign Fase 4 §7). */
export function ArtifactDetailPanel({
  artifactId,
  onClose,
}: {
  artifactId: string;
  onClose?: () => void;
}) {
  return (
    <ArtifactDetailView artifactId={artifactId} variant="panel" onClose={onClose} />
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
