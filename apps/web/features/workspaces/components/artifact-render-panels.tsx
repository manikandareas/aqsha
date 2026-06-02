"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { BundledLanguage } from "shiki";
import {
  Code2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  FileTextIcon,
  RotateCcwIcon,
} from "@aqsha/ui/icons";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
} from "@/components/ai-elements/code-block";
import { Badge } from "@/components/ui/badge";
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
        Memuat PDF…
      </div>
    ),
  },
);

const artifactTabsRootClass =
  "relative h-full min-h-0 w-full gap-0 overflow-visible before:absolute before:left-0 before:top-11 before:bottom-0 before:w-px before:bg-border/80 before:content-[''] after:absolute after:left-0 after:right-[-1.25rem] after:top-11 after:h-px after:bg-border/80 after:content-[''] sm:after:right-[-1.75rem]";
const artifactTabsListClass =
  "relative z-[1] h-11 rounded-none border-0 bg-transparent p-0 text-muted-foreground";
const artifactTabsTriggerClass =
  "relative -mb-px h-11 min-w-28 gap-2 rounded-t-[16px] border border-border/80 border-b-0 bg-card/40 px-4 text-[13px] font-semibold shadow-none transition-colors hover:bg-card/70 data-[state=active]:z-[2] data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none [&+button]:-ml-px";
const artifactTabsContentClass =
  "relative z-0 h-0 min-h-0 flex-1 overflow-auto px-5 pb-6 pt-4 sm:px-6";
const artifactTabsFlushContentClass =
  "relative z-0 h-0 min-h-0 flex-1 overflow-hidden p-0";
const artifactVisualViewerClass =
  "flex h-full min-h-[520px] w-full items-center justify-center overflow-auto";
const artifactInsetSurfaceClass =
  "rounded-[8px] border border-border/80 bg-card/40";

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
      <Tabs defaultValue="viewer" className={artifactTabsRootClass}>
        <ArtifactDetailControls>
          <TabsList className={artifactTabsListClass}>
            <TabsTrigger value="viewer" className={artifactTabsTriggerClass}>
              <FileTextIcon className="size-4" />
              Viewer
            </TabsTrigger>
            <TabsTrigger value="details" className={artifactTabsTriggerClass}>
              <InfoIcon className="size-4" />
              Details
            </TabsTrigger>
          </TabsList>
          <FileArtifactToolbar
            payload={payload}
            paperExtraction={paperExtraction}
            retryGrobidExtraction={retryGrobidExtraction}
            artifactId={artifactId}
          />
        </ArtifactDetailControls>
        <TabsContent value="viewer" className={artifactTabsFlushContentClass}>
          <PdfArtifactViewer url={payload.url} fileName={payload.fileName} />
        </TabsContent>
        <TabsContent value="details" className={artifactTabsContentClass}>
          <FileArtifactDetails payload={payload} paperExtraction={paperExtraction} title={title} />
        </TabsContent>
      </Tabs>
    );
  }

  if (payload.artifactType === "docx") {
    return (
      <Tabs defaultValue="viewer" className={artifactTabsRootClass}>
        <ArtifactDetailControls>
          <TabsList className={artifactTabsListClass}>
            <TabsTrigger value="viewer" className={artifactTabsTriggerClass}>
              <FileTextIcon className="size-4" />
              Viewer
            </TabsTrigger>
            <TabsTrigger value="source" className={artifactTabsTriggerClass}>
              <Code2Icon className="size-4" />
              Source
            </TabsTrigger>
          </TabsList>
          <FileArtifactToolbar payload={payload} />
        </ArtifactDetailControls>
        <TabsContent value="viewer" className={artifactTabsContentClass}>
          <div className={cn("grid min-h-[360px] place-items-center gap-3 p-8 text-center", artifactInsetSurfaceClass)}>
            <FileIcon className="size-10 text-muted-foreground" />
            <div className="grid gap-1">
              <p className="text-[14px] font-semibold text-foreground">{title}</p>
              <p className="text-[12px] font-medium text-muted-foreground">
                {payload.fileName} / {formatByteSize(payload.byteSize)}
              </p>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="source" className={artifactTabsContentClass}>
          <SourceArtifactDetail
            source={fileArtifactSource(payload)}
            language="json"
            filename={`${payload.fileName}.source.json`}
          />
        </TabsContent>
      </Tabs>
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
        srcDoc={buildSandboxedSvgDocument(payload.source)}
        language={payload.language ?? "svg"}
      />
    );
  }

  if (payload.artifactType === "mermaid") {
    return (
      <ViewerSourceTabs
        viewer={<MermaidArtifactViewer source={payload.source} />}
        source={payload.source}
        language={payload.language ?? "mermaid"}
        filename="artifact.mermaid"
        visual
      />
    );
  }

  if (payload.artifactType === "json") {
    return <JsonArtifactDetail source={payload.source} />;
  }

  if (!("source" in payload)) {
    return null;
  }

  return <SourceOnlyArtifactDetail payload={payload} />;
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
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <StatusDot
          label={indexingStatusLabel(payload.indexingStatus)}
          tone={payload.indexingStatus === "failed" ? "destructive" : payload.indexingStatus === "ready" ? "success" : "muted"}
          title={payload.indexingFailureReason}
        />
        {payload.artifactType === "pdf" ? (
          <StatusDot
            label={paperParsingLabel(paperExtraction)}
            tone={paperExtraction?.extraction?.status === "failed" ? "destructive" : paperExtraction?.extraction?.status === "ready" ? "success" : "muted"}
            title={paperExtraction?.extraction?.failureReason}
          />
        ) : null}
        {canRetryPaperParsing ? (
          <IconButtonTooltip label="Retry parser">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => void retryGrobidExtraction({ artifactId: toArtifactId(artifactId) })}
            >
              <RotateCcwIcon className="size-4" />
            </Button>
          </IconButtonTooltip>
        ) : null}
        <IconButtonTooltip label="Open file">
          <Button asChild variant="outline" size="icon-sm">
            <a href={payload.url} target="_blank" rel="noreferrer" aria-label="Open file">
              <ExternalLinkIcon className="size-4" />
            </a>
          </Button>
        </IconButtonTooltip>
        <IconButtonTooltip label="Download file">
          <Button asChild variant="outline" size="icon-sm">
            <a href={payload.url} download={payload.fileName} aria-label="Download file">
              <DownloadIcon className="size-4" />
            </a>
          </Button>
        </IconButtonTooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="File details">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem className="flex-col items-start gap-0.5">
              <span className="max-w-full truncate font-medium text-foreground">
                {payload.fileName}
              </span>
              <span>{payload.mimeType} / {formatByteSize(payload.byteSize)}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

