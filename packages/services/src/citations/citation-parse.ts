/// <reference path="./citation-js.d.ts" />
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import type { ImportBatchFormat } from "@aqsha/db";
import type { CslItem } from "./citation-normalize";

export type ParsedBibliographyEntry = { index: number; csl: CslItem };
export type BibliographyParseError = { index: number; message: string; raw: string };

const RAW_SNIPPET_LENGTH = 200;

/**
 * Pecah file BibTeX per-entry pada awal baris `@type{`/`@type(` supaya satu entry
 * malformed (brace tak seimbang) tidak menelan entry berikutnya — error per-entry,
 * bukan gagal total. Header entry di tengah field value praktis tak terjadi pada
 * hasil ekspor Mendeley/Zotero.
 */
function splitBibtexEntries(content: string): string[] {
  return content
    .split(/(?=^[ \t]*@[a-zA-Z]+\s*[{(])/m)
    .map((e) => e.trim())
    .filter((e) => e.startsWith("@"));
}

/** Pecah RIS per-record pada penanda akhir `ER  -`; sisa tanpa `ER` tetap dicoba. */
function splitRisEntries(content: string): string[] {
  const parts = content.split(/^ER\s{2}-.*$/m);
  return parts
    .map((p) => p.trim())
    .filter((p) => /^TY\s{2}-/m.test(p))
    .map((p) => `${p}\nER  - `);
}

/** Deteksi format dari isi (content-type/extension tidak dipercaya sendirian). */
export function sniffBibliographyFormat(content: string): ImportBatchFormat | null {
  const head = content.slice(0, 4000);
  if (/^\s*@[a-zA-Z]+\s*[{(]/m.test(head)) return "bibtex";
  if (/^TY\s{2}-/m.test(head)) return "ris";
  return null;
}

/**
 * Parse `.bib`/`.ris` → CSL-JSON per-entry via @citation-js (ADR: MIT parser).
 * Entry yang gagal menghasilkan diagnostic terstruktur, bukan exception.
 */
export function parseBibliographyFile(
  content: string,
  format: ImportBatchFormat,
): { entries: ParsedBibliographyEntry[]; errors: BibliographyParseError[] } {
  const chunks = format === "bibtex" ? splitBibtexEntries(content) : splitRisEntries(content);
  const forceType = format === "bibtex" ? "@bibtex/text" : "@ris/file";
  const entries: ParsedBibliographyEntry[] = [];
  const errors: BibliographyParseError[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index] ?? "";
    // Komentar/preamble/string BibTeX bukan record bibliografi.
    if (format === "bibtex" && /^@(comment|preamble|string)\b/i.test(chunk)) continue;
    try {
      const cite = new Cite(chunk, { forceType, generateGraph: false });
      for (const item of cite.data) {
        const { _graph: _ignored, ...csl } = item as CslItem & { _graph?: unknown };
        entries.push({ index, csl });
      }
      if (cite.data.length === 0) {
        errors.push({
          index,
          message: "entry tidak menghasilkan record",
          raw: chunk.slice(0, RAW_SNIPPET_LENGTH),
        });
      }
    } catch (error) {
      errors.push({
        index,
        message: error instanceof Error ? error.message : "entry tidak bisa diparse",
        raw: chunk.slice(0, RAW_SNIPPET_LENGTH),
      });
    }
  }
  return { entries, errors };
}
