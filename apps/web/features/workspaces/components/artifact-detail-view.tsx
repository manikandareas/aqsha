"use client";

import {
  DownloadIcon,
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  Trash2Icon,
} from "@aqsha/ui/icons";
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
import { readableApiErrorMessage } from "@/lib/api-error";
import {
  resolveArtifactDownload,
  triggerArtifactDownload,
} from "@/lib/artifact-download";
import { useArtifactRender } from "@/features/artifacts/api";
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
  type ArtifactSidebarRecord,
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

// Content-first reading measure — markdown docs, pdf pages, url/plain-text
// readers. Every "read this" surface shares it so the page rhymes top to bottom.
const proseColumnClass = "mx-auto w-full max-w-[860px] px-4 pb-16 pt-3 sm:px-6";
// Roomier column for framed embedded viewers (html/svg/diagram/data/code).
const mediaColumnClass = "mx-auto w-full max-w-[1040px] px-4 pb-16 pt-3 sm:px-6";
// Types that read as documents rather than embedded media: they get the narrow
// prose column and stay borderless/centered like the markdown reference.
const contentFirstTypes = new Set([
  "markdown",
  "plain_text",
  "url",
  "pdf",
  "docx",
]);

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
  const sidebarArtifact = detail?.artifact as ArtifactSidebarRecord | undefined;
  const detailIsMarkdown = detail?.artifact.artifactType === "markdown";
  const resolvedWorkspaceId = workspaceIdProp ?? detail?.artifact.workspaceId ?? "";
  const renderPayloadQuery = useArtifactRender(artifactId);
  const activeRenderPayload = (renderPayloadQuery.data ?? data.renderPayload ?? null) as ArtifactRenderPayload | null;
  const activeContentError = renderPayloadQuery.error
    ? readableApiErrorMessage(renderPayloadQuery.error, "We couldn't load this content.")
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
        title={detail.artifact.title}
        onDelete={() => setDeleteOpen(true)}
      />
    ) : null;

  const metadataPopover =
    ready && detail && activeRenderPayload && activeRenderPayload.artifactType !== "markdown" ? (
      <ArtifactMetadataPopover
        artifact={sidebarArtifact!}
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
          artifact={sidebarArtifact!}
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
    ready && detail && activeRenderPayload && infoContent ? (
      <ArtifactPanelActions
        payload={activeRenderPayload}
        title={detail.artifact.title}
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

  // Content-first types (incl. pdf pages) stay in the narrow prose column; framed
  // embedded viewers (html/svg/diagram/data/code) get the roomier media column.
  const bodyColumnClass =
    !activeRenderPayload || contentFirstTypes.has(activeRenderPayload.artifactType)
      ? proseColumnClass
      : mediaColumnClass;

  const body = (
    <div className={bodyColumnClass}>
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
        // Body stays content-only (extraction status + retry live in the header
        // Info popover) so every reader matches the markdown reference.
        <div className="min-w-0">
          <ArtifactReadingColumn
            payload={activeRenderPayload}
            title={detail.artifact.title}
          />
        </div>
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
 * One overlay, two views. The "menu" view lists Info + Download + Delete;
 * choosing Info swaps the SAME popover to the metadata "info" view (the panel the
 * page header shows in its own popover). This deliberately avoids nesting a
 * Popover inside a DropdownMenu — two dismissable layers sharing an anchor fight
 * each other (the menu closing dismisses the just-opened popover → flicker),
 * which is the bug we hit before. A single controlled surface sidesteps that.
 */
function ArtifactPanelActions({
  payload,
  title,
  infoContent,
  onDelete,
}: {
  payload: ArtifactRenderPayload;
  title: string;
  infoContent: ReactNode;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "info">("menu");
  const download = resolveArtifactDownload(payload, title);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Always reopen on the menu view, never stuck on a stale info panel.
    if (!next) setView("menu");
  };

  const menuItemClass =
    "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

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
              className={menuItemClass}
            >
              <InfoIcon className="size-4 text-muted-foreground" />
              Info
            </button>
            {download.kind === "url" ? (
              <a
                href={download.href}
                download={download.fileName}
                onClick={() => setOpen(false)}
                className={menuItemClass}
              >
                <DownloadIcon className="size-4 text-muted-foreground" />
                Download
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerArtifactDownload(download);
                }}
                className={menuItemClass}
              >
                <DownloadIcon className="size-4 text-muted-foreground" />
                Download
              </button>
            )}
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
      message: readableApiErrorMessage(error, "We couldn't save your changes."),
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
