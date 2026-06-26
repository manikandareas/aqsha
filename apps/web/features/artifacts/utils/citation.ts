export type CitationFormat = "bibtex" | "markdown" | "plain";

export type CitationInput = {
  title: string;
  authors: string[];
  url: string;
  doi?: string;
  year?: number;
  venue?: string;
};

export function formatCitation(paper: CitationInput, format: CitationFormat) {
  if (format === "bibtex") {
    return formatBibtexCitation(paper);
  }
  if (format === "markdown") {
    return formatMarkdownCitation(paper);
  }
  return formatPlainCitation(paper);
}

function formatPlainCitation(paper: CitationInput) {
  const authors = formatAuthors(paper.authors);
  const year = paper.year ? ` (${paper.year}).` : ".";
  const venue = paper.venue ? ` ${paper.venue}.` : "";
  const locator = paper.doi ? ` https://doi.org/${paper.doi}` : ` ${paper.url}`;
  return `${authors}${year} ${paper.title}.${venue}${locator}`.replace(/\s+/g, " ").trim();
}

function formatMarkdownCitation(paper: CitationInput) {
  const authors = formatAuthors(paper.authors);
  const year = paper.year ? ` (${paper.year})` : "";
  const venue = paper.venue ? `, ${paper.venue}` : "";
  return `${authors}${year}. [${paper.title}](${paper.url})${venue}.`;
}

function formatBibtexCitation(paper: CitationInput) {
  const key = bibtexKey(paper);
  const fields = [
    ["title", paper.title],
    ["author", paper.authors.join(" and ")],
    ["year", paper.year ? String(paper.year) : ""],
    ["journal", paper.venue ?? ""],
    ["doi", paper.doi ?? ""],
    ["url", paper.url],
  ].filter(([, value]) => value);

  return [
    `@article{${key},`,
    ...fields.map(([field, value]) => `  ${field} = {${escapeBibtex(value)}},`),
    "}",
  ].join("\n");
}

function formatAuthors(authors: string[]) {
  if (authors.length === 0) {
    return "Unknown author";
  }
  if (authors.length === 1) {
    return authors[0];
  }
  if (authors.length === 2) {
    return `${authors[0]} and ${authors[1]}`;
  }
  return `${authors[0]} et al.`;
}

function bibtexKey(paper: CitationInput) {
  const author = paper.authors[0]?.split(/\s+/).at(-1) ?? "paper";
  const year = paper.year ?? "nd";
  const titleWord = paper.title.match(/[a-z0-9]+/i)?.[0] ?? "work";
  return `${slug(author)}${year}${slug(titleWord)}`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function escapeBibtex(value: string) {
  return value.replace(/[{}]/g, "");
}