function ArtifactDetailControls({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-[2] flex min-h-11 flex-wrap items-end justify-between gap-3">
      {children}
    </div>
  );
}

function FileArtifactDetails({
  payload,
  paperExtraction,
  title,
}: {
  payload: Extract<ArtifactRenderPayload, { artifactType: "pdf" | "docx" }>;
  paperExtraction?: PaperExtractionStatus;
  title: string;
}) {
  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <MetadataItem label="File" value={payload.fileName} />
          <MetadataItem label="Type" value={payload.mimeType} />
          <MetadataItem label="Size" value={formatByteSize(payload.byteSize)} />
          <MetadataItem
            label="Indexing"
            value={indexingStatusLabel(payload.indexingStatus)}
            description={payload.indexingFailureReason}
          />
          {payload.artifactType === "pdf" ? (
            <MetadataItem
              label="Paper parser"
              value={paperParsingLabel(paperExtraction)}
              description={paperExtraction?.extraction?.failureReason}
            />
          ) : null}
        </dl>
      </section>
      {payload.artifactType === "pdf" ? (
        <PaperMetadataPanel paperExtraction={paperExtraction} />
      ) : null}
    </div>
  );
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
  const authors = metadata.authors.flatMap((author) =>
    author.name ? [author.name] : [],
  );
  return (
    <section className="grid gap-3 border-t border-border/70 pt-5">
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

function MetadataItem({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="min-w-0 border-t border-border/60 pt-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate font-medium text-foreground">{value}</dd>
      {description ? (
        <dd className="mt-1 text-[12px] leading-5 text-muted-foreground">{description}</dd>
      ) : null}
    </div>
  );
}

function IconButtonTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function StatusDot({
  label,
  tone,
  title,
}: {
  label: string;
  tone: "success" | "destructive" | "muted";
  title?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          title={title}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-[8px] border border-border bg-card/60",
            tone === "success" ? "text-emerald-700" : null,
            tone === "destructive" ? "text-destructive" : null,
            tone === "muted" ? "text-muted-foreground" : null,
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{title ? `${label}: ${title}` : label}</TooltipContent>
    </Tooltip>
  );
}

function indexingStatusLabel(status: "not_indexed" | "pending" | "ready" | "failed") {
  if (status === "ready") return "Indexed";
  if (status === "pending") return "Indexing";
  if (status === "failed") return "Indexing failed";
  return "Not indexed";
}

function paperParsingLabel(paperExtraction: PaperExtractionStatus) {
  const status = paperExtraction?.extraction?.status;
  if (!status) return "Paper parser idle";
  if (status === "running" || status === "pending") return "Paper parsing";
  if (status === "failed") return "Paper parsing failed";
  return "Paper metadata ready";
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
    <Tabs defaultValue="viewer" className={artifactTabsRootClass}>
      <ArtifactDetailControls>
        <TabsList className={artifactTabsListClass}>
          <TabsTrigger value="viewer" className={artifactTabsTriggerClass}>
            <FileTextIcon className="size-4" />
            Viewer
          </TabsTrigger>
          <TabsTrigger value="source" className={artifactTabsTriggerClass}>
            <Code2Icon className="size-4" />
            Source
          </TabsTrigger>
        </TabsList>
      </ArtifactDetailControls>
      <TabsContent value="viewer" className={artifactTabsContentClass}>
        <div className={artifactVisualViewerClass}>
          <iframe
            title={title}
            sandbox=""
            srcDoc={srcDoc}
            className="h-full min-h-[520px] w-full border-0 bg-background"
          />
        </div>
      </TabsContent>
      <TabsContent value="source" className={artifactTabsContentClass}>
        <SourceArtifactDetail source={source} language={language} filename={`artifact.${language}`} />
      </TabsContent>
    </Tabs>
  );
}

