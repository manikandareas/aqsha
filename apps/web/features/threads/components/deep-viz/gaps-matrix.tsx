"use client";

import type { GapsMatrixBlock } from "@aqsha/chat-core/deep-viz";
import { DESIGN_BUCKET_LABELS } from "./labels";

/**
 * Matriks celah riset (heatmap outcome × desain studi, ala Consensus): sel = blok warna penuh
 * dengan count SELALU tertulis (nilai tak pernah color-alone); intensitas = skala SEKUENSIAL
 * satu hue (`--lavender` via color-mix, dinormalisasi per-matrix, dark/light adaptif). Sel 0 =
 * polos "–" → celah riset terlihat sebagai "lubang". Kolom pertama sticky + `overflow-x-auto`.
 */
export function GapsMatrix({ block }: { block: GapsMatrixBlock }) {
  const max = Math.max(1, ...block.cells.flat());
  // 14%..58% dari hue lavender — monoton naik, teks foreground tetap terbaca di dua mode.
  const cellBg = (value: number): string | undefined =>
    value > 0
      ? `color-mix(in oklab, var(--lavender) ${Math.round(14 + (value / max) * 44)}%, var(--card))`
      : undefined;

  return (
    <div className="grid min-w-0 gap-2">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-[2px] text-[12.5px]">
          <thead>
            <tr className="text-[12px] text-foreground">
              <th className="sticky left-0 z-10 w-[24%] bg-background py-2.5 pr-3 text-left align-bottom font-semibold">
                Topik/outcome
              </th>
              {block.cols.map((col) => (
                <th key={col} className="px-2 py-2.5 text-left align-bottom font-semibold leading-4">
                  {DESIGN_BUCKET_LABELS[col]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-background py-1.5 pr-3 text-left align-middle font-medium text-foreground"
                >
                  <span className="block truncate" title={row}>
                    {row}
                  </span>
                </th>
                {block.cols.map((col, ci) => {
                  const value = block.cells[ri]?.[ci] ?? 0;
                  return (
                    <td key={col} className="p-0">
                      <div
                        className="flex h-11 items-center justify-center rounded-sm font-medium text-foreground tabular-nums"
                        style={{ background: cellBg(value) }}
                        title={`${row} × ${DESIGN_BUCKET_LABELS[col]}: ${value} paper`}
                      >
                        {value > 0 ? value : <span className="text-muted-foreground/50">–</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground/70 leading-4">
        Warna lebih pekat = lebih banyak paper; sel &ldquo;–&rdquo; = belum ada studi (celah riset).
      </p>
    </div>
  );
}
