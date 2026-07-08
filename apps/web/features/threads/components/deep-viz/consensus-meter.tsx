"use client";

import {
  DEEP_VIZ_STUDY_DESIGNS,
  type ConsensusMeterBlock,
  type DeepVizStance,
} from "@aqsha/chat-core/deep-viz";
import { ChevronDownIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { DESIGN_ICONS, DESIGN_LABELS, STANCE_COLORS, STANCE_LABELS, STANCE_ORDER } from "./labels";

/**
 * Meter konsensus per sub-pertanyaan (ala Consensus.app): pertanyaan tebal + chip `N = x`,
 * kapsul stance dominan, bar bertumpuk TEBAL dengan angka di dalam segmen, legend berkolom
 * (dot + label + persen + chip ikon design), dan expander "Semua detail". Identitas tak
 * pernah color-alone (label + angka selalu tampil — relief WARN kontras validator dataviz).
 */

/** Ink angka DI DALAM segmen, dipilih by luminance fill (spec label-in-fill dataviz):
 * `no` (merah gelap) satu-satunya yang butuh putih; sisanya ink gelap. */
const STANCE_SEGMENT_INK: Record<DeepVizStance, string> = {
  yes: "#1f1d18",
  possibly: "#1f1d18",
  mixed: "#1f1d18",
  no: "#fdfbf6",
};

/** Angka muat di segmen hanya bila segmen cukup lebar (label tak boleh terpotong). */
const SEGMENT_LABEL_MIN_PCT = 5;

export function ConsensusMeter({ block }: { block: ConsensusMeterBlock }) {
  const [expanded, setExpanded] = useState(false);
  const visible = STANCE_ORDER.filter((stance) => block.stances[stance] > 0);
  const dominant = visible.reduce<DeepVizStance | null>(
    (best, stance) => (best === null || block.stances[stance] > block.stances[best] ? stance : best),
    null,
  );
  const pct = (count: number) => (block.n > 0 ? Math.round((count / block.n) * 100) : 0);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 flex-1 break-words font-semibold text-[14px] text-foreground leading-6">
          {block.question}
        </p>
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 font-medium font-mono text-[11px] text-muted-foreground leading-none tabular-nums">
          N = {block.n}
        </span>
      </div>
      {dominant ? (
        <div className="flex justify-end">
          <span className="inline-flex items-center rounded-full border bg-card px-3 py-1.5 font-medium text-[12px] text-foreground leading-none shadow-xs">
            {pct(block.stances[dominant])}% paper mengindikasikan &ldquo;{STANCE_LABELS[dominant]}&rdquo;
          </span>
        </div>
      ) : null}
      {/* Bar bertumpuk tebal — gap 2px antar segmen (surface gap dataviz), angka count di
          dalam segmen (rata kanan) hanya bila muat. */}
      <div
        className="flex h-6 w-full gap-0.5 overflow-hidden"
        role="img"
        aria-label={`Sebaran stance ${block.n} paper: ${visible
          .map((s) => `${STANCE_LABELS[s]} ${block.stances[s]}`)
          .join(", ")}`}
      >
        {visible.map((stance) => {
          const share = pct(block.stances[stance]);
          return (
            <div
              key={stance}
              className="flex h-full items-center justify-end rounded-[5px] pr-1.5"
              style={{
                width: `${(block.stances[stance] / block.n) * 100}%`,
                background: STANCE_COLORS[stance],
                minWidth: 8,
              }}
              title={`${STANCE_LABELS[stance]}: ${block.stances[stance]} paper (${share}%)`}
            >
              {share >= SEGMENT_LABEL_MIN_PCT ? (
                <span
                  className="font-semibold text-[11px] leading-none tabular-nums"
                  style={{ color: STANCE_SEGMENT_INK[stance] }}
                >
                  {block.stances[stance]}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[auto_minmax(4rem,auto)_3.25rem_1fr] items-center gap-x-3 gap-y-2">
        {visible.map((stance) => {
          const designs = block.designByStance[stance];
          const present = DEEP_VIZ_STUDY_DESIGNS.filter((d) => (designs[d] ?? 0) > 0);
          return (
            <div key={stance} className="contents">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: STANCE_COLORS[stance] }}
              />
              <span className="font-semibold text-[13px] text-foreground leading-5">
                {STANCE_LABELS[stance]}
              </span>
              <span className="text-[12px] text-muted-foreground leading-5 tabular-nums">
                {pct(block.stances[stance])}%
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {present.map((d) => {
                  const Icon = DESIGN_ICONS[d];
                  return (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-muted-foreground"
                      title={`${designs[d]} ${DESIGN_LABELS[d]}`}
                    >
                      <Icon className="size-3" />
                      <span className="text-[10px] leading-none tabular-nums">{designs[d]}</span>
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setExpanded((cur) => !cur)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 font-medium text-[12px] text-foreground leading-none transition-colors hover:bg-accent"
        >
          Semua detail
          <ChevronDownIcon
            className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {expanded ? (
        <ul className="grid gap-1 rounded-lg border bg-muted/20 p-3">
          {visible.map((stance) => {
            const designs = block.designByStance[stance];
            const breakdown = DEEP_VIZ_STUDY_DESIGNS.filter((d) => (designs[d] ?? 0) > 0)
              .map((d) => `${designs[d]} ${DESIGN_LABELS[d]}`)
              .join(", ");
            return (
              <li key={stance} className="text-[12px] leading-5">
                <span className="font-medium text-foreground">{STANCE_LABELS[stance]}</span>{" "}
                <span className="text-muted-foreground tabular-nums">
                  — {block.stances[stance]} paper ({pct(block.stances[stance])}%)
                  {breakdown ? `: ${breakdown}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
