"use client";

import {
  AlertCircleIcon,
  ChevronRightIcon,
  InfoIcon,
  Loader2Icon,
  RotateCcwIcon,
} from "@aqsha/ui/icons";
import { useState } from "react";
import { CopyCitationButton } from "@/components/citation/copy-citation-button";
import { PropertyLink, PropertyRow } from "@/components/detail/property-list";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ArtifactId } from "@/lib/convex-refs";
import { toArtifactId } from "@/lib/convex-refs";
import { cn } from "@/lib/utils";
import {
  formatCitation,
  type CitationFormat,
  type CitationInput,
} from "@/features/explore/utils/citation";
import type {
  ArtifactRenderPayload,
  PaperExtractionStatus,
} from "./artifact-render-panels";
import { derivePaperMetadataView } from "../utils/paper-metadata-model";

export type ArtifactSidebarRecord = {
  artifactType: string;
  artifactFamily?: string;
  source?: string;
  language?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  byteSize?: number | null;
  indexingStatus?: "not_indexed" | "pending" | "ready" | "failed";
  indexingFailureReason?: string | null;
  detectedDocumentKind?: "generic" | "scholarly_paper" | null;
  indexedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

type NonMarkdownPayload = Exclude<ArtifactRenderPayload, { artifactType: "markdown" }>;
type PaperMetadata = NonNullable<NonNullable<PaperExtractionStatus>["metadata"]>;

type ArtifactMetadataProps = {
  artifact: ArtifactSidebarRecord;
  payload: NonMarkdownPayload;
  title: string;
  paperExtraction?: PaperExtractionStatus;
  artifactId: string;
  retryGrobidExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
  retryUrlExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
};

const citationFormats: Array<{ value: CitationFormat; label: string }> = [
  { value: "bibtex", label: "BibTeX" },
  { value: "markdown", label: "Markdown" },
  { value: "plain", label: "Plain text" },
];

/**
 * Trigger + popover that holds all of an artifact's metadata. Lives in the
 * detail header so the reading column can stay flush and content-focused.
 */
export function ArtifactMetadataPopover(props: ArtifactMetadataProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Details"
          title="Details"
        >
          <InfoIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[72svh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-4"
      >
        <ArtifactMetadataPanel {...props} />
      </PopoverContent>
    </Popover>
  );
}

export function ArtifactMetadataPanel({
  artifact,
  payload,
  title,
  paperExtraction,
  artifactId,
  retryGrobidExtraction,
  retryUrlExtraction,
}: ArtifactMetadataProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isPdf = payload.artifactType === "pdf";
  // A paper artifact can be a downloaded PDF (uploaded or ingested from a URL)
  // or a URL kept as metadata-only when no open-access PDF was available.
  // Surface whatever metadata is usable regardless of `detectedDocumentKind`.
  const { metadata } = derivePaperMetadataView({ isPdf, paperExtraction });
  const urlPayload = payload.artifactType === "url" ? payload : null;
  const filePayload =
    payload.artifactType === "pdf" || payload.artifactType === "docx" ? payload : null;

  const authors = metadata
    ? metadata.authors.flatMap((author) => (author.name ? [author.name] : []))
    : [];
  const formatValue = artifact.mimeType ?? artifact.language;

  return (
    <div className="space-y-5">
      <PaperStatusBanner
        payload={payload}
        paperExtraction={paperExtraction}
        artifactId={artifactId}
        retryGrobidExtraction={retryGrobidExtraction}
        retryUrlExtraction={retryUrlExtraction}
      />

      <section>
        <h2 className="mb-4 text-[12px] font-semibold text-muted-foreground">About</h2>
        <div className="space-y-4">
          <PropertyRow label="Type" value={friendlyTypeLabel(payload.artifactType)} badge />
          <PropertyRow label="Added" value={addedLabel(artifact.source, artifact.createdAt)} />
          <IndexStatusRow
            status={artifact.indexingStatus}
            reason={artifact.indexingFailureReason}
          />

          {authors.length > 0 ? (
            <PropertyRow label="Authors" value={authors.join(", ")} />
          ) : null}
          {metadata?.journal ? (
            <PropertyRow label="Journal" value={journalLabel(metadata)} />
          ) : null}
          {metadata?.doi ? (
            <PropertyLink
              label="DOI"
              value={metadata.doi}
              href={`https://doi.org/${metadata.doi}`}
            />
          ) : null}

          {urlPayload?.siteName ? (
            <PropertyRow label="Site" value={urlPayload.siteName} />
          ) : null}
          {urlPayload ? (
            <PropertyLink
              label="Link"
              value={shortenLocator(urlPayload.normalizedUrl)}
              href={urlPayload.normalizedUrl}
            />
          ) : null}
        </div>

        {metadata && metadata.keywords.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {metadata.keywords.slice(0, 6).map((keyword) => (
              <span
                key={keyword}
                className="rounded-md bg-lemon-soft px-2 py-1 text-xs font-semibold text-lemon-foreground"
              >
                {keyword}
              </span>
            ))}
          </div>
        ) : null}

        {urlPayload?.description ? (
          <p className="mt-4 text-[13px] leading-6 text-muted-foreground">
            {urlPayload.description}
          </p>
        ) : null}
      </section>

      {metadata?.abstract ? <AbstractBlock abstract={metadata.abstract} /> : null}

      {metadata ? (
        <section className="border-t border-border pt-4">
          <h2 className="mb-3 text-[12px] font-semibold text-muted-foreground">Cite</h2>
          <div className="space-y-2">
            {citationFormats.map((format) => (
              <CopyCitationButton
                key={format.value}
                value={formatCitation(
                  paperCitationInput(
                    metadata,
                    title,
                    filePayload?.url ?? urlPayload?.normalizedUrl ?? "",
                  ),
                  format.value,
                )}
              >
                {format.label}
              </CopyCitationButton>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          className="flex w-full items-center gap-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={showDetails}
        >
          <ChevronRightIcon
            className={cn("size-3.5 transition-transform", showDetails && "rotate-90")}
          />
          Details
        </button>
        {showDetails ? (
          <div className="mt-4 space-y-4">
            {formatValue ? <PropertyRow label="Format" value={formatValue} /> : null}
            {typeof artifact.byteSize === "number" && artifact.byteSize > 0 ? (
              <PropertyRow label="Size" value={formatBytes(artifact.byteSize)} />
            ) : null}
            {artifact.fileName ? <PropertyRow label="File" value={artifact.fileName} /> : null}
            <PropertyRow label="Last updated" value={formatDate(artifact.updatedAt)} />
            {artifact.indexedAt ? (
              <PropertyRow label="Indexed" value={formatDate(artifact.indexedAt)} />
            ) : null}
            {typeof metadata?.confidence === "number" ? (
              <PropertyRow
                label="Metadata confidence"
                value={`${Math.round(metadata.confidence * 100)}%`}
              />
            ) : null}
            {metadata && metadata.affiliations.length > 0 ? (
              <PropertyRow label="Affiliations" value={metadata.affiliations.join(", ")} />
            ) : null}
            {urlPayload && urlPayload.originalUrl !== urlPayload.normalizedUrl ? (
              <PropertyLink
                label="Original link"
                value={shortenLocator(urlPayload.originalUrl)}
                href={urlPayload.originalUrl}
              />
            ) : null}
            {urlPayload?.title ? (
              <PropertyRow label="Page title" value={urlPayload.title} />
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Slim inline banner for paper/url extraction state. Rendered both above the
 * reader (so it's visible without opening the popover) and inside the panel.
 */
export function PaperStatusBanner({
  payload,
  paperExtraction,
  artifactId,
  retryGrobidExtraction,
  retryUrlExtraction,
}: {
  payload: NonMarkdownPayload;
  paperExtraction?: PaperExtractionStatus;
  artifactId: string;
  retryGrobidExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
  retryUrlExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
}) {
  const isPdf = payload.artifactType === "pdf";
  const { paperPending, paperFailed } = derivePaperMetadataView({ isPdf, paperExtraction });
  const urlFailed = payload.artifactType === "url" && payload.status === "failed";

  if (!paperPending && !paperFailed && !urlFailed) return null;

  return (
    <div className="space-y-3">
      {paperFailed ? (
        <StatusFailure
          message="We couldn't read this paper's details."
          onRetry={() => void retryGrobidExtraction({ artifactId: toArtifactId(artifactId) })}
        />
      ) : null}
      {urlFailed ? (
        <StatusFailure
          message="We couldn't read this page."
          onRetry={() => void retryUrlExtraction({ artifactId: toArtifactId(artifactId) })}
        />
      ) : null}
      {paperPending ? <StatusPending message="Reading paper details…" /> : null}
    </div>
  );
}

export function MarkdownArtifactDetails({ artifact }: { artifact: ArtifactSidebarRecord }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Details"
          title="Details"
        >
          <InfoIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[72svh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-4"
      >
        <MarkdownArtifactInfo artifact={artifact} />
      </PopoverContent>
    </Popover>
  );
}

/** Inner metadata content for a markdown document (popover/menu-agnostic). */
export function MarkdownArtifactInfo({ artifact }: { artifact: ArtifactSidebarRecord }) {
  return (
    <section>
      <h2 className="mb-4 text-[12px] font-semibold text-muted-foreground">About</h2>
      <div className="space-y-4">
        <PropertyRow label="Type" value="Document" badge />
        <PropertyRow label="Source" value={markdownSourceLabel(artifact.source)} />
        <IndexStatusRow
          status={artifact.indexingStatus}
          reason={artifact.indexingFailureReason}
        />
        <PropertyRow label="Created" value={formatDate(artifact.createdAt)} />
        <PropertyRow label="Updated" value={formatDate(artifact.updatedAt)} />
      </div>
    </section>
  );
}

function AbstractBlock({ abstract }: { abstract: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = abstract.length > 320;

  return (
    <section className="border-t border-border pt-4">
      <h2 className="mb-2 text-[12px] font-semibold text-muted-foreground">Abstract</h2>
      <p
        className={cn(
          "text-[13px] leading-6 text-foreground",
          !expanded && isLong && "line-clamp-6",
        )}
      >
        {abstract}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </section>
  );
}

function StatusPending({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-border bg-muted/40 p-3 text-[12px] font-medium text-muted-foreground">
      <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
      {message}
    </div>
  );
}

function StatusFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-[8px] border border-destructive/30 bg-destructive/5 p-3">
      <p className="inline-flex items-start gap-1.5 text-[12px] font-medium text-destructive">
        <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
        {message}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="shrink-0 gap-1 px-1.5 text-muted-foreground"
        onClick={onRetry}
      >
        <RotateCcwIcon className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}

function indexingDisplay(status?: "not_indexed" | "pending" | "ready" | "failed") {
  switch (status) {
    case "ready":
      return { label: "Indexed", tone: "bg-mint-foreground" };
    case "pending":
      return { label: "Indexing", tone: "bg-lemon-foreground" };
    case "failed":
      return { label: "Indexing failed", tone: "bg-destructive" };
    default:
      return { label: "Not indexed", tone: "bg-muted-foreground/50" };
  }
}

function IndexStatusRow({
  status,
  reason,
}: {
  status?: "not_indexed" | "pending" | "ready" | "failed";
  reason?: string | null;
}) {
  const { label, tone } = indexingDisplay(status);
  return (
    <div>
      <dt className="text-[12px] font-medium text-muted-foreground">Index</dt>
      <dd className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-foreground">
        {status === "pending" ? (
          <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn("size-1.5 rounded-full", tone)} />
        )}
        {label}
      </dd>
      {status === "failed" && reason ? (
        <p className="mt-1 text-[12px] leading-5 text-destructive">{reason}</p>
      ) : null}
    </div>
  );
}

function paperCitationInput(
  metadata: PaperMetadata,
  fallbackTitle: string,
  fallbackUrl: string,
): CitationInput {
  return {
    title: metadata.title ?? fallbackTitle,
    authors: metadata.authors.flatMap((author) =>
      author.name ? [author.name] : [],
    ),
    url: metadata.doi ? `https://doi.org/${metadata.doi}` : fallbackUrl,
    doi: metadata.doi,
    year: metadata.publishedYear,
    venue: metadata.journal ?? metadata.publisher,
  };
}

function journalLabel(metadata: PaperMetadata) {
  if (metadata.publishedYear) {
    return `${metadata.journal} (${metadata.publishedYear})`;
  }
  return metadata.journal ?? "";
}

function friendlyTypeLabel(artifactType: string) {
  switch (artifactType) {
    case "markdown":
      return "Document";
    case "plain_text":
      return "Note";
    case "code":
      return "Code";
    case "pdf":
      return "PDF";
    case "docx":
      return "Word doc";
    case "html":
      return "Web page";
    case "svg":
      return "Image";
    case "mermaid":
      return "Diagram";
    case "json":
      return "Data";
    case "csv":
      return "Table";
    case "url":
      return "Web link";
    default:
      return "Artifact";
  }
}

function addedLabel(source: string | undefined, createdAt: number) {
  const verb =
    source === "upload"
      ? "Uploaded"
      : source === "agent"
        ? "Added by the agent"
        : source === "url"
          ? "Saved"
          : "Created";
  return `${verb} · ${formatDate(createdAt)}`;
}

function markdownSourceLabel(source: string | undefined) {
  if (source === "upload") return "Uploaded";
  if (source === "agent") return "From the agent";
  if (source === "url") return "Saved link";
  return "Created here";
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(size: number) {
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

function shortenLocator(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/^doi\.org\//i, "");
}
