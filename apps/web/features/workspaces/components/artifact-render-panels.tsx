"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import type { BundledLanguage } from "shiki";
import {
  ArrowLeftIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "@aqsha/ui/icons";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
} from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MermaidArtifactViewer } from "./mermaid-artifact-viewer";

const PdfArtifactViewer = dynamic(
  () => import("./pdf-artifact-viewer").then((module) => module.PdfArtifactViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[640px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Loading PDF…
      </div>
    ),
  },
);

const tabsListClass =
  "h-10 w-full justify-start gap-5 rounded-none border-0 border-b border-border bg-transparent p-0";
const tabsTriggerClass =
  "h-10 min-w-0 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0 text-[13px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
const insetSurfaceClass = "rounded-[8px] border border-border/80 bg-card/40";

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

type NonMarkdownPayload = Exclude<ArtifactRenderPayload, { artifactType: "markdown" }>;

export function ArtifactReadingColumn({
  payload,
  title,
}: {
  payload: NonMarkdownPayload;
  title: string;
}) {
  if (payload.artifactType === "url") {
    return <UrlReadingColumn url={payload} />;
  }

  if (payload.artifactType === "pdf") {
    return <PdfArtifactViewer url={payload.url} />;
  }

  if (payload.artifactType === "docx") {
    return (
      <div className="grid min-h-[420px] place-items-center gap-3 p-8 text-center">
        <FileIcon className="size-10 text-muted-foreground" />
        <div className="grid gap-1">
          <p className="text-[14px] font-semibold text-foreground">{title}</p>
          <p className="text-[12px] font-medium text-muted-foreground">
            {payload.fileName} / {formatByteSize(payload.byteSize)}
          </p>
          <p className="text-[12px] font-medium text-muted-foreground">
            Open or download this document from the actions above.
          </p>
        </div>
      </div>
    );
  }

  if (!("source" in payload)) {
    return null;
  }

  if (payload.artifactType === "html") {
    return (
      <SandboxFrame
        title="HTML preview"
        srcDoc={buildSandboxedHtmlDocument(payload.source)}
        heightClass="h-[60svh] min-h-[480px]"
      />
    );
  }

  if (payload.artifactType === "svg") {
    return (
      <SandboxFrame
        title="SVG preview"
        srcDoc={buildSandboxedSvgDocument(payload.source)}
        heightClass="h-[52svh] min-h-[420px]"
      />
    );
  }

  if (payload.artifactType === "mermaid") {
    return (
      <div className={cn("h-[52svh] min-h-[420px] overflow-hidden", insetSurfaceClass)}>
        <MermaidArtifactViewer source={payload.source} />
      </div>
    );
  }

  if (payload.artifactType === "json") {
    return (
      <ViewerSourceTabs
        viewer={<JsonStructuredViewer source={payload.source} />}
        source={payload.source}
        language="json"
      />
    );
  }

  if (payload.artifactType === "csv") {
    return (
      <ViewerSourceTabs
        viewer={<CsvArtifactViewer source={payload.source} />}
        source={payload.source}
        language="csv"
      />
    );
  }

  if (payload.artifactType === "plain_text") {
    return (
      <article className="artifact-prose min-h-[360px] whitespace-pre-wrap">
        {payload.source || "No text content."}
      </article>
    );
  }

  // code
  return <SourceBlock source={payload.source} language={payload.language ?? "code"} />;
}

function UrlReadingColumn({
  url,
}: {
  url: Extract<ArtifactRenderPayload, { artifactType: "url" }>;
}) {
  if (url.status === "pending") {
    return (
      <div className="flex min-h-[360px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading this page…
      </div>
    );
  }
  if (url.status === "failed") {
    return (
      <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
        {url.failureReason ?? "We couldn't read this page."}
      </p>
    );
  }
  return (
    <article className="artifact-prose min-h-[420px] whitespace-pre-wrap">
      {url.readableText || "No readable text was extracted."}
    </article>
  );
}

