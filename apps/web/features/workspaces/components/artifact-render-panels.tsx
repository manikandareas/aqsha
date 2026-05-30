"use client";

import dynamic from "next/dynamic";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  Loader2Icon,
  RotateCcwIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArtifactId } from "@/lib/convex-refs";
import { toArtifactId } from "@/lib/convex-refs";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { MermaidArtifactViewer } from "./mermaid-artifact-viewer";
import { urlArtifactDisplayModel } from "../utils/url-artifact-model";

const PdfArtifactViewer = dynamic(
  () => import("./pdf-artifact-viewer").then((module) => module.PdfArtifactViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Memuat PDF...
      </div>
    ),
  },
);

export type ArtifactRenderPayload =
  | {
      artifactType: "markdown";
      blocksJson: string;
      markdown: string;
      plainText: string;
    }
  | {
      artifactType: "pdf" | "docx";
      fileName: string;
      mimeType: string;
      byteSize: number;
      url: string;
      indexingStatus: "not_indexed" | "pending" | "ready" | "failed";
      indexingFailureReason?: string;
    }
  | {
      artifactType: "url";
      originalUrl: string;
      normalizedUrl: string;
      status: "pending" | "ready" | "failed";
      title?: string;
      description?: string;
      siteName?: string;
      failureReason?: string;
      readableText: string;
    }
  | {
      artifactType: "plain_text" | "html" | "svg" | "mermaid" | "json" | "csv" | "code";
      source: string;
      language?: string;
    };

export type PaperExtractionStatus = {
  extraction: {
    status: "pending" | "running" | "ready" | "failed";
    failureReason?: string;
    updatedAt: number;
  } | null;
  metadata: {
    title?: string;
    abstract?: string;
    doi?: string;
    authors: Array<{ name: string; affiliation?: string }>;
    affiliations: string[];
    journal?: string;
    publisher?: string;
    publishedYear?: number;
    keywords: string[];
    confidence?: number;
  } | null;
} | undefined;

