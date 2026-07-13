"use client";

import { AlertCircleIcon, TableIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import type { DatasetProfileColumn, DeepStepDetail } from "../../lib/timeline-types";

type DatasetProfileDetail = Extract<DeepStepDetail, { kind: "dataset-profile" }>;

/** Di atas ini kolom di-collapse ("+n kolom lagi") supaya dataset lebar tak membanjiri chat. */
const COLUMN_PREVIEW_MAX = 24;

/** Label tipe kolom manusiawi; Likert menang (info paling actionable untuk uji instrumen). */
function typeLabel(column: DatasetProfileColumn): string {
  if (column.likert) return `Likert ${column.likert}`;
  switch (column.type) {
    case "numeric":
      return "numerik";
    case "categorical":
      return "kategorik";
    case "text":
      return "teks";
    default:
      return column.type;
  }
}

/**
 * Kartu dataset — hasil `profile_dataset` sebagai objek yang terasa nyata di chat (fase A):
 * header shape ("n baris × m kolom"), chip per kolom (tipe terdeteksi + warning missing),
 * footer total sel kosong. Field profil yang tak terbaca disembunyikan, bukan crash
 * (parse defensif di `datasetProfileSummary`).
 */
export function DatasetProfileCard({ detail }: { detail: DatasetProfileDetail }) {
  const { profile } = detail;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? profile.columns : profile.columns.slice(0, COLUMN_PREVIEW_MAX);
  const hiddenCount = profile.columns.length - visible.length;

  const missingCells = profile.columns.reduce((sum, c) => sum + c.missing, 0);
  const missingColumns = profile.columns.filter((c) => c.missing > 0).length;
  const shape = [
    ...(profile.rowCount !== undefined ? [`${profile.rowCount} baris`] : []),
    `${profile.columns.length} kolom`,
  ].join(" × ");

  return (
    <div className="my-0.5 flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/20 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <TableIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium text-foreground">Dataset</span>
        <span className="shrink-0 text-[12px] text-muted-foreground">{shape}</span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {visible.map((column) => (
          <span
            key={column.name}
            className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background/60 px-1.5 py-0.5 text-[11px]"
          >
            <span className="truncate font-medium text-foreground">{column.name}</span>
            <span className="shrink-0 text-muted-foreground">{typeLabel(column)}</span>
            {column.missing > 0 ? (
              <AlertCircleIcon
                className="size-3 shrink-0 text-amber-500"
                aria-label={`${column.missing} sel kosong`}
              />
            ) : null}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            +{hiddenCount} kolom lagi
          </button>
        ) : null}
      </div>
      {missingCells > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {missingCells} sel kosong di {missingColumns} kolom
        </p>
      ) : null}
    </div>
  );
}
