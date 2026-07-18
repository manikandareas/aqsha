/// <reference path="./citation-js.d.ts" />
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import type { CslItem } from "./citation-normalize";

export type BibliographyExport = {
  bib: string;
  /** citationId → kunci \cite{} yang dipakai di .bib. */
  keyById: Record<string, string>;
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** a, b, …, z, aa, ab, … untuk disambiguasi kunci yang bertabrakan. */
function collisionSuffix(n: number): string {
  let s = "";
  let i = n;
  while (i > 0) {
    i -= 1;
    s = String.fromCharCode(97 + (i % 26)) + s;
    i = Math.floor(i / 26);
  }
  return s;
}

function baseBibKey(csl: CslItem): string {
  const authors = Array.isArray(csl.author)
    ? (csl.author as Array<Record<string, unknown>>)
    : [];
  const first = authors[0] ?? {};
  const name =
    typeof first.family === "string" && first.family
      ? first.family
      : typeof first.literal === "string"
        ? first.literal
        : "";
  const issued = csl.issued as { "date-parts"?: Array<Array<number | string>> } | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0];
  const slug = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${slug || "ref"}${year ?? ""}`;
}

/**
 * Usulkan kunci sitasi untuk item TANPA kunci, menghormati (dan menambah ke) `taken`
 * — himpunan kunci yang sudah direservasi owner. Deterministik terhadap input
 * (diurut by id), hanya [a-z0-9], tabrakan → suffix a/b/c….
 */
export function proposeBibKeys(
  items: Array<{ id: string; csl: CslItem }>,
  taken: Set<string>,
): Record<string, string> {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const keyById: Record<string, string> = {};
  for (const item of sorted) {
    const base = baseBibKey(item.csl);
    let key = base;
    for (let n = 1; taken.has(key); n++) key = `${base}${collisionSuffix(n)}`;
    taken.add(key);
    keyById[item.id] = key;
  }
  return keyById;
}

/** CSL-JSON + kunci eksternal (bib_key persisten) → isi file .bib dialek biblatex. */
export function composeBibliography(items: Array<{ key: string; csl: CslItem }>): string {
  if (items.length === 0) return "";
  const withKeys = items.map(({ key, csl }) => ({
    // citation-js menolak item tanpa type; fallback generik untuk data lama.
    type: "document",
    ...csl,
    id: key,
    "citation-key": key,
  }));
  const cite = new Cite(withKeys, { generateGraph: false });
  return cite.format("biblatex") as string;
}

/** Kompat: propose dari nol (taken kosong) — untuk pemakai tanpa kunci persisten. */
export function generateBibKeys(
  items: Array<{ id: string; csl: CslItem }>,
): Record<string, string> {
  return proposeBibKeys(items, new Set());
}

/** CSL-JSON perpustakaan → .bib + peta id→kunci (kunci di-propose lokal, non-persisten). */
export function buildBibliographyFile(
  items: Array<{ id: string; csl: CslItem }>,
): BibliographyExport {
  const keyById = generateBibKeys(items);
  const bib = composeBibliography(items.map(({ id, csl }) => ({ key: keyById[id]!, csl })));
  return { bib, keyById };
}
