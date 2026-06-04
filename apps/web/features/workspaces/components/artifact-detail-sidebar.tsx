"use client";

import { AlertCircleIcon, ChevronRightIcon, RotateCcwIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { CopyCitationButton } from "@/components/citation/copy-citation-button";
import { PropertyLink, PropertyRow } from "@/components/detail/property-list";
import { Button } from "@/components/ui/button";
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

export type ArtifactSidebarRecord = {
  artifactType: string;
  artifactFamily?: string;
  source?: string;
  language?: string;
  mimeType?: string;
  fileName?: string;
  byteSize?: number;
  indexingStatus?: "not_indexed" | "pending" | "ready" | "failed";
  indexingFailureReason?: string;
  detectedDocumentKind?: "generic" | "scholarly_paper";
  indexedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type PaperMetadata = NonNullable<NonNullable<PaperExtractionStatus>["metadata"]>;

const citationFormats: Array<{ value: CitationFormat; label: string }> = [
  { value: "bibtex", label: "BibTeX" },
  { value: "markdown", label: "Markdown" },
  { value: "plain", label: "Plain text" },
];

export function ArtifactDetailSidebar({
  artifact,
  payload,
  title,
  paperExtraction,
  artifactId,
  retryGrobidExtraction,
  retryUrlExtraction,
}: {
  artifact: ArtifactSidebarRecord;
  payload: Exclude<ArtifactRenderPayload, { artifactType: "markdown" }>;
  title: string;
  paperExtraction?: PaperExtractionStatus;
  artifactId: string;
  retryGrobidExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
  retryUrlExtraction: (args: { artifactId: ArtifactId }) => Promise<unknown>;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const isPdf = payload.artifactType === "pdf";
  const isScholarly = isPdf && artifact.detectedDocumentKind === "scholarly_paper";
  const metadata = isScholarly ? paperExtraction?.metadata ?? null : null;
  const urlPayload = payload.artifactType === "url" ? payload : null;
  const filePayload =
    payload.artifactType === "pdf" || payload.artifactType === "docx" ? payload : null;

  const paperFailed = isPdf && paperExtraction?.extraction?.status === "failed";
  const urlFailed = urlPayload?.status === "failed";

  const authors = metadata
    ? metadata.authors.flatMap((author) => (author.name ? [author.name] : []))
    : [];
  const formatValue = artifact.mimeType ?? artifact.language;

  return (
    <aside className="space-y-6 pt-2 lg:sticky lg:top-6 lg:self-start">
      {paperFailed ? (
        <SidebarFailure
          message="We couldn't read this paper's details."
          onRetry={() => void retryGrobidExtraction({ artifactId: toArtifactId(artifactId) })}
        />
      ) : null}
      {urlFailed ? (
        <SidebarFailure
          message="We couldn't read this page."
          onRetry={() => void retryUrlExtraction({ artifactId: toArtifactId(artifactId) })}
        />
      ) : null}

      <section>
        <h2 className="mb-4 text-[12px] font-semibold text-muted-foreground">About</h2>
        <div className="space-y-4">
          <PropertyRow label="Type" value={friendlyTypeLabel(payload.artifactType)} badge />
          <PropertyRow label="Added" value={addedLabel(artifact.source, artifact.createdAt)} />

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

      {metadata ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold text-muted-foreground">Cite</h2>
          <div className="space-y-2">
            {citationFormats.map((format) => (
              <CopyCitationButton
                key={format.value}
                value={formatCitation(
                  paperCitationInput(metadata, title, filePayload?.url ?? ""),
                  format.value,
                )}
              >
                {format.label}
              </CopyCitationButton>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-t border-border pt-5">
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
    </aside>
  );
}

function SidebarFailure({
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