function JsonArtifactDetail({ source }: { source: string }) {
  const parsed = parseJsonSource(source);
  return (
    <ViewerSourceTabs
      viewer={
        <div className="grid gap-3">
          {parsed.error ? (
            <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
              {parsed.error}
            </p>
          ) : null}
          <JsonStructuredViewer source={source} />
        </div>
      }
      source={source}
      language="json"
      filename="source.json"
    />
  );
}

function SourceArtifactDetail({
  source,
  language,
}: {
  source: string;
  language: string;
  filename?: string;
}) {
  const normalizedLanguage = normalizeCodeBlockLanguage(language);
  return (
    <div className="h-full min-h-[520px] w-full">
      <CodeBlock
        code={source || "No source content."}
        language={normalizedLanguage}
        className={cn(
          "relative flex h-full min-h-0 flex-col rounded-none border-0 bg-transparent shadow-none",
          "[&_.code-block-content]:min-h-0 [&_.code-block-content]:flex-1",
          "[&_.code-block-content_pre]:min-h-full [&_.code-block-content_pre]:bg-transparent!",
          "[&_.code-block-content_pre]:px-0 [&_.code-block-content_pre]:pb-4 [&_.code-block-content_pre]:pt-1",
        )}
      >
        <CodeBlockHeader className="pointer-events-none absolute right-0 top-0 z-[1] min-h-0 border-b-0 bg-transparent px-0">
          <CodeBlockActions>
            <CodeBlockCopyButton className="pointer-events-auto" />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </div>
  );
}

function ViewerSourceTabs({
  viewer,
  source,
  language,
  filename,
  visual = false,
}: {
  viewer: ReactNode;
  source: string;
  language: string;
  filename?: string;
  visual?: boolean;
}) {
  return (
    <Tabs defaultValue="viewer" className={artifactTabsRootClass}>
      <ArtifactDetailControls>
        <TabsList className={artifactTabsListClass}>
          <TabsTrigger value="viewer" className={artifactTabsTriggerClass}>
            <FileTextIcon className="size-4" />
            Viewer
          </TabsTrigger>
          <TabsTrigger value="source" className={artifactTabsTriggerClass}>
            <Code2Icon className="size-4" />
            Source
          </TabsTrigger>
        </TabsList>
      </ArtifactDetailControls>
      <TabsContent value="viewer" className={artifactTabsContentClass}>
        {visual ? (
          <div className={artifactVisualViewerClass}>{viewer}</div>
        ) : (
          viewer
        )}
      </TabsContent>
      <TabsContent value="source" className={artifactTabsContentClass}>
        <SourceArtifactDetail source={source} language={language} filename={filename} />
      </TabsContent>
    </Tabs>
  );
}

