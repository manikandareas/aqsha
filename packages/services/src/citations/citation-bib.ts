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
 * Kunci sitasi stabil: deterministik terhadap himpunan input (diurut by id),
 * bebas tabrakan via suffix a/b/c…, hanya [a-z0-9] — aman untuk \cite{}.
 */
export function generateBibKeys(
  items: Array<{ id: string; csl: CslItem }>,
): Record<string, string> {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const taken = new Set<string>();
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

/** CSL-JSON perpustakaan → isi file .bib (dialek biblatex) + peta id→kunci. */
export function buildBibliographyFile(
  items: Array<{ id: string; csl: CslItem }>,
): BibliographyExport {
  const keyById = generateBibKeys(items);
  if (items.length === 0) return { bib: "", keyById };
  const withKeys = items.map(({ id, csl }) => ({
    // citation-js menolak item tanpa type; fallback generik untuk data lama.
    type: "document",
    ...csl,
    id: keyById[id],
    "citation-key": keyById[id],
  }));
  const cite = new Cite(withKeys, { generateGraph: false });
  return { bib: cite.format("biblatex") as string, keyById };
}
