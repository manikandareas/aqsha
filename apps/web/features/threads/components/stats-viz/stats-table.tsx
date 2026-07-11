"use client";

import type { StatsTableBlock } from "@aqsha/chat-core/stats-viz";
import { useStatsViz } from "./stats-context";

/** Format sel angka gaya SPSS-ID: desimal koma, 3 angka di belakang (kecuali bilangan bulat/count). */
function formatCell(value: number | string | null): string {
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(".", ",");
}

/**
 * Tabel gaya output SPSS: judul "Tabel n: …", header kolom, baris angka (desimal koma),
 * catatan kaki (a., b., …). Nomor "Tabel n" di-assign provider (urutan dokumen). Wrapper
 * `overflow-x-auto` supaya tabel lebar bisa di-scroll di mobile tanpa merusak layout.
 */
export function StatsTable({ block }: { block: StatsTableBlock }) {
  const ctx = useStatsViz();
  const number = block.tableNumber ?? ctx?.assignTable(block.id) ?? 0;
  const label = number > 0 ? `Tabel ${number}` : "Tabel";
  const { table } = block;
  return (
    <figure className="stats-viz my-5 min-w-0 not-prose">
      <figcaption className="mb-2 flex min-w-0 items-baseline gap-2 text-[12px] leading-4">
        <span className="shrink-0 font-medium font-mono text-muted-foreground/80 tracking-wide">
          {label}
        </span>
        <span className="min-w-0 font-semibold text-foreground">{table.title}</span>
      </figcaption>
      <div className="min-w-0 overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-left text-[12.5px]">
          {table.columns.length > 0 ? (
            <thead>
              <tr className="border-b bg-muted/40 text-[12px] text-foreground">
                {table.columns.map((col, i) => (
                  <th
                    key={`${i}-${col}`}
                    className={`px-3 py-2 font-semibold ${i === 0 ? "" : "text-right tabular-nums"}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="border-b border-border/60 align-top last:border-b-0">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-2 ${
                      c === 0 ? "font-medium text-foreground" : "text-right tabular-nums text-muted-foreground"
                    }`}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.notes.length > 0 ? (
        <div className="mt-1.5 space-y-0.5">
          {table.notes.map((note, i) => (
            <p key={i} className="text-[11px] text-muted-foreground/80 leading-4">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </figure>
  );
}
