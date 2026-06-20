"use client";

import type { PartialBlock } from "@blocknote/core";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import {
  ArrowLeftIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RotateCcwIcon,
} from "@aqsha/ui/icons";
import {
  useArtifact,
  useArtifactRender,
  useRetryUrlExtraction,
  useUpdateDocument,
} from "../api";
import { type ArtifactRenderPayload, artifactTypeLabel } from "../types";

const MarkdownEditor = dynamic(() => import("./markdown-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-16 text-muted-foreground">
      <Loader2Icon className="animate-spin" />
    </div>
  ),
});

function parseBlocks(blocksJson: string): PartialBlock[] | undefined {
  if (!blocksJson) return undefined;
  try {
    const value = JSON.parse(blocksJson);
    return Array.isArray(value) ? (value as PartialBlock[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Body reader per tipe (if/return → narrowing discriminated union bersih). */
function ReaderContent({
  payload,
  title,
  saving,
  onSave,
  onRetryUrl,
  retrying,
}: {
  payload: ArtifactRenderPayload;
  title: string;
  saving: boolean;
  onSave: (data: { blocksJson: string; markdown: string; plainText: string }) => void;
  onRetryUrl: () => void;
  retrying: boolean;
}) {
  if (payload.artifactType === "markdown") {
    return (
      <MarkdownEditor initialBlocks={parseBlocks(payload.blocksJson)} saving={saving} onSave={onSave} />
    );
  }
  if (payload.artifactType === "pdf" || payload.artifactType === "docx") {
    if (payload.artifactType === "pdf") {
      return (
        <iframe src={payload.url} title={title} className="h-[80vh] w-full rounded-lg border" />
      );
    }
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Pratinjau Word tidak tersedia di browser.</p>
        <Button asChild variant="outline" className="mt-4">
          <a href={payload.url} target="_blank" rel="noreferrer">
            <DownloadIcon />
            Unduh berkas
          </a>
        </Button>
      </div>
    );
  }
  if (payload.artifactType === "url") {
    return (
      <article className="grid gap-4">
        <a
          href={payload.originalUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ExternalLinkIcon className="size-4" />
          {payload.siteName ?? payload.normalizedUrl}
        </a>
        {payload.status === "pending" ? (
          <p className="text-sm text-muted-foreground">Mengekstrak isi tautan…</p>
        ) : payload.status === "failed" ? (
          <div className="grid gap-3">
            <p className="text-sm text-destructive">
              Gagal mengekstrak: {payload.failureReason ?? "tidak diketahui"}
            </p>
            <div>
              <Button variant="outline" size="sm" disabled={retrying} onClick={onRetryUrl}>
                {retrying ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
                Coba lagi
              </Button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-lg border bg-card p-6 text-sm leading-relaxed">
            {payload.readableText || "Tidak ada teks."}
          </div>
        )}
      </article>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-lg border bg-card p-6 text-sm leading-relaxed">
      {("source" in payload ? payload.source : "") || "Kosong."}
    </pre>
  );
}

export function ArtifactReader({
  workspaceId,
  artifactId,
}: {
  workspaceId: string;
  artifactId: string;
}) {
  const detail = useArtifact(artifactId);
  const render = useArtifactRender(artifactId);
  const update = useUpdateDocument(artifactId);
  const retry = useRetryUrlExtraction(artifactId);

  if (detail.isPending) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2Icon className="animate-spin" />
      </div>
    );
  }

  const artifact = detail.data?.artifact;
  if (!artifact) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Artefak tidak ditemukan.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/app/workspaces/${workspaceId}`}>Kembali ke workspace</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href={`/app/workspaces/${workspaceId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Workspace
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <h1 className="min-w-0 truncate font-serif text-3xl">{artifact.title}</h1>
        <Badge variant="secondary">{artifactTypeLabel(artifact.artifactType)}</Badge>
      </div>

      {artifact.indexingStatus === "pending" ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          Mengindeks konten…
        </p>
      ) : artifact.indexingStatus === "failed" ? (
        <p className="mt-2 text-sm text-destructive">
          Gagal mengindeks: {artifact.indexingFailureReason ?? "tidak diketahui"}
        </p>
      ) : null}

      <div className="mt-6">
        {render.isPending ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2Icon className="animate-spin" />
          </div>
        ) : !render.data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Konten belum tersedia.</p>
        ) : (
          <ReaderContent
            payload={render.data}
            title={artifact.title}
            saving={update.isPending}
            onSave={(data) => update.mutate(data)}
            onRetryUrl={() => retry.mutate()}
            retrying={retry.isPending}
          />
        )}
      </div>
    </main>
  );
}
