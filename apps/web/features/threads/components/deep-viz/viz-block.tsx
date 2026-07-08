"use client";

import { parseDeepVizBlock, type DeepVizBlock } from "@aqsha/chat-core/deep-viz";
import { Component, useMemo, type ReactNode } from "react";
import { useCitationMap } from "@/components/ai-elements/inline-citation";
import { sourceHref } from "../../lib/source-card";
import { ClaimsEvidence } from "./claims-evidence";
import { ConsensusMeter } from "./consensus-meter";
import { GapsMatrix } from "./gaps-matrix";
import { OpenQuestions } from "./open-questions";
import { ResultsTimeline } from "./results-timeline";
import { TopContributors } from "./top-contributors";
import { useVizFigureAssign } from "./viz-context";

/**
 * Renderer element `<deepviz payload="…">` (hasil transform `reportRehypePlugin`) untuk
 * Streamdown — blok evidence viz laporan `/deep`. Tanpa `VizFigureProvider` (pesan non-deep)
 * payload dirender sebagai code block polos: fence `aqsha:viz` di chat biasa pasti tulisan
 * model, bukan keluaran injector (anti-pemalsuan). `payload` divalidasi `parseDeepVizBlock`
 * (zod contract chat-core, di-memo — payload multi-KB tak perlu diparse ulang tiap render):
 * JSON korup / `v` tak dikenal / `type` tak dikenal → kotak fallback ringkas + expander JSON,
 * BUKAN crash; runtime error komponen ditangkap error boundary dengan fallback yang sama.
 */
export function DeepVizMarkdownComponent(props: Record<string, unknown>) {
  const payload = typeof props.payload === "string" ? props.payload : "";
  const assignFigure = useVizFigureAssign();
  const block = useMemo(() => (payload ? parseDeepVizBlock(payload) : null), [payload]);
  if (!assignFigure) return <VizPlainCode payload={payload} />;
  if (!block) return <VizFallback payload={payload} />;
  // Nomor figur: `block.figure` di-stamp injector sesuai urutan dokumen final; fallback
  // registry mount-order untuk laporan lama yang dipersist sebelum field itu ada.
  const figure = block.figure ?? assignFigure(block.id);
  return (
    <VizErrorBoundary payload={payload}>
      <VizFigure figure={figure} block={block} />
    </VizErrorBoundary>
  );
}

/** Render polos fence `aqsha:viz` di luar laporan `/deep` — tampil sebagai kode, bukan figur. */
function VizPlainCode({ payload }: { payload: string }) {
  return (
    <pre className="overflow-x-auto">
      <code>{payload}</code>
    </pre>
  );
}

/** Judul seksi di ATAS konten (ala Consensus) — meter konsensus tanpa judul generik
 * (pertanyaannya sendiri yang jadi judul). */
const VIZ_TITLES: Partial<Record<DeepVizBlock["type"], string>> = {
  "results-timeline": "Timeline publikasi",
  "top-contributors": "Kontributor teratas",
  "claims-evidence": "Tabel klaim & bukti",
  "gaps-matrix": "Celah riset",
  "open-questions": "Pertanyaan riset terbuka",
};

/** Deskripsi caption "Gambar n" di BAWAH konten (sentence case, jujur soal metode). */
function vizCaption(block: DeepVizBlock): string {
  switch (block.type) {
    case "consensus-meter":
      return `Sebaran temuan ${block.n} paper terhadap sub-pertanyaan; klasifikasi berdasar judul + abstrak/snippet (bukan teks penuh).`;
    case "results-timeline":
      return "Timeline publikasi paper yang disertakan; marker lebih besar = lebih banyak sitasi.";
    case "top-contributors":
      return "Author & jurnal yang paling sering muncul pada paper yang disertakan.";
    case "claims-evidence":
      return "Klaim kunci beserta kekuatan bukti pendukung yang teridentifikasi dari paper.";
    case "gaps-matrix":
      return "Jumlah studi per topik/outcome dan desain studi; sel kosong = celah riset.";
    case "open-questions":
      return "Pertanyaan terbuka yang menyoroti arah riset selanjutnya.";
  }
}

