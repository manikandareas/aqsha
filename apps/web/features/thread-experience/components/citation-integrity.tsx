"use client";

import { ChevronDownIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import type { ResearchSource } from "../types";

type IntegrityStatus = NonNullable<ResearchSource["integrityStatus"]>;

const STATUS_LABEL: Record<IntegrityStatus, string> = {
  verified: "Terverifikasi",
  metadata_mismatch: "Metadata tidak konsisten",
  identifier_invalid: "Identifier tidak valid",
  not_found: "Tidak ditemukan",
  unverifiable: "Belum terverifikasi",
};

// metadata_mismatch / identifier_invalid / not_found are the "needs review"
// statuses; verified is clean; unverifiable is neutral (provider couldn't say).
const FLAGGED: ReadonlySet<IntegrityStatus> = new Set<IntegrityStatus>([
  "metadata_mismatch",
  "identifier_invalid",
  "not_found",
]);

const STATUS_TONE: Record<IntegrityStatus, string> = {
  verified: "text-mint-foreground",
  metadata_mismatch: "text-coral-foreground",
  identifier_invalid: "text-coral-foreground",
  not_found: "text-coral-foreground",
  unverifiable: "text-muted-foreground",
};

const EVIDENCE_LABEL: Record<ResearchSource["evidenceStrength"], string> = {
  strong: "Bukti kuat",
  medium: "Bukti sedang",
  weak: "Bukti lemah",
};

function chipClass(tone?: string) {
  return cn(
    "inline-flex shrink-0 items-center rounded-[6px] border border-border/70 bg-muted/35 px-1.5 py-0.5 text-[11px] font-medium",
    tone ?? "text-muted-foreground",
  );
}

// Per-run citation-integrity summary (Track 2A). Renders the 4-step verdicts the
// auto-verify pass writes onto each researchSources row, plus the persisted-but-
// previously-unused evidenceStrength (AUD-19). Shown only for deep-research runs;
// degrades to a "verifying…" pending state while the post-run pass is in flight.
export function CitationIntegritySummary({
  sources,
  runCompleted,
}: {
  sources: ResearchSource[];
  runCompleted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const checked = sources.filter((source) => source.integrityStatus);

  // Nothing to show until the run finished and produced sources.
  if (sources.length === 0) {
    return null;
  }
  if (checked.length === 0) {
    return runCompleted ? (
      <div className="mt-2 text-[12px]">
        <Shimmer>Memverifikasi integritas sitasi…</Shimmer>
      </div>
    ) : null;
  }

  const verified = checked.filter((s) => s.integrityStatus === "verified").length;
  const flagged = checked.filter(
    (s) => s.integrityStatus && FLAGGED.has(s.integrityStatus),
  );
  const flaggedCount = flagged.length;
  const verdictTone =
    flaggedCount > 0 ? "text-coral-foreground" : "text-mint-foreground";

  return (
    <div className="mt-2 text-[12px] text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full items-center gap-1.5 text-left hover:text-foreground"
      >
        <span className="font-medium text-foreground">Integritas sitasi</span>
        <span className={chipClass(verdictTone)}>
          {verified}/{checked.length} terverifikasi
        </span>
        {flaggedCount > 0 ? (
          <span className={chipClass("text-coral-foreground")}>
            {flaggedCount} perlu ditinjau
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {open ? (
        <ul className="mt-2 grid gap-1.5 border-l border-border/70 pl-3">
          {checked.map((source) => (
            <li key={source._id} className="min-w-0">
              <div className="flex min-w-0 items-start gap-2">
                <span className="min-w-0 flex-1 break-words text-foreground">
                  {source.title}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={chipClass(
                    source.integrityStatus
                      ? STATUS_TONE[source.integrityStatus]
                      : undefined,
                  )}
                >
                  {source.integrityStatus
                    ? STATUS_LABEL[source.integrityStatus]
                    : "—"}
                </span>
                <span className={chipClass()}>
                  {EVIDENCE_LABEL[source.evidenceStrength]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Penanda bukan tuduhan — bisa karena salah ketik metadata atau basis data
        yang tidak lengkap.
      </p>
    </div>
  );
}
