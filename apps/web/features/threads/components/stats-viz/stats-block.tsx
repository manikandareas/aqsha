"use client";

import {
  referencedRunKeys,
  type StatsBlock,
  type StatsGroup,
} from "@aqsha/chat-core/stats-viz";
import { Component, type ReactNode } from "react";
import { StatsDecisionCard } from "./stats-decision";
import { useStatsViz } from "./stats-context";
import { StatsFigure } from "./stats-figure";
import { StatsTable } from "./stats-table";

/**
 * Renderer element `<statsviz runkey="…">` (hasil transform rehype dari penanda
 * `{{stats:<runKey>}}`) untuk Streamdown. Gerbang anti-pemalsuan: tanpa `StatsBlocksProvider`
 * (pesan tanpa hasil analisis) ATAU `runKey` tak punya blok ASLI di DB → render KOSONG
 * (penanda tak pernah bocor sebagai teks; fence/angka palsu model tak jadi tabel). Runtime
 * error satu grup ditangkap error boundary → fallback ringkas, bukan meruntuhkan jawaban.
 */
export function StatsVizMarkdownComponent(props: Record<string, unknown>) {
  const runKey = typeof props.runkey === "string" ? props.runkey : "";
  const ctx = useStatsViz();
  if (!ctx || !runKey) return null;
  const group = ctx.groups.get(runKey);
  if (!group) return null;
  return (
    <StatsErrorBoundary>
      <StatsVizGroup group={group} />
    </StatsErrorBoundary>
  );
}

/** Render semua blok satu grup uji (tabel → kartu verdict → figur) dalam urutan builder. */
export function StatsVizGroup({ group }: { group: StatsGroup }) {
  return (
    <div className="stats-viz-group min-w-0">
      {group.custom ? <CustomAnalysisBanner code={group.code} /> : null}
      {group.blocks.map((block) => (
        <StatsBlockBody key={block.id} block={block} />
      ))}
    </div>
  );
}

/**
 * Penanda hasil codegen fallback (`run_python_analysis`) — di luar katalog terverifikasi.
 * Toggle "Lihat kode" (auditability ala Julius AI): kode Python yang dieksekusi bisa diperiksa
 * saat sidang/pertanggungjawaban.
 */
function CustomAnalysisBanner({ code }: { code?: string }) {
  return (
    <div className="mt-4 mb-1 not-prose">
      <div className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
          Analisis kustom — di luar katalog terverifikasi
        </span>
      </div>
      {code ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground/80 hover:text-foreground">
            Lihat kode
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md border bg-muted/40 p-2.5 text-[11px] leading-4">
            <code>{code}</code>
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function StatsBlockBody({ block }: { block: StatsBlock }) {
  switch (block.type) {
    case "stats-table":
      return <StatsTable block={block} />;
    case "stats-decision":
      return <StatsDecisionCard block={block} />;
    case "stats-figure":
      return <StatsFigure block={block} />;
    default:
      return null;
  }
}

/**
 * Lampiran grup hasil yang TAK ditempatkan model via penanda di `text` — dirender setelah
 * jawaban (di dalam provider yang sama supaya penomoran Tabel/Gambar tetap menyambung).
 * Kosong bila semua grup sudah dirujuk penanda.
 */
export function StatsAppendix({
  text,
  groups,
}: {
  text: string;
  groups: Map<string, StatsGroup>;
}) {
  const referenced = new Set(referencedRunKeys(text));
  const unplaced = [...groups.values()].filter((g) => !referenced.has(g.runKey));
  if (unplaced.length === 0) return null;
  return (
    <div className="mt-4 min-w-0">
      <p className="mb-1 font-semibold text-[13px] text-foreground">Hasil analisis</p>
      {unplaced.map((group) => (
        <StatsVizGroup key={group.runKey} group={group} />
      ))}
    </div>
  );
}

/** Fallback ringkas saat runtime error render blok — bukan crash seluruh jawaban. */
class StatsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <div className="my-4 rounded-xl border border-dashed bg-muted/30 p-3 text-[12px] text-muted-foreground not-prose">
          Hasil analisis tidak dapat dimuat.
        </div>
      );
    }
    return this.props.children;
  }
}
