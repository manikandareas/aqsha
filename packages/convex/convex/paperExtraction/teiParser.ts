import { XMLParser } from "fast-xml-parser";

export type ParsedPaperAuthor = {
  name: string;
  affiliation?: string;
};

export type ParsedPaperSection = {
  title?: string;
  text: string;
};

export type ParsedPaperReference = {
  title?: string;
  authors?: string[];
  doi?: string;
  year?: number;
};

export type ParsedPaperMetadata = {
  title?: string;
  abstract?: string;
  doi?: string;
  authors: ParsedPaperAuthor[];
  affiliations: string[];
  journal?: string;
  publisher?: string;
  publishedYear?: number;
  keywords: string[];
  sections: ParsedPaperSection[];
  references: ParsedPaperReference[];
  plainText: string;
  confidence: number;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  textNodeName: "#text",
});

export function parseGrobidTei(teiXml: string): ParsedPaperMetadata {
  const parsed = parser.parse(teiXml);
  const tei = parsed?.TEI ?? parsed;
  const teiHeader = tei?.teiHeader;
  const text = tei?.text;
  const analytic = findFirst(teiHeader, "analytic");
  const monogr = findFirst(teiHeader, "monogr");
  const profileDesc = teiHeader?.profileDesc;

  const title =
    textValue(findTitle(analytic, "a")) ??
    textValue(findFirst(teiHeader, "title")) ??
    undefined;
  const abstract = textValue(findFirst(profileDesc, "abstract")) ?? undefined;
  const doi = normalizeDoi(textValue(findTypedIdno(teiHeader, "DOI")) ?? undefined);
  const authors = parseAuthors(analytic);
  const affiliations = uniqueCompact(
    collectByKey(teiHeader, "affiliation").map((item) => textValue(item) ?? ""),
  );
  const journal = textValue(findTitle(monogr, "j")) ?? undefined;
  const publisher = textValue(findFirst(monogr, "publisher")) ?? undefined;
  const publishedYear = parseYear(findFirst(monogr, "date"));
  const keywords = parseKeywords(profileDesc);
  const sections = parseSections(text?.body);
  const references = parseReferences(text?.back);
  const plainText = buildPlainText({ abstract, sections });

  return {
    title,
    abstract,
    doi,
    authors,
    affiliations,
    journal,
    publisher,
    publishedYear,
    keywords,
    sections,
    references,
    plainText,
    confidence: scoreConfidence({ title, abstract, doi, authors, sections }),
  };
}

function parseAuthors(analytic: unknown): ParsedPaperAuthor[] {
  return asArray(getValue(analytic, "author"))
    .map((author) => {
      const persName = getValue(author, "persName") ?? author;
      const name = uniqueCompact([
        textValue(getValue(persName, "forename")) ?? "",
        textValue(getValue(persName, "surname")) ?? "",
      ]).join(" ");
      const fallbackName = textValue(persName);
      const affiliation = textValue(getValue(author, "affiliation")) ?? undefined;
      return {
        name: compactText(name || fallbackName || ""),
        affiliation,
      };
    })
    .filter((author) => author.name);
}

function parseKeywords(profileDesc: unknown) {
  const keywordsNode = findFirst(profileDesc, "keywords");
  const terms = collectByKey(keywordsNode, "term").map((item) => textValue(item) ?? "");
  if (terms.length > 0) {
    return uniqueCompact(terms);
  }
  return uniqueCompact((textValue(keywordsNode) ?? "").split(/[;,]/));
}

function parseSections(body: unknown): ParsedPaperSection[] {
  const divs = collectByKey(body, "div");
  const candidates = divs.length > 0 ? divs : asArray(body);
  return candidates
    .map((div) => {
      const title = textValue(getValue(div, "head")) ?? undefined;
      const paragraphText = collectByKey(div, "p")
        .map((item) => textValue(item) ?? "")
        .join("\n\n");
      const text = compactMultiline(paragraphText || textValue(div) || "");
      return { title: title ? compactText(title) : undefined, text };
    })
    .filter((section) => section.text.length > 0);
}

