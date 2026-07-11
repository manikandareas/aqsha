/// <reference path="./citation-js.d.ts" />
import { Cite, plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import "@citation-js/plugin-csl";
import type { CitationStyleId } from "@aqsha/db";
import type { CslItem } from "./citation-normalize";
import { apaCsl } from "./styles/apa";
import { chicagoAuthorDateCsl } from "./styles/chicago-author-date";
import { ieeeCsl } from "./styles/ieee";
import { localeEnUs } from "./styles/locale-en-us";
import { vancouverCsl } from "./styles/vancouver";

export const CITATION_STYLES: Array<{ id: CitationStyleId; label: string }> = [
  { id: "apa-7", label: "APA 7" },
  { id: "ieee", label: "IEEE" },
  { id: "vancouver", label: "Vancouver" },
  { id: "chicago-author-date", label: "Chicago author-date" },
];

export const CITATION_EXPORT_FORMATS = ["bibtex", "ris", "csl-json"] as const;
export type CitationExportFormat = (typeof CITATION_EXPORT_FORMATS)[number];

export function isCitationStyleId(value: string): value is CitationStyleId {
  return CITATION_STYLES.some((s) => s.id === value);
}

let stylesRegistered = false;

/** Registrasi style vendored + locale sekali per proses (server-side only, lihat ADR). */
function ensureStylesRegistered(): void {
  if (stylesRegistered) return;
  const cslConfig = plugins.config.get("@csl") as {
    styles: { add: (id: string, xml: string) => void };
    locales: { add: (id: string, xml: string) => void };
  };
  cslConfig.styles.add("apa-7", apaCsl);
  cslConfig.styles.add("ieee", ieeeCsl);
  cslConfig.styles.add("vancouver", vancouverCsl);
  cslConfig.styles.add("chicago-author-date", chicagoAuthorDateCsl);
  cslConfig.locales.add("en-US", localeEnUs);
  stylesRegistered = true;
}

/** citeproc butuh `id` unik per item — stamp bila belum ada. */
function withIds(items: CslItem[]): CslItem[] {
  return items.map((item, i) => ({ ...item, id: (item.id as string) ?? `item-${i}` }));
}

/**
 * Render satu entry bibliography per item (dipakai "Salin sitasi" + preview list).
 * Urutan output = urutan input; hasil map by id.
 */
export function renderBibliographyEntries(
  items: CslItem[],
  styleId: CitationStyleId,
): Array<{ id: string; text: string }> {
  ensureStylesRegistered();
  return withIds(items).map((item) => {
    const cite = new Cite([item], { generateGraph: false });
    const text = cite.format("bibliography", {
      format: "text",
      template: styleId,
      lang: "en-US",
    });
    return { id: String(item.id), text: text.trim() };
  });
}

/**
 * Render bibliography utuh. `sort: "author"` menyerahkan urutan ke style
 * (citeproc); `year`/`title` memaksa urutan eksplisit lalu render per-item.
 */
export function renderBibliography(
  items: CslItem[],
  styleId: CitationStyleId,
  sort: "author" | "year" | "title",
): string {
  ensureStylesRegistered();
  if (items.length === 0) return "";
  if (sort === "author") {
    const cite = new Cite(withIds(items), { generateGraph: false });
    return cite
      .format("bibliography", { format: "text", template: styleId, lang: "en-US" })
      .trim();
  }
  const sorted = [...items].sort((a, b) => {
    if (sort === "year") {
      const yearOf = (i: CslItem) =>
        Number((i.issued as { "date-parts"?: number[][] } | undefined)?.["date-parts"]?.[0]?.[0]) ||
        0;
      return yearOf(b) - yearOf(a);
    }
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
  return renderBibliographyEntries(sorted, styleId)
    .map((e) => e.text)
    .join("\n");
}

/** Satu cite-item citeproc dalam cluster in-text (id + locator/affix opsional). */
export type DocumentCiteItem = {
  id: string;
  locator?: string;
  label?: string;
  prefix?: string;
  suffix?: string;
};

/** Satu cluster sitasi in-text pada dokumen (mengikuti satu inline node BlockNote). */
export type DocumentCluster = { nodeId: string; items: DocumentCiteItem[] };

export type DocumentRenderResult = {
  /** Marker in-text per cluster (keyed nodeId, urutan = urutan input dokumen). */
  clusters: Array<{ nodeId: string; text: string }>;
  /** Bibliography used-in-document, terurut per style; keyed citation id. */
  bibliography: Array<{ id: string; text: string }>;
};

type CiteprocCitation = {
  citationItems: DocumentCiteItem[];
  properties: { noteIndex: number };
};

type CiteprocEngine = {
  rebuildProcessorState: (
    citations: CiteprocCitation[],
    format: string,
    uncited?: unknown[],
  ) => Array<[string, number, string]>;
  makeBibliography: () => [{ entry_ids: string[][] }, string[]];
};

type CslEngineConfig = {
  engine: (data: CslItem[], style: string, locale: string, format: string) => CiteprocEngine;
};

/**
 * Render sitasi in-text seluruh dokumen + bibliography used-in-document dalam satu
 * pass citeproc (numbering IEEE/Vancouver konsisten karena diproses berurutan).
 * `clusters` HARUS urut kemunculan di dokumen; item id yang tak ada di `items`
 * harus sudah difilter oleh pemanggil (retrieveItem citeproc melempar bila hilang).
 */
export function renderDocumentCitations(
  items: CslItem[],
  clusters: DocumentCluster[],
  styleId: CitationStyleId,
): DocumentRenderResult {
  ensureStylesRegistered();
  const emptyClusters = clusters.map((c) => ({ nodeId: c.nodeId, text: "" }));
  if (items.length === 0) return { clusters: emptyClusters, bibliography: [] };

  const cfg = plugins.config.get("@csl") as CslEngineConfig;
  const engine = cfg.engine(withIds(items), styleId, "en-US", "text");

  // Cluster kosong (semua id-nya missing) tak boleh dikirim ke citeproc; simpan
  // pemetaan index asli supaya teks tetap dikembalikan (string kosong) per nodeId.
  const renderable = clusters
    .map((cluster, index) => ({ cluster, index }))
    .filter((x) => x.cluster.items.length > 0);
  const state = engine.rebuildProcessorState(
    renderable.map((x) => ({ citationItems: x.cluster.items, properties: { noteIndex: 0 } })),
    "text",
  );
  const textByIndex = new Map<number, string>();
  renderable.forEach((x, k) => textByIndex.set(x.index, (state[k]?.[2] ?? "").trim()));

  const [meta, entries] = engine.makeBibliography();
  const bibliography = entries.map((text, i) => ({
    id: meta.entry_ids[i]?.[0] ?? `item-${i}`,
    text: text.trim(),
  }));

  return {
    clusters: clusters.map((c, i) => ({ nodeId: c.nodeId, text: textByIndex.get(i) ?? "" })),
    bibliography,
  };
}

/** Export koleksi ke format interchange. Return `{ content, mimeType, extension }`. */
export function exportCitations(
  items: CslItem[],
  format: CitationExportFormat,
): { content: string; mimeType: string; extension: string } {
  ensureStylesRegistered();
  const cite = new Cite(withIds(items), { generateGraph: false });
  switch (format) {
    case "bibtex":
      return { content: cite.format("bibtex"), mimeType: "application/x-bibtex", extension: "bib" };
    case "ris":
      return {
        content: cite.format("ris"),
        mimeType: "application/x-research-info-systems",
        extension: "ris",
      };
    case "csl-json":
      return {
        content: JSON.stringify(items, null, 2),
        mimeType: "application/json",
        extension: "json",
      };
  }
}