function SourceOnlyArtifactDetail({
  payload,
}: {
  payload: Extract<ArtifactRenderPayload, { source: string }>;
}) {
  const language = payload.language ?? payload.artifactType;
  return (
    <ViewerSourceTabs
      viewer={<SourceArtifactViewerPreview payload={payload} language={language} />}
      source={payload.source}
      language={language}
      filename={`source.${sourceFileExtension(language)}`}
    />
  );
}

function SourceArtifactViewerPreview({
  payload,
  language,
}: {
  payload: Extract<ArtifactRenderPayload, { source: string }>;
  language: string;
}) {
  if (payload.artifactType === "csv") {
    return <CsvArtifactViewer source={payload.source} />;
  }

  if (payload.artifactType === "plain_text") {
    return (
      <article className={cn("artifact-prose min-h-[360px] whitespace-pre-wrap p-4", artifactInsetSurfaceClass)}>
        {payload.source || "No text content."}
      </article>
    );
  }

  return (
    <section className={cn("grid min-h-[320px] place-items-center p-8 text-center", artifactInsetSurfaceClass)}>
      <div className="grid max-w-sm gap-3">
        <FileIcon className="mx-auto size-9 text-muted-foreground" />
        <div className="grid gap-1">
          <h2 className="text-[14px] font-semibold text-foreground">
            {artifactTypeLabel(payload.artifactType)}
          </h2>
          <p className="text-[12px] leading-5 text-muted-foreground">
            {sourceLineCount(payload.source)} lines / {formatByteSize(new Blob([payload.source]).size)} / {language}
          </p>
        </div>
      </div>
    </section>
  );
}

