"use client";

import { FileTextIcon, FolderIcon, UploadIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import { LibraryArtifactCard } from "@/components/library-artifact-card";
import { libraryArtifactGridClass } from "@/lib/library-grid";

// Decorative sample cards rendered (blurred) behind the empty-state CTA so a
// fresh library hints at what saved research will look like. Titles resemble
// real papers; purely cosmetic — the layer is `inert` (no pointer/focus/a11y).
const SAMPLE_CARDS: Array<{
  title: string;
  artifactType?: string;
  source: "manual" | "upload" | "agent" | "url";
  year: number;
}> = [
  {
    title: "Deep Residual Learning for Image Recognition",
    artifactType: "pdf",
    source: "upload",
    year: 2024,
  },
  {
    title: "A Survey of Large Language Models for Scientific Discovery",
    artifactType: "pdf",
    source: "upload",
    year: 2025,
  },
  {
    title: "Climate Tipping Points: Early-Warning Signals in Coupled Earth Systems",
    artifactType: "url",
    source: "url",
    year: 2023,
  },
  {
    title: "Reinforcement Learning from Human Feedback at Scale",
    source: "agent",
    year: 2025,
  },
  {
    title: "CRISPR-Cas9 Off-Target Effects: A Genome-Wide Meta-Analysis",
    artifactType: "pdf",
    source: "upload",
    year: 2022,
  },
  {
    title: "Transformer Architectures for Long-Horizon Time-Series Forecasting",
    source: "agent",
    year: 2024,
  },
];

const noop = () => {};

export function WorkspaceLibraryEmpty({
  variant,
  title,
  description,
  icon: Icon = FileTextIcon,
  showActions = true,
  // Defaults to following showActions: the genuinely-empty CTA teases samples,
  // while filtered-empty stays a plain box (samples there would mislead — the
  // items merely got filtered out). Section empties pass it explicitly.
  showSamples = showActions,
  onCreateFolder,
  onCreateDocument,
  onCreateUrl,
}: {
  variant: "root" | "folder";
  title?: string;
  description?: string;
  icon?: typeof FileTextIcon;
  showActions?: boolean;
  showSamples?: boolean;
  onCreateFolder?: () => void;
  onCreateDocument?: () => void;
  onCreateUrl?: () => void;
}) {
  const isRoot = variant === "root";
  const resolvedTitle = title ?? (isRoot ? "Kumpulkan paper-mu di sini" : "Folder ini masih kosong");
  const resolvedDescription =
    description ??
    (isRoot
      ? "Simpan dokumen, file, atau URL untuk mulai membangun perpustakaan risetmu."
      : "Tambahkan dokumen atau URL ke folder ini.");

  return (
    <div className="relative isolate min-h-[clamp(20rem,42svh,30rem)] overflow-hidden rounded-2xl border border-dashed border-border bg-muted/20">
      {showSamples ? (
        <>
          <div
            inert={true}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-2 select-none p-6"
          >
            <div className={libraryArtifactGridClass}>
              {SAMPLE_CARDS.map((card) => (
                <LibraryArtifactCard
                  key={card.title}
                  title={card.title}
                  artifactType={card.artifactType}
                  source={card.source}
                  // Mid-year so the displayed year is timezone-stable.
                  createdAt={Date.UTC(card.year, 5, 15)}
                  isSelected={false}
                  onClick={noop}
                />
              ))}
            </div>
          </div>
          {/* Frosted glass: blur the sample cards + a top→bottom vignette so
              the CTA stays legible and the cards dissolve toward the edges. */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/65 to-background/85 backdrop-blur-md" />
        </>
      ) : null}

      <div className="relative grid min-h-[inherit] place-items-center p-12 text-center">
        <div className="grid max-w-sm justify-items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl border border-border/70 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm">
            <Icon className="size-7" />
          </span>
          <h2 className="font-heading text-xl font-semibold">{resolvedTitle}</h2>
          <p className="max-w-xs text-[13px] font-medium leading-relaxed text-muted-foreground">
            {resolvedDescription}
          </p>
          {showActions ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {isRoot && onCreateFolder ? (
                <Button type="button" variant="outline" size="sm" onClick={onCreateFolder}>
                  <FolderIcon className="size-4" />
                  Folder
                </Button>
              ) : null}
              {onCreateDocument ? (
                <Button type="button" size="sm" onClick={onCreateDocument}>
                  <FileTextIcon className="size-4" />
                  Dokumen
                </Button>
              ) : null}
              {onCreateUrl ? (
                <Button type="button" variant="outline" size="sm" onClick={onCreateUrl}>
                  <UploadIcon className="size-4" />
                  Upload
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
