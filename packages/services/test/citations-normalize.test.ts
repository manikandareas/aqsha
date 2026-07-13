import { describe, expect, test } from "bun:test";
import {
  buildCslFromManualInput,
  canonicalKeyFor,
  canonicalKeyForCsl,
  cslItemToColumns,
  formatAuthorDisplay,
  metadataStatusFor,
  normalizeIsbn,
  normalizeTags,
} from "../src/citations/citation-normalize";

describe("normalizeIsbn", () => {
  test("buang separator + uppercase X; panjang selain 10/13 tidak valid", () => {
    expect(normalizeIsbn("978-0-9613921-4-7")).toBe("9780961392147");
    expect(normalizeIsbn("0-8044-2957-x")).toBe("080442957X");
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn(null)).toBeNull();
  });
});

describe("canonicalKeyFor", () => {
  test("prioritas doi → isbn → hash title", () => {
    expect(
      canonicalKeyFor({
        doi: "10.1/x",
        isbn: "9780961392147",
        title: "T",
        publishedYear: 2020,
        firstAuthorFamily: "A",
      }),
    ).toBe("doi:10.1/x");
    expect(
      canonicalKeyFor({
        doi: null,
        isbn: "9780961392147",
        title: "T",
        publishedYear: 2020,
        firstAuthorFamily: "A",
      }),
    ).toBe("isbn:9780961392147");
    const k = canonicalKeyFor({
      doi: null,
      isbn: null,
      title: "Deep Learning",
      publishedYear: 2015,
      firstAuthorFamily: "LeCun",
    });
    expect(k.startsWith("ttl:")).toBe(true);
  });

  test("hash title tahan diacritics/kapital/punktuasi", () => {
    const base = { doi: null, isbn: null, publishedYear: 2019, firstAuthorFamily: "Müller" };
    const a = canonicalKeyFor({ ...base, title: "Enquête sur l'évaluation!" });
    const b = canonicalKeyFor({
      ...base,
      firstAuthorFamily: "Muller",
      title: "enquete sur l evaluation",
    });
    expect(a).toBe(b);
  });
});

describe("cslItemToColumns", () => {
  test("ekstraksi kolom + normalisasi DOI + corporate author → literal", () => {
    const cols = cslItemToColumns({
      type: "article-journal",
      title: "Judul",
      author: [{ family: "World Health Organization" }, { family: "Doe", given: "J." }],
      issued: { "date-parts": [[2023, 5]] },
      "container-title": "Jurnal",
      DOI: "https://doi.org/10.1234/ABC",
      URL: "https://example.com",
    });
    expect(cols.publishedYear).toBe(2023);
    expect(cols.doi).toBe("10.1234/abc");
    expect(cols.authors[0]).toEqual({ literal: "World Health Organization" });
    expect(cols.authors[1]).toEqual({ family: "Doe", given: "J." });
  });

  test("data hilang → null, bukan dikarang", () => {
    const cols = cslItemToColumns({ type: "book", title: "T" });
    expect(cols.publishedYear).toBeNull();
    expect(cols.doi).toBeNull();
    expect(cols.authors).toEqual([]);
  });
});

describe("metadataStatusFor", () => {
  const complete = cslItemToColumns({
    title: "T",
    author: [{ family: "A" }],
    issued: { "date-parts": [[2020]] },
  });
  test("field inti hilang → incomplete; manual/doi → verified; import → needs_review", () => {
    expect(metadataStatusFor("import", cslItemToColumns({ title: "T" }))).toBe("incomplete");
    expect(metadataStatusFor("manual", complete)).toBe("verified");
    expect(metadataStatusFor("doi", complete)).toBe("verified");
    expect(metadataStatusFor("import", complete)).toBe("needs_review");
  });
});

describe("buildCslFromManualInput + canonicalKeyForCsl", () => {
  test("hanya field terisi yang masuk; key konsisten dengan kolom", () => {
    const csl = buildCslFromManualInput({
      title: "Judul Manual",
      authors: [{ family: "Sari", given: "Dewi" }],
      publishedYear: 2022,
      doi: "doi:10.5555/xyz",
      venue: null,
    });
    expect(csl["container-title"]).toBeUndefined();
    expect(csl.DOI).toBe("10.5555/xyz");
    expect(canonicalKeyForCsl(csl)).toBe("doi:10.5555/xyz");
  });
});

describe("normalizeTags", () => {
  test("trim, dedupe case-insensitive, cap 20", () => {
    expect(normalizeTags([" metode ", "Metode", "", "x"])).toEqual(["metode", "x"]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length).toBe(20);
  });
});

describe("formatAuthorDisplay", () => {
  test("literal / family, given / family-only", () => {
    expect(formatAuthorDisplay({ literal: "WHO" })).toBe("WHO");
    expect(formatAuthorDisplay({ family: "Doe", given: "J." })).toBe("Doe, J.");
    expect(formatAuthorDisplay({ family: "Doe" })).toBe("Doe");
  });
});