function JsonStructuredViewer({ source }: { source: string }) {
  const parsed = parseJsonSource(source);

  if (parsed.error) {
    return (
      <section className={cn("grid min-h-[260px] place-items-center p-8 text-center", artifactInsetSurfaceClass)}>
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
    <section className={cn("overflow-hidden", artifactInsetSurfaceClass)}>
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <h2 className="text-[13px] font-semibold text-foreground">JSON viewer</h2>
        <span className="text-[11px] font-medium text-muted-foreground">
          {jsonValueSummary(value)}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((row) => (
          <div key={row.path} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] sm:gap-4">
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
    <div className={cn("overflow-hidden", artifactInsetSurfaceClass)}>
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
                <th key={csvColumnKey(cell, columnIndex)} className="border-b border-border px-3 py-2 font-semibold">
                  {cell || `Column ${columnIndex + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={csvRowKey(row, rowIndex)} className="border-b border-border/60 last:border-b-0">
                {header.map((_, cellIndex) => (
                  <td key={csvColumnKey(header[cellIndex], cellIndex)} className="max-w-72 truncate px-3 py-2 text-foreground">
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
  const content = row.join("\u001f");
  return content ? `row:${content}` : `row:${rowIndex + 1}`;
}

function UrlArtifactToolbar({
  artifactId,
  url,
  label,
  tone,
  canRetry,
  retryUrlExtraction,
}: {
  artifactId: string;
  url: Extract<ArtifactRenderPayload, { artifactType: "url" }>;
  label: string;
  tone: "ready" | "destructive" | "muted";
  canRetry: boolean;
  retryUrlExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
}) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <StatusDot
          label={label}
          tone={tone === "destructive" ? "destructive" : tone === "ready" ? "success" : "muted"}
          title={url.failureReason}
        />
        {canRetry ? (
          <IconButtonTooltip label="Retry extraction">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => void retryUrlExtraction({ artifactId: toArtifactId(artifactId) })}
            >
              <RotateCcwIcon className="size-4" />
            </Button>
          </IconButtonTooltip>
        ) : null}
        <IconButtonTooltip label="Open URL">
          <Button asChild variant="outline" size="icon-sm">
            <a href={url.normalizedUrl} target="_blank" rel="noreferrer" aria-label="Open URL">
              <ExternalLinkIcon className="size-4" />
            </a>
          </Button>
        </IconButtonTooltip>
      </div>
    </TooltipProvider>
  );
}

function UrlArtifactDetails({
  url,
  label,
  tone,
}: {
  url: Extract<ArtifactRenderPayload, { artifactType: "url" }>;
  label: string;
  tone: "ready" | "destructive" | "muted";
}) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone === "destructive" ? "destructive" : "outline"}>{label}</Badge>
        {url.siteName ? (
          <span className="text-[12px] font-medium text-muted-foreground">{url.siteName}</span>
        ) : null}
      </div>
      <dl className="grid gap-2 text-[13px]">
        <MetadataItem label="URL" value={url.normalizedUrl} />
        {url.originalUrl !== url.normalizedUrl ? (
          <MetadataItem label="Original URL" value={url.originalUrl} />
        ) : null}
        {url.title ? <MetadataItem label="Title" value={url.title} /> : null}
      </dl>
      {url.description ? (
        <p className="max-w-3xl text-[13px] leading-6 text-muted-foreground">
          {url.description}
        </p>
      ) : null}
      {url.failureReason ? (
        <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
          {url.failureReason}
        </p>
      ) : null}
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
    <Tabs defaultValue="viewer" className={artifactTabsRootClass}>
      <ArtifactDetailControls>
        <TabsList className={artifactTabsListClass}>
          <TabsTrigger value="viewer" className={artifactTabsTriggerClass}>
            <FileTextIcon className="size-4" />
            Viewer
          </TabsTrigger>
          <TabsTrigger value="source" className={artifactTabsTriggerClass}>
            <Code2Icon className="size-4" />
            Source
          </TabsTrigger>
          <TabsTrigger value="details" className={artifactTabsTriggerClass}>
            <InfoIcon className="size-4" />
            Details
          </TabsTrigger>
        </TabsList>
        <UrlArtifactToolbar
          artifactId={artifactId}
          url={url}
          label={model.label}
          tone={model.tone}
          canRetry={model.canRetry}
          retryUrlExtraction={retryUrlExtraction}
        />
      </ArtifactDetailControls>
      <TabsContent value="viewer" className={artifactTabsContentClass}>
        {url.status === "pending" ? (
          <div className="flex min-h-[260px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Extraction is running.
          </div>
        ) : url.status === "failed" ? (
          <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
            {url.failureReason ?? "Extraction failed."}
          </p>
        ) : (
          <article className={cn("artifact-prose min-h-[420px] whitespace-pre-wrap p-4", artifactInsetSurfaceClass)}>
            {url.readableText || "No readable text was extracted."}
          </article>
        )}
      </TabsContent>
      <TabsContent value="source" className={artifactTabsContentClass}>
        <SourceArtifactDetail source={urlArtifactSource(url)} language="json" filename="url.source.json" />
      </TabsContent>
      <TabsContent value="details" className={artifactTabsContentClass}>
        <UrlArtifactDetails url={url} label={model.label} tone={model.tone} />
      </TabsContent>
    </Tabs>
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

function fileArtifactSource(
  payload: Extract<ArtifactRenderPayload, { artifactType: "pdf" | "docx" }>,
) {
  return JSON.stringify(
    {
      artifactType: payload.artifactType,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      byteSize: payload.byteSize,
      url: payload.url,
      indexingStatus: payload.indexingStatus,
      indexingFailureReason: payload.indexingFailureReason ?? null,
    },
    null,
    2,
  );
}

function urlArtifactSource(url: Extract<ArtifactRenderPayload, { artifactType: "url" }>) {
  return JSON.stringify(
    {
      artifactType: url.artifactType,
      originalUrl: url.originalUrl,
      normalizedUrl: url.normalizedUrl,
      status: url.status,
      title: url.title ?? null,
      description: url.description ?? null,
      siteName: url.siteName ?? null,
      failureReason: url.failureReason ?? null,
      readableText: url.readableText,
    },
    null,
    2,
  );
}

function artifactTypeLabel(artifactType: string) {
  if (artifactType === "plain_text") return "Text artifact";
  if (artifactType === "html") return "HTML artifact";
  if (artifactType === "svg") return "SVG artifact";
  if (artifactType === "mermaid") return "Mermaid diagram";
  if (artifactType === "json") return "JSON artifact";
  if (artifactType === "csv") return "CSV artifact";
  if (artifactType === "code") return "Code artifact";
  return "Artifact";
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

function sourceFileExtension(language: string) {
  const normalized = language.toLowerCase();
  if (normalized === "plain_text") return "txt";
  if (normalized === "javascript") return "js";
  if (normalized === "typescript") return "ts";
  if (normalized === "markdown") return "md";
  return normalized.replace(/[^a-z0-9]+/g, "-") || "txt";
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
      <p className="text-[12px] font-medium text-muted-foreground">Memuat artifact…</p>
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