export function TypedArtifactDetail({
  payload,
  title,
  paperExtraction,
  retryGrobidExtraction,
  artifactId,
}: {
  payload: Exclude<ArtifactRenderPayload, { artifactType: "markdown" | "url" }>;
  title: string;
  paperExtraction: PaperExtractionStatus;
  retryGrobidExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
  artifactId: string;
}) {
  if (payload.artifactType === "pdf") {
    return (
      <div className="mx-auto grid max-w-5xl gap-4">
        <FileArtifactToolbar
          payload={payload}
          paperExtraction={paperExtraction}
          retryGrobidExtraction={retryGrobidExtraction}
          artifactId={artifactId}
        />
        <PaperMetadataPanel paperExtraction={paperExtraction} />
        <PdfArtifactViewer url={payload.url} fileName={payload.fileName} />
      </div>
    );
  }

  if (payload.artifactType === "docx") {
    return (
      <div className="mx-auto grid max-w-3xl gap-4">
        <FileArtifactToolbar payload={payload} />
        <div className="grid place-items-center gap-3 rounded-[8px] border border-border bg-card p-8 text-center">
          <FileIcon className="size-10 text-muted-foreground" />
          <div className="grid gap-1">
            <p className="text-[14px] font-semibold text-foreground">{title}</p>
            <p className="text-[12px] font-medium text-muted-foreground">
              {payload.fileName} / {formatByteSize(payload.byteSize)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (payload.artifactType === "html") {
    return (
      <PreviewWithSource
        title="HTML preview"
        source={payload.source}
        srcDoc={buildSandboxedHtmlDocument(payload.source)}
        language={payload.language ?? "html"}
      />
    );
  }

  if (payload.artifactType === "svg") {
    return (
      <PreviewWithSource
        title="SVG preview"
        source={payload.source}
        srcDoc={payload.source}
        language={payload.language ?? "svg"}
      />
    );
  }

  if (payload.artifactType === "mermaid") {
    return (
      <div className="mx-auto grid max-w-5xl gap-3">
        <MermaidArtifactViewer source={payload.source} />
      </div>
    );
  }

  if (payload.artifactType === "json") {
    return <JsonArtifactDetail source={payload.source} />;
  }

  if (!("source" in payload)) {
    return null;
  }

  return (
    <SourceArtifactDetail
      source={payload.source}
      language={payload.language ?? payload.artifactType}
    />
  );
}

function FileArtifactToolbar({
  payload,
  paperExtraction,
  retryGrobidExtraction,
  artifactId,
}: {
  payload: Extract<ArtifactRenderPayload, { artifactType: "pdf" | "docx" }>;
  paperExtraction?: PaperExtractionStatus;
  retryGrobidExtraction?: (args: { artifactId: ArtifactId }) => Promise<unknown>;
  artifactId?: string;
}) {
  const canRetryPaperParsing =
    payload.artifactType === "pdf" &&
    paperExtraction?.extraction?.status === "failed" &&
    retryGrobidExtraction &&
    artifactId;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-foreground">
          {payload.fileName}
        </p>
        <p className="text-[11px] font-medium text-muted-foreground">
          {payload.mimeType} / {formatByteSize(payload.byteSize)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <IndexingStatusBadge
          status={payload.indexingStatus}
          failureReason={payload.indexingFailureReason}
        />
        {payload.artifactType === "pdf" ? (
          <PaperParsingBadge paperExtraction={paperExtraction} />
        ) : null}
        {canRetryPaperParsing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void retryGrobidExtraction({ artifactId: toArtifactId(artifactId) })}
          >
            <RotateCcwIcon className="size-4" />
            Retry parser
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <a href={payload.url} target="_blank" rel="noreferrer">
            <ExternalLinkIcon className="size-4" />
            Open
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={payload.url} download={payload.fileName}>
            <DownloadIcon className="size-4" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}

function PaperParsingBadge({
  paperExtraction,
}: {
  paperExtraction: PaperExtractionStatus;
}) {
  const status = paperExtraction?.extraction?.status;
  if (!status) {
    return <Badge variant="outline">Paper parser idle</Badge>;
  }
  if (status === "running" || status === "pending") {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Loader2Icon className="size-3 animate-spin" />
        Paper parsing
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" title={paperExtraction?.extraction?.failureReason}>
        Paper parsing failed
      </Badge>
    );
  }
  return <Badge variant="outline">Paper metadata ready</Badge>;
}

function PaperMetadataPanel({
  paperExtraction,
}: {
  paperExtraction: PaperExtractionStatus;
}) {
  const metadata = paperExtraction?.metadata;
  if (!metadata) {
    return null;
  }
  const authors = metadata.authors.map((author) => author.name).filter(Boolean);
  return (
    <section className="grid gap-3 rounded-[8px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Paper metadata
          </p>
          <h2 className="text-[16px] font-semibold leading-6 text-foreground">
            {metadata.title ?? "Untitled paper"}
          </h2>
        </div>
        {typeof metadata.confidence === "number" ? (
          <Badge variant="outline">{Math.round(metadata.confidence * 100)}%</Badge>
        ) : null}
      </div>
      <div className="grid gap-1 text-[13px] text-muted-foreground">
        {authors.length > 0 ? <p>{authors.join(", ")}</p> : null}
        <p>
          {[metadata.journal, metadata.publisher, metadata.publishedYear]
            .filter(Boolean)
            .join(" / ")}
        </p>
        {metadata.doi ? <p>DOI: {metadata.doi}</p> : null}
      </div>
      {metadata.abstract ? (
        <p className="max-w-4xl text-[13px] leading-6 text-foreground/85">
          {metadata.abstract}
        </p>
      ) : null}
    </section>
  );
}

function IndexingStatusBadge({
  status,
  failureReason,
}: {
  status: "not_indexed" | "pending" | "ready" | "failed";
  failureReason?: string;
}) {
  const label =
    status === "ready"
      ? "Indexed"
      : status === "pending"
        ? "Indexing"
        : status === "failed"
          ? "Indexing failed"
          : "Not indexed";
  return (
    <Badge
      variant={status === "failed" ? "destructive" : "outline"}
      title={failureReason}
    >
      {label}
    </Badge>
  );
}

function PreviewWithSource({
  title,
  source,
  srcDoc,
  language,
}: {
  title: string;
  source: string;
  srcDoc: string;
  language: string;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <iframe
        title={title}
        sandbox=""
        srcDoc={srcDoc}
        className="h-[520px] w-full rounded-[8px] border border-border bg-background"
      />
      <SourceArtifactDetail source={source} language={language} />
    </div>
  );
}

function JsonArtifactDetail({ source }: { source: string }) {
  const parsed = parseJsonSource(source);
  return (
    <div className="mx-auto grid max-w-5xl gap-3">
      {parsed.error ? (
        <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
          {parsed.error}
        </p>
      ) : null}
      <SourceArtifactDetail source={parsed.pretty} language="json" />
    </div>
  );
}

function SourceArtifactDetail({
  source,
  language,
}: {
  source: string;
  language: string;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-2">
      <div className="flex items-center justify-between rounded-t-[8px] border border-border bg-muted/35 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {language}
        </span>
      </div>
      <pre className="min-h-[220px] overflow-auto rounded-b-[8px] border-x border-b border-border bg-background p-4 text-[12px] leading-6 text-foreground">
        {source || "No source content."}
      </pre>
    </div>
  );
}

export function UrlArtifactDetail({
  artifactId,
  url,
  retryUrlExtraction,
}: {
  artifactId: string;
  url: Extract<ArtifactRenderPayload, { artifactType: "url" }>;
  retryUrlExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
}) {
  const model = urlArtifactDisplayModel(url);
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
              onClick={() => void retryUrlExtraction({ artifactId: toArtifactId(artifactId) })}
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
          {url.readableText || "No readable text was extracted."}
        </article>
      )}
    </div>
  );
}

function parseJsonSource(source: string) {
  try {
    return {
      pretty: JSON.stringify(JSON.parse(source), null, 2),
      error: null,
    };
  } catch (error: unknown) {
    return {
      pretty: source,
      error: error instanceof Error ? error.message : "JSON tidak valid.",
    };
  }
}

function buildSandboxedHtmlDocument(source: string) {
  const csp =
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob: https:; style-src &#39;unsafe-inline&#39;; font-src data:; script-src &#39;none&#39;; connect-src &#39;none&#39;; frame-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">';
  const base = '<base target="_blank">';

  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) {
      return source.replace(/<head([^>]*)>/i, `<head$1>${csp}${base}`);
    }
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${base}</head>`);
  }

  return `<!doctype html><html><head>${csp}${base}</head><body>${source}</body></html>`;
}

function formatByteSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "Unknown size";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function ArtifactLoading() {
  return (
    <div className={cn("grid gap-4", panelBodyPaddingClass)}>
      <p className="text-[12px] font-medium text-muted-foreground">Memuat artifact...</p>
      <Skeleton className="h-12 rounded-[8px]" />
      <Skeleton className="h-64 rounded-[8px]" />
    </div>
  );
}

export function ArtifactMissing() {
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