/**
 * Frame figur ala artikel ilmiah (referensi Consensus): judul tebal di atas, konten flush
 * (tanpa kotak card — hairline dibawa masing-masing blok), caption "Gambar n" + deskripsi
 * kecil di bawah.
 */
function VizFigure({ figure, block }: { figure: number; block: DeepVizBlock }) {
  const label = Number.isFinite(figure) && figure > 0 ? `Gambar ${figure}` : "Gambar";
  const title = VIZ_TITLES[block.type];
  return (
    <figure className="deep-viz my-6 min-w-0 not-prose">
      {title ? (
        <p className="mb-3 font-semibold text-[15px] text-foreground leading-6">{title}</p>
      ) : null}
      <VizBlockBody block={block} />
      <figcaption className="mt-3 flex min-w-0 items-baseline gap-2 text-[11px] leading-4">
        <span className="shrink-0 font-medium font-mono text-muted-foreground/80 tracking-wide">
          {label}
        </span>
        <span className="min-w-0 text-muted-foreground">{vizCaption(block)}</span>
      </figcaption>
    </figure>
  );
}

function VizBlockBody({ block }: { block: DeepVizBlock }) {
  switch (block.type) {
    case "consensus-meter":
      return <ConsensusMeter block={block} />;
    case "results-timeline":
      return <ResultsTimeline block={block} />;
    case "top-contributors":
      return <TopContributors block={block} />;
    case "claims-evidence":
      return <ClaimsEvidence block={block} />;
    case "gaps-matrix":
      return <GapsMatrix block={block} />;
    case "open-questions":
      return <OpenQuestions block={block} />;
    default:
      return null;
  }
}

/** Fallback ringkas saat payload korup/tak dikenal — bukan crash, JSON tetap bisa diintip. */
function VizFallback({ payload }: { payload: string }) {
  return (
    <div className="my-4 rounded-xl border border-dashed bg-muted/30 p-3 text-[12px] text-muted-foreground not-prose">
      <p>Visual tidak dapat dimuat.</p>
      {payload ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground/70">
            Lihat data mentah
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 text-[10px] leading-4">
            {payload}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** Error boundary per blok: runtime error satu visual tak boleh merobohkan seluruh laporan. */
class VizErrorBoundary extends Component<
  { payload: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <VizFallback payload={this.props.payload} />;
    return this.props.children;
  }
}

/**
 * Pill nomor paper `[n]` kompak untuk tabel viz (kolom Papers) — resolve ke kartu sumber lewat
 * `CitationProvider` yang SUDAH membungkus laporan. Nomor tanpa kartu ter-resolve tetap tampil
 * sebagai teks `[n]` (degradasi mulus). Maksimal `max` pill; sisanya diringkas "+n lainnya".
 */
export function PaperPills({ papers, max = 3 }: { papers: number[]; max?: number }) {
  const map = useCitationMap();
  const shown = papers.slice(0, max);
  const extra = papers.length - shown.length;
  const chipClass =
    "inline-flex items-center rounded-md bg-muted px-2 py-1 font-medium font-mono text-[10px] text-muted-foreground leading-none tabular-nums transition-colors hover:bg-accent hover:text-foreground";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {shown.map((n) => {
        const card = map?.get(n)?.[0];
        const href = card ? sourceHref(card) : null;
        const pill = <span className={chipClass}>[{n}]</span>;
        return href ? (
          <a
            key={n}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={card?.title}
            className="no-underline"
          >
            {pill}
          </a>
        ) : (
          <span key={n} title={card?.title}>
            {pill}
          </span>
        );
      })}
      {extra > 0 ? (
        <span
          className={chipClass}
          title={papers
            .slice(max)
            .map((n) => `[${n}]`)
            .join(" ")}
        >
          +{extra} lagi
        </span>
      ) : null}
    </span>
  );
}