function ViewerSourceTabs({
  viewer,
  source,
  language,
}: {
  viewer: ReactNode;
  source: string;
  language: string;
}) {
  return (
    <Tabs defaultValue="viewer" className="gap-0">
      <TabsList className={tabsListClass}>
        <TabsTrigger value="viewer" className={tabsTriggerClass}>
          Viewer
        </TabsTrigger>
        <TabsTrigger value="source" className={tabsTriggerClass}>
          Source
        </TabsTrigger>
      </TabsList>
      <TabsContent value="viewer" className="pt-6">
        {viewer}
      </TabsContent>
      <TabsContent value="source" className="pt-6">
        <SourceBlock source={source} language={language} />
      </TabsContent>
    </Tabs>
  );
}

function SandboxFrame({
  title,
  srcDoc,
  heightClass,
}: {
  title: string;
  srcDoc: string;
  heightClass: string;
}) {
  return (
    <div className={cn("overflow-hidden", insetSurfaceClass)}>
      <iframe
        title={title}
        sandbox=""
        srcDoc={srcDoc}
        className={cn("w-full border-0 bg-background", heightClass)}
      />
    </div>
  );
}

function SourceBlock({ source, language }: { source: string; language: string }) {
  const normalizedLanguage = normalizeCodeBlockLanguage(language);
  return (
    <div className={cn("h-[60svh] min-h-[420px] overflow-hidden", insetSurfaceClass)}>
      <CodeBlock
        code={source || "No source content."}
        language={normalizedLanguage}
        className={cn(
          "relative flex h-full min-h-0 flex-col rounded-none border-0 bg-transparent shadow-none",
          "[&_.code-block-content]:min-h-0 [&_.code-block-content]:flex-1",
          "[&_.code-block-content_pre]:min-h-full [&_.code-block-content_pre]:bg-transparent!",
          "[&_.code-block-content_pre]:px-3 [&_.code-block-content_pre]:py-3",
        )}
      >
        <CodeBlockHeader className="pointer-events-none absolute right-1 top-1 z-[1] min-h-0 border-b-0 bg-transparent px-0">
          <CodeBlockActions>
            <CodeBlockCopyButton className="pointer-events-auto" />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </div>
  );
}