function parseReferences(back: unknown): ParsedPaperReference[] {
  return collectByKey(back, "biblStruct")
    .map((bibl) => {
      const analytic = getValue(bibl, "analytic");
      const monogr = getValue(bibl, "monogr");
      const title =
        textValue(findTitle(analytic, "a")) ??
        textValue(findTitle(monogr, "m")) ??
        textValue(findTitle(bibl, undefined)) ??
        undefined;
      const authors = parseAuthors(analytic).map((author) => author.name);
      const doi = normalizeDoi(textValue(findTypedIdno(bibl, "DOI")) ?? undefined);
      const year = parseYear(findFirst(bibl, "date"));
      return { title, authors: authors.length ? authors : undefined, doi, year };
    })
    .filter((reference) => reference.title || reference.doi);
}

function findTitle(node: unknown, level: string | undefined) {
  return collectByKey(node, "title").find((title) => {
    if (!level) return true;
    return getAttribute(title, "level") === level;
  });
}

function findTypedIdno(node: unknown, type: string) {
  return collectByKey(node, "idno").find(
    (idno) => getAttribute(idno, "type")?.toLowerCase() === type.toLowerCase(),
  );
}

function findFirst(node: unknown, key: string): unknown {
  return collectByKey(node, key)[0];
}

function collectByKey(node: unknown, key: string): unknown[] {
  if (!node || typeof node !== "object") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectByKey(item, key));
  }
  const record = node as Record<string, unknown>;
  const direct = asArray(record[key]);
  const nested = Object.entries(record)
    .filter(([childKey]) => childKey !== key && !childKey.startsWith("@_"))
    .flatMap(([, value]) => collectByKey(value, key));
  return [...direct, ...nested];
}

function getValue(node: unknown, key: string): unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return undefined;
  }
  return (node as Record<string, unknown>)[key];
}

function getAttribute(node: unknown, key: string) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return undefined;
  }
  const value = (node as Record<string, unknown>)[`@_${key}`];
  return typeof value === "string" ? value : undefined;
}

function textValue(node: unknown): string | undefined {
  if (node == null) {
    return undefined;
  }
  if (typeof node === "string" || typeof node === "number") {
    return compactText(String(node));
  }
  if (Array.isArray(node)) {
    return compactText(node.map((item) => textValue(item) ?? "").join(" "));
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    const text = [
      typeof record["#text"] === "string" ? record["#text"] : "",
      ...Object.entries(record)
        .filter(([key]) => !key.startsWith("@_") && key !== "#text")
        .map(([, value]) => textValue(value) ?? ""),
    ].join(" ");
    return compactText(text);
  }
  return undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeDoi(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
}

function parseYear(node: unknown) {
  const when = getAttribute(node, "when");
  const value = when ?? textValue(node);
  const match = value?.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function buildPlainText(args: { abstract?: string; sections: ParsedPaperSection[] }) {
  return compactMultiline([
    args.abstract ? `Abstract\n${args.abstract}` : "",
    ...args.sections.map((section) =>
      [section.title, section.text].filter(Boolean).join("\n"),
    ),
  ].filter(Boolean).join("\n\n"));
}

function scoreConfidence(args: {
  title?: string;
  abstract?: string;
  doi?: string;
  authors: ParsedPaperAuthor[];
  sections: ParsedPaperSection[];
}) {
  let score = 0;
  if (args.title) score += 0.25;
  if (args.abstract) score += 0.25;
  if (args.doi) score += 0.2;
  if (args.authors.length > 0) score += 0.15;
  if (args.sections.length > 0) score += 0.15;
  return Math.min(1, Number(score.toFixed(2)));
}

function uniqueCompact(values: string[]) {
  const seen = new Set<string>();
  return values
    .map(compactText)
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) {
        return false;
      }
      seen.add(value.toLowerCase());
      return true;
    });
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function compactMultiline(value: string) {
  return value
    .replaceAll("\0", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
