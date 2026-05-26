"use client";

import {
  ExternalLinkIcon,
  Loader2Icon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useArtifactDetailData } from "../api/use-workspaces-data";
import { ArtifactDetailHeader } from "../components/artifact-detail-header";
import { BlockNoteEditorLoader } from "../components/blocknote-editor-loader";
import type { DocumentEditorContent } from "../components/blocknote-document-editor";
import { WorkspaceShell } from "../components/workspace-shell";
import {
  autosaveReducer,
  type AutosaveState,
} from "../utils/artifact-editor-model";
import { urlArtifactDisplayModel } from "../utils/url-artifact-model";

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
  const getFullContent = data.getFullContent;
  const [fullContent, setFullContent] = useState<{
    artifactId: string;
    blocksJson: string;
    markdown: string;
    plainText: string;
    readableText: string;
  } | null>(null);
  const [contentError, setContentError] = useState<{
    artifactId: string;
    message: string;
  } | null>(null);

  const loadedContentArtifactIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadedContentArtifactIdRef.current = null;
    setFullContent(null);
    setContentError(null);
  }, [artifactId]);

  useEffect(() => {
    if (!data.artifact) return;
    if (loadedContentArtifactIdRef.current === artifactId) return;

    loadedContentArtifactIdRef.current = artifactId;
    let cancelled = false;
    void getFullContent({ artifactId: artifactId as never })
      .then((content) => {
        if (!cancelled) {
          setFullContent(content ? { artifactId, ...content } : null);
          setContentError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          loadedContentArtifactIdRef.current = null;
          setContentError({
            artifactId,
            message: error instanceof Error ? error.message : "Content gagal dimuat.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, data.artifact, getFullContent]);

  const detail = data.artifact;
  const activeFullContent = fullContent?.artifactId === artifactId ? fullContent : null;
  const activeContentError = contentError?.artifactId === artifactId ? contentError.message : null;
  const workspaceMismatch =
    detail?.artifact.workspaceId && detail.artifact.workspaceId !== workspaceId;
  const workspaceName =
    data.workspaces.find((workspace) => workspace._id === workspaceId)?.name ?? "Workspace";
  const [documentSaveState, setDocumentSaveState] = useState<AutosaveState>(initialAutosaveState);

  return (
    <WorkspaceShell
      viewer={data.viewer}
      workspaces={data.workspaces}
      selectedWorkspaceId={workspaceId}
      threads={data.threads}
      createWorkspace={data.createWorkspace}
      removeThread={data.removeThread}
    >
      <main className="grid h-svh min-h-0 grid-rows-[auto_1fr] overflow-hidden">
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
              trailing={detail.document ? <SaveStatus state={documentSaveState} /> : null}
            />
            <section className={cn("min-h-0 overflow-y-auto", panelBodyPaddingClass)}>
              {activeContentError ? (
                <p className="text-[13px] font-medium text-destructive">{activeContentError}</p>
              ) : !activeFullContent ? (
                <ArtifactLoading />
              ) : detail.artifact.kind === "url" && detail.url ? (
                <UrlArtifactDetail
                  artifactId={artifactId}
                  url={detail.url}
                  readableText={activeFullContent.readableText}
                  retryUrlExtraction={data.retryUrlExtraction}
                />
              ) : detail.document ? (
                <DocumentArtifactDetail
                  key={artifactId}
                  artifactId={artifactId}
                  initialBlocksJson={activeFullContent.blocksJson}
                  initialMarkdown={activeFullContent.markdown}
                  updateDocument={data.updateDocument}
                  onSaveStateChange={setDocumentSaveState}
                />
              ) : null}
            </section>
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
    artifactId: never;
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

  const performSave = useCallback(async () => {
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
        artifactId: artifactId as never,
        blocksJson: snapshot.blocksJson,
        markdown: snapshot.markdown,
        plainText: snapshot.plainText,
      });
      lastSavedJsonRef.current = snapshot.blocksJson;
      dispatch({ type: "saved", json: snapshot.blocksJson });
    } catch (error: unknown) {
      dispatch({
        type: "failed",
        message: error instanceof Error ? error.message : "Autosave gagal.",
      });
    } finally {
      saveInFlightRef.current = false;
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        void performSave();
      }
    }
  }, [artifactId, updateDocument]);

  useEffect(() => {
    if (state.status !== "dirty") return;
    const timeout = window.setTimeout(() => {
      void performSave();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [performSave, state.pendingJson, state.status]);

  return (
    <div className="mx-auto grid max-w-5xl gap-3">
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

function UrlArtifactDetail({
  artifactId,
  url,
  readableText,
  retryUrlExtraction,
}: {
  artifactId: string;
  url: {
    originalUrl: string;
    normalizedUrl: string;
    status: "pending" | "ready" | "failed";
    title?: string;
    description?: string;
    siteName?: string;
    failureReason?: string;
  };
  readableText: string;
  retryUrlExtraction: (args: { artifactId: never }) => Promise<unknown>;
}) {
  const model = urlArtifactDisplayModel({ ...url, readableText });
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <div className="grid gap-3 border-b border-border/70 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={model.tone === "destructive" ? "destructive" : "outline"}>
            {model.label}
          </Badge>
          {url.siteName ? (
            <span className="text-[12px] font-medium text-muted-foreground">{url.siteName}</span>
          ) : null}
        </div>
        <div className="grid gap-1 text-[13px]">
          <a
            href={url.normalizedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <span className="truncate">{url.normalizedUrl}</span>
            <ExternalLinkIcon className="size-3.5 shrink-0" />
          </a>
          {url.originalUrl !== url.normalizedUrl ? (
            <span className="truncate text-muted-foreground">Original: {url.originalUrl}</span>
          ) : null}
        </div>
        {url.description ? (
          <p className="max-w-3xl text-[13px] leading-6 text-muted-foreground">
            {url.description}
          </p>
        ) : null}
        {model.canRetry ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void retryUrlExtraction({ artifactId: artifactId as never })}
            >
              <RotateCcwIcon className="size-4" />
              Retry
            </Button>
          </div>
        ) : null}
      </div>
      {url.status === "pending" ? (
        <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Extraction is running.
        </div>
      ) : url.status === "failed" ? (
        <p className="text-[13px] font-medium text-destructive">
          {url.failureReason ?? "Extraction failed."}
        </p>
      ) : (
        <article className="artifact-prose whitespace-pre-wrap rounded-[8px] border border-border bg-background p-4">
          {readableText || "No readable text was extracted."}
        </article>
      )}
    </div>
  );
}

function ArtifactLoading() {
  return (
    <div className={cn("grid gap-4", panelBodyPaddingClass)}>
      <p className="text-[12px] font-medium text-muted-foreground">Memuat artifact...</p>
      <Skeleton className="h-12 rounded-[8px]" />
      <Skeleton className="h-64 rounded-[8px]" />
    </div>
  );
}

function ArtifactMissing() {
  return (
    <div className="grid min-h-svh place-items-center px-4 text-center">
      <div className="grid gap-3">
        <h1 className="font-heading text-2xl font-semibold">Artifact tidak tersedia.</h1>
        <p className="text-[13px] font-medium text-muted-foreground">
          Artifact ini tidak ditemukan untuk workspace yang sedang dibuka.
        </p>
      </div>
    </div>
  );
}
