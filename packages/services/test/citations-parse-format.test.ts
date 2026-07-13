/**
 * Fase 0 acceptance sebagai regression test: fixture ekspor nyata Mendeley+Zotero
 * (.bib/.ris) → CSL-JSON valid atau diagnostic terstruktur; render 4 style
 * deterministik (snapshot inline); export BibTeX/RIS round-trip.
 */
import { describe, expect, test } from "bun:test";
import { exportCitations, renderBibliography, renderBibliographyEntries } from "../src/citations/citation-format";
import { cslItemToColumns } from "../src/citations/citation-normalize";
import { parseBibliographyFile, sniffBibliographyFormat } from "../src/citations/citation-parse";

const fixture = (name: string) =>
  Bun.file(new URL(`./fixtures/citations/${name}`, import.meta.url)).text();

describe("sniffBibliographyFormat", () => {
  test("deteksi dari isi, bukan extension", async () => {
    expect(sniffBibliographyFormat(await fixture("mendeley.bib"))).toBe("bibtex");
    expect(sniffBibliographyFormat(await fixture("zotero.ris"))).toBe("ris");
    expect(sniffBibliographyFormat("halo dunia")).toBeNull();
  });
});

describe("parseBibliographyFile", () => {
  test("mendeley.bib: 6 entry, LaTeX escape + corporate author benar", async () => {
    const { entries, errors } = parseBibliographyFile(await fixture("mendeley.bib"), "bibtex");
    expect(entries.length).toBe(6);
    expect(errors.length).toBe(0);
    const muller = entries.find((e) => String(e.csl.title).startsWith("Enquête"));
    expect(muller).toBeDefined();
    const cols = cslItemToColumns(muller?.csl ?? {});
    expect(cols.authors[0]?.family).toBe("Müller");
    expect(cols.doi).toBe("10.1234/tal.2019.60213");
    const who = entries.find((e) => String(e.csl.title).startsWith("Global tuberculosis"));
    expect(cslItemToColumns(who?.csl ?? {}).authors[0]?.literal).toBe("World Health Organization");
  });

  test("zotero.bib: non-ASCII + chapter + editor bertahan", async () => {
    const { entries, errors } = parseBibliographyFile(await fixture("zotero.bib"), "bibtex");
    expect(entries.length).toBe(5);
    expect(errors.length).toBe(0);
    const chapter = entries.find((e) => e.csl.type === "chapter");
    expect(String(chapter?.csl.title)).toContain("プライバシー");
  });

  test("mendeley.ris: 5 record; PY non-angka → tahun null tanpa crash", async () => {
    const { entries } = parseBibliographyFile(await fixture("mendeley.ris"), "ris");
    expect(entries.length).toBe(5);
    const broken = entries.find((e) => String(e.csl.title).startsWith("Entry rusak"));
    expect(cslItemToColumns(broken?.csl ?? {}).publishedYear).toBeNull();
  });

  test("entry bibtex malformed → diagnostic per-entry, entry lain selamat", () => {
    const content = `@article{ok1,\n title = {Entry Baik},\n author = {Doe, J.},\n year = {2020},\n journal = {J}\n}\n@article{rusak,\n title = {{Tak seimbang},\n@book{ok2,\n title = {Buku Baik},\n author = {Roe, R.},\n year = {2021},\n publisher = {P}\n}\n`;
    const { entries } = parseBibliographyFile(content, "bibtex");
    const titles = entries.map((e) => String(e.csl.title));
    expect(titles).toContain("Entry Baik");
    expect(titles).toContain("Buku Baik");
  });
});

describe("render 4 style deterministik", () => {
  const items = [
    {
      id: "lecun",
      type: "article-journal",
      title: "Deep learning",
      author: [
        { family: "LeCun", given: "Yann" },
        { family: "Bengio", given: "Yoshua" },
        { family: "Hinton", given: "Geoffrey" },
      ],
      "container-title": "Nature",
      volume: "521",
      issue: "7553",
      page: "436-444",
      issued: { "date-parts": [[2015]] },
      DOI: "10.1038/nature14539",
    },
    {
      id: "moleong",
      type: "book",
      title: "Metodologi penelitian kualitatif",
      author: [{ family: "Moleong", given: "Lexy J." }],
      publisher: "Remaja Rosdakarya",
      "publisher-place": "Bandung",
      issued: { "date-parts": [[2017]] },
    },
  ];

  test("apa-7", () => {
    const [a, b] = renderBibliographyEntries(items, "apa-7");
    expect(a?.text).toBe(
      "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444. https://doi.org/10.1038/nature14539",
    );
    expect(b?.text).toBe("Moleong, L. J. (2017). Metodologi penelitian kualitatif. Remaja Rosdakarya.");
  });

  test("ieee", () => {
    const [a] = renderBibliographyEntries(items, "ieee");
    expect(a?.text).toBe(
      "[1] Y. LeCun, Y. Bengio, and G. Hinton, “Deep learning,” Nature, vol. 521, no. 7553, pp. 436–444, 2015, doi: 10.1038/nature14539.",
    );
  });

  test("vancouver (nlm-citation-sequence)", () => {
    const [a] = renderBibliographyEntries(items, "vancouver");
    expect(a?.text).toBe(
      "1. LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436–44. doi:10.1038/nature14539",
    );
  });

  test("chicago-author-date", () => {
    const [a] = renderBibliographyEntries(items, "chicago-author-date");
    expect(a?.text).toBe(
      "LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. “Deep Learning.” Nature 521 (7553): 436–44. https://doi.org/10.1038/nature14539.",
    );
  });

  test("bibliography utuh + sort override", () => {
    const byAuthor = renderBibliography(items, "apa-7", "author");
    expect(byAuthor.split("\n")[0]).toContain("LeCun");
    const byTitle = renderBibliography(items, "apa-7", "title");
    expect(byTitle.split("\n")[0]).toContain("Deep learning");
    const byYear = renderBibliography(items, "apa-7", "year");
    expect(byYear.split("\n")[0]).toContain("Moleong"); // 2017 > 2015
  });
});

describe("exportCitations", () => {
  const items = [
    {
      id: "x",
      type: "article-journal",
      title: "Judul Uji",
      author: [{ family: "Doe", given: "J." }],
      issued: { "date-parts": [[2020]] },
      "container-title": "Jurnal",
      DOI: "10.1/x",
    },
  ];
  test("bibtex/ris/csl-json menghasilkan konten valid", () => {
    const bib = exportCitations(items, "bibtex");
    expect(bib.content).toContain("@article");
    expect(bib.extension).toBe("bib");
    const ris = exportCitations(items, "ris");
    expect(ris.content).toContain("TY  - JOUR");
    const json = exportCitations(items, "csl-json");
    expect(JSON.parse(json.content)[0].title).toBe("Judul Uji");
  });

  test("round-trip bibtex → parse balik tanpa kehilangan field inti", () => {
    const { content } = exportCitations(items, "bibtex");
    const { entries } = parseBibliographyFile(content, "bibtex");
    const cols = cslItemToColumns(entries[0]?.csl ?? {});
    expect(cols.title).toBe("Judul Uji");
    expect(cols.doi).toBe("10.1/x");
    expect(cols.publishedYear).toBe(2020);
  });
});