function JsonStructuredViewer({ source }: { source: string }) {
  const parsed = parseJsonSource(source);

  if (parsed.error) {
    return (
      <section className={cn("grid min-h-[260px] place-items-center p-8 text-center", insetSurfaceClass)}>
        <div className="grid max-w-sm gap-2">
          <h2 className="text-[14px] font-semibold text-foreground">JSON preview unavailable</h2>
          <p className="text-[12px] leading-5 text-muted-foreground">
            {sourceLineCount(source)} lines / {formatByteSize(new Blob([source]).size)}
          </p>
        </div>
      </section>
    );
  }

  const value = JSON.parse(source) as unknown;
  const rows = jsonPreviewRows(value).slice(0, 24);

  return (
    <section className={cn("overflow-hidden", insetSurfaceClass)}>
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <h2 className="text-[13px] font-semibold text-foreground">JSON viewer</h2>
        <span className="text-[11px] font-medium text-muted-foreground">
          {jsonValueSummary(value)}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={row.path}
            className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] sm:gap-4"
          >
            <span className="truncate font-mono text-[12px] text-muted-foreground">{row.path}</span>
            <span className="truncate text-[12px] font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CsvArtifactViewer({ source }: { source: string }) {
  const rows = parseCsvPreview(source);
  const header = rows[0] ?? [];
  const body = rows.slice(1, 11);

  return (
    <div className={cn("overflow-hidden", insetSurfaceClass)}>
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <h2 className="text-[13px] font-semibold text-foreground">CSV viewer</h2>
        <span className="text-[11px] font-medium text-muted-foreground">
          {Math.max(rows.length - 1, 0)} rows / {header.length} columns
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
          <thead className="bg-muted/35 text-muted-foreground">
            <tr>
              {header.map((cell, columnIndex) => (
                <th
                  key={csvColumnKey(cell, columnIndex)}
                  className="border-b border-border px-3 py-2 font-semibold"
                >
                  {cell || `Column ${columnIndex + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={csvRowKey(row, rowIndex)} className="border-b border-border/60 last:border-b-0">
                {header.map((_, cellIndex) => (
                  <td
                    key={csvColumnKey(header[cellIndex], cellIndex)}
                    className="max-w-72 truncate px-3 py-2 text-foreground"
                  >
                    {row[cellIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function csvColumnKey(cell: string | undefined, columnIndex: number) {
  return cell ? `column:${cell}` : `column:${columnIndex + 1}`;
}

function csvRowKey(row: string[], rowIndex: number) {
  const content = row.join("");
  return content ? `row:${content}` : `row:${rowIndex + 1}`;
}

export function ArtifactHeaderActions({
  payload,
  onDelete,
}: {
  payload: ArtifactRenderPayload;
  onDelete: () => void;
}) {
  const isFile = payload.artifactType === "pdf" || payload.artifactType === "docx";
  const isUrl = payload.artifactType === "url";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {isUrl ? (
          <HeaderLinkButton label="Open link" href={payload.normalizedUrl}>
            <ExternalLinkIcon className="size-4" />
          </HeaderLinkButton>
        ) : null}
        {isFile ? (
          <>
            <HeaderLinkButton label="Open file" href={payload.url}>
              <ExternalLinkIcon className="size-4" />
            </HeaderLinkButton>
            <HeaderLinkButton label="Download" href={payload.url} download={payload.fileName}>
              <DownloadIcon className="size-4" />
            </HeaderLinkButton>
          </>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="More actions">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {isFile ? (
              <DropdownMenuItem className="pointer-events-none flex-col items-start gap-0.5">
                <span className="max-w-full truncate font-medium text-foreground">
                  {payload.fileName}
                </span>
                <span className="text-muted-foreground">
                  {payload.mimeType} / {formatByteSize(payload.byteSize)}
                </span>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2Icon className="size-4" />
              Delete artifact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

export function ArtifactIndexingStatus({
  status,
  reason,
}: {
  status?: "not_indexed" | "pending" | "ready" | "failed";
  reason?: string;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-30">
      <TooltipProvider>
        <div className="rounded-full border border-border bg-card/80 px-3 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <IndexingStatusBadge status={status} reason={reason} />
        </div>
      </TooltipProvider>
    </div>
  );
}

function IndexingStatusBadge({
  status,
  reason,
}: {
  status?: "not_indexed" | "pending" | "ready" | "failed";
  reason?: string;
}) {
  const dotTone =
    status === "ready"
      ? "bg-mint-foreground"
      : status === "pending"
        ? "bg-lemon-foreground"
        : status === "failed"
          ? "bg-destructive"
          : "bg-muted-foreground/50";
  const label =
    status === "ready"
      ? "Indexed"
      : status === "pending"
        ? "Indexing"
        : status === "failed"
          ? "Indexing failed"
          : "Not indexed";

  const badge = (
    <span className="inline-flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
      {status === "pending" ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : (
        <span className={cn("size-1.5 rounded-full", dotTone)} />
      )}
      {label}
    </span>
  );

  if (status === "failed" && reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    );
  }
  return badge;
}

function HeaderLinkButton({
  label,
  href,
  download,
  children,
}: {
  label: string;
  href: string;
  download?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon-sm">
          <a
            href={href}
            target={download ? undefined : "_blank"}
            rel="noreferrer"
            download={download}
            aria-label={label}
          >
            {children}
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ArtifactDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-1/2 rounded-md bg-muted/50" />
      <Skeleton className="h-[70svh] min-h-[420px] w-full rounded-[8px] bg-muted/50" />
    </div>
  );
}

export function ArtifactMissingState({ workspaceId }: { workspaceId: string }) {
  return (
    <section>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 text-muted-foreground">
        <Link href={`/app/workspaces/${workspaceId}`}>
          <ArrowLeftIcon className="size-4" />
          Back to workspace
        </Link>
      </Button>
      <div className="grid min-h-[48svh] place-items-center rounded-[8px] border border-border/80 bg-card/30 p-6 text-center">
        <div>
          <FileIcon className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            This artifact isn&apos;t available.
          </h1>
          <p className="mt-2 max-w-md text-[14px] font-medium leading-6 text-muted-foreground">
            We couldn&apos;t find this artifact in the workspace you have open.
          </p>
        </div>
      </div>
    </section>
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
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
}

function buildSandboxedHtmlDocument(source: string) {
  const csp =
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob: https:; style-src &#39;unsafe-inline&#39;; font-src data:; script-src &#39;none&#39;; connect-src &#39;none&#39;; frame-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">';
  const base = '<base target="_blank">';
  const viewportStyle =
    "<style>html,body{min-height:100%;margin:0;}body{box-sizing:border-box;}*,*::before,*::after{box-sizing:inherit;}</style>";

  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) {
      return source.replace(/<head([^>]*)>/i, `<head$1>${csp}${base}${viewportStyle}`);
    }
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${base}${viewportStyle}</head>`);
  }

  return `<!doctype html><html><head>${csp}${base}${viewportStyle}</head><body>${source}</body></html>`;
}

function buildSandboxedSvgDocument(source: string) {
  const csp =
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob:; style-src &#39;unsafe-inline&#39;; font-src data:; script-src &#39;none&#39;; connect-src &#39;none&#39;; base-uri &#39;none&#39;">';
  const svgSource = source.replace(
    /<svg\b([^>]*)>/i,
    (_match, attributes: string) => {
      const normalizedAttributes = String(attributes)
        .replace(/\s(width|height)=["'][^"']*["']/gi, "")
        .replace(/\s(width|height)=\S+/gi, "");
      return `<svg${normalizedAttributes} width="100%" height="100%">`;
    },
  );

  return `<!doctype html><html><head>${csp}<style>html,body{height:100%;margin:0;}body{display:grid;place-items:center;overflow:auto;background:transparent;}svg{display:block;max-width:100%;max-height:100%;}</style></head><body>${svgSource}</body></html>`;
}

function sourceLineCount(source: string) {
  if (!source) return 0;
  return source.split(/\r\n|\r|\n/).length;
}

function jsonValueSummary(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return `${Object.keys(value).length} keys`;
  return typeof value;
}

function jsonPreviewRows(value: unknown, path = "$"): Array<{ path: string; value: string }> {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ path, value: "[]" }];
    return value.flatMap((item, index) => jsonPreviewRows(item, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [{ path, value: "{}" }];
    return entries.flatMap(([key, entryValue]) => jsonPreviewRows(entryValue, `${path}.${key}`));
  }

  return [{ path, value: String(value) }];
}

function parseCsvPreview(source: string) {
  return source
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 12)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

function normalizeCodeBlockLanguage(language: string): BundledLanguage {
  const normalized = language.toLowerCase();
  if (normalized === "plain_text" || normalized === "text" || normalized === "txt") {
    return "log";
  }
  if (normalized === "code") {
    return "log";
  }
  if (normalized === "mermaid") {
    return "mermaid";
  }
  if (normalized === "javascript" || normalized === "js") {
    return "javascript";
  }
  if (normalized === "typescript" || normalized === "ts") {
    return "typescript";
  }
  if (normalized === "tsx") {
    return "tsx";
  }
  if (normalized === "jsx") {
    return "jsx";
  }
  if (normalized === "html") {
    return "html";
  }
  if (normalized === "svg" || normalized === "xml") {
    return "xml";
  }
  if (normalized === "json") {
    return "json";
  }
  if (normalized === "csv") {
    return "csv";
  }
  if (normalized === "css") {
    return "css";
  }
  if (normalized === "markdown" || normalized === "md") {
    return "markdown";
  }
  return "log";
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
