/**
 * CitationService (Slice 7.2) — citation-integrity engine ported from V1
 * `apps/agents/src/citations/{integrity,bibliography}.ts` + `tools/citations.ts`.
 *
 * Reuses the existing research providers (crossref/arxiv/openalex + Redis cache) —
 * no re-fetch logic of its own. Two entrypoints share one 4-step engine, framed
 * neutrally (a flag is not an accusation):
 *   - verifyIdentifiers(refs[]) — a caller-supplied reference list, mid-research,
 *     before any artifact exists. Echoes each ref's `[n]` back unchanged.
 *   - verifyCitations(artifactText) — extracts a bibliography from finished prose,
 *     then runs verifyIdentifiers over it.
 *
 * V2 adaptation vs V1: the V2 providers return `[]` on failure AND on genuine
 * no-match (no failure-sentinel candidate). So an EMPTY existence result is
 * treated as ambiguous → `null` signal (unverifiable), NEVER as `not_found` — a
 * provider outage must never become a false accusation. `not_found` is reached
 * only when real results came back and none matched the title.
 */

import { extractArxivId, normalizeDoi } from "../papers/identifiers";
import { searchArxiv } from "./arxiv";
import { lookupDoi } from "./crossref";
import { searchOpenAlex } from "./openalex";
import { authorOverlap, titleSimilarity } from "./similarity";
import { collapse } from "./text";
import type { ProviderSearchResult, ResearchCandidate } from "./types";

export type IntegrityStatus =
  | "verified"
  | "metadata_mismatch"
  | "identifier_invalid"
  | "not_found"
  | "unverifiable";

export type CitationInput = {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxivId?: string;
  url?: string;
};

/** A reference to verify; `citation` is the [n] number, echoed back unchanged. */
export type CitationVerifyRef = CitationInput & { citation?: number };

/** One per-reference verdict (keyed by the original `[n]`). */
export type CitationVerdict = {
  reference: string;
  citation?: number;
  doi?: string;
  arxivId?: string;
  status: IntegrityStatus;
  issues: string[];
  matchedTitle?: string;
};

export type VerificationResult = {
  status: "completed";
  summary: { checked: number; verified: number; flagged: number };
  items: CitationVerdict[];
  caveat: string;
  note?: string;
};

// Per-step signals fed to the pure classifier. `null` = "step did not run / not
// applicable" — treated conservatively, never as evidence of fabrication.
type IntegritySignals = {
  hasIdentifier: boolean;
  identifierResolved: boolean | null;
  identifierTitleMatch: boolean | null;
  existenceFound: boolean | null;
  metadataConsistent: boolean | null;
  metadataIssues: string[];
};

const EXISTENCE_TITLE_THRESHOLD = 0.7;
const IDENTIFIER_TITLE_THRESHOLD = 0.6;
const AUTHOR_OVERLAP_THRESHOLD = 0.5;
const VENUE_SIMILARITY_THRESHOLD = 0.5;
const YEAR_TOLERANCE = 1;
const VERIFY_CONCURRENCY = 4;
const MAX_CITATIONS = 60;

const NEUTRAL_CAVEAT =
  "A flag is not an accusation: it can stem from a metadata typo, an incomplete database, or a provider outage. Recommend manual verification for flagged items and use neutral language.";

export const FLAGGED_INTEGRITY_STATUSES: ReadonlySet<IntegrityStatus> = new Set([
  "metadata_mismatch",
  "identifier_invalid",
  "not_found",
]);

// ── pure classifier ──────────────────────────────────────────────────────────

function compareMetadata(
  cited: Pick<CitationInput, "authors" | "year" | "venue">,
  record: { authors?: string[]; year?: number; venue?: string },
): { consistent: boolean; issues: string[] } {
  const issues: string[] = [];
  if (
    cited.year !== undefined &&
    record.year !== undefined &&
    Math.abs(cited.year - record.year) > YEAR_TOLERANCE
  ) {
    issues.push(`year ${cited.year} vs ${record.year}`);
  }
  if (
    cited.authors &&
    cited.authors.length > 0 &&
    record.authors &&
    record.authors.length > 0 &&
    authorOverlap(cited.authors, record.authors) < AUTHOR_OVERLAP_THRESHOLD
  ) {
    issues.push("author mismatch");
  }
  if (
    cited.venue &&
    record.venue &&
    titleSimilarity(cited.venue, record.venue) < VENUE_SIMILARITY_THRESHOLD
  ) {
    issues.push("venue mismatch");
  }
  return { consistent: issues.length === 0, issues };
}

function classifyIntegrity(s: IntegritySignals): IntegrityStatus {
  if (s.hasIdentifier && s.identifierResolved !== null) {
    if (s.identifierResolved === false) return "identifier_invalid";
    if (s.identifierTitleMatch === false) return "identifier_invalid";
    if (s.metadataConsistent === false) return "metadata_mismatch";
    return "verified";
  }
  if (s.existenceFound === true) {
    return s.metadataConsistent === false ? "metadata_mismatch" : "verified";
  }
  if (s.existenceFound === false) return "not_found";
  return "unverifiable";
}

function parseCandidateMeta(candidate: ResearchCandidate): {
  authors?: string[];
  year?: number;
  venue?: string;
} {
  if (!candidate.metadataJson) return {};
  try {
    const meta = JSON.parse(candidate.metadataJson) as {
      authors?: unknown;
      year?: unknown;
      venue?: unknown;
    };
    return {
      authors: Array.isArray(meta.authors)
        ? meta.authors.filter((a): a is string => typeof a === "string")
        : undefined,
      year: typeof meta.year === "number" ? meta.year : undefined,
      venue: typeof meta.venue === "string" ? meta.venue : undefined,
    };
  } catch {
    return {};
  }
}

/** First candidate with a usable title, or null. Provider error (`ok:false`) → null (sinyal tetap ambigu). */
function asResolvedRecord(result: ProviderSearchResult): ResearchCandidate | null {
  if (!result.ok) return null;
  return result.candidates.find((candidate) => candidate.title) ?? null;
}

// Run the 4-step check for one citation. Provider errors / empty results degrade
// the relevant signal to `null` (→ unverifiable), never to a false accusation.
async function verifyOneCitation(input: CitationInput): Promise<{
  status: IntegrityStatus;
  signals: IntegritySignals;
  matchedTitle?: string;
}> {
  const signals: IntegritySignals = {
    hasIdentifier: Boolean(input.doi || input.arxivId),
    identifierResolved: null,
    identifierTitleMatch: null,
    existenceFound: null,
    metadataConsistent: null,
    metadataIssues: [],
  };
  let matched: ResearchCandidate | null = null;

  // Step 3 (identifier validation) first — strongest signal.
  try {
    if (input.doi) {
      const doi = normalizeDoi(input.doi);
      if (doi) {
        const record = asResolvedRecord(await lookupDoi({ doi }));
        if (record) {
          signals.identifierResolved = true;
          signals.identifierTitleMatch =
            titleSimilarity(input.title, record.title) >= IDENTIFIER_TITLE_THRESHOLD;
          matched = record;
        }
      }
    } else if (input.arxivId) {
      const id = extractArxivId(input.arxivId) ?? input.arxivId;
      const record = asResolvedRecord(await searchArxiv({ query: id, limit: 1 }));
      if (record) {
        signals.identifierResolved = true;
        signals.identifierTitleMatch =
          titleSimilarity(input.title, record.title) >= IDENTIFIER_TITLE_THRESHOLD;
        matched = record;
      }
    }
  } catch {
    // Identifier step unavailable — leave the signal null.
  }

  // Step 1 (existence) — skip when the identifier already confirmed the work.
  if (signals.identifierResolved !== true && input.title.trim()) {
    try {
      const query = [input.title, input.authors?.[0]].filter(Boolean).join(" ");
      const result = await searchOpenAlex({ query, limit: 5 });
      // Provider error ATAU empty = ambiguous → leave existence null (never a false accusation).
      const works = result.ok ? result.candidates : [];
      if (works.length > 0) {
        const best = works
          .map((work) => ({ work, score: titleSimilarity(input.title, work.title) }))
          .sort((a, b) => b.score - a.score)[0];
        if (best && best.score >= EXISTENCE_TITLE_THRESHOLD) {
          signals.existenceFound = true;
          matched = matched ?? best.work;
        } else {
          signals.existenceFound = false;
        }
      }
    } catch {
      // Existence step unavailable — leave the signal null.
    }
  }

  // Step 2 (metadata consistency) against whatever record we resolved.
  if (matched) {
    const cmp = compareMetadata(input, parseCandidateMeta(matched));
    signals.metadataConsistent = cmp.consistent;
    signals.metadataIssues = cmp.issues;
  }

  return { status: classifyIntegrity(signals), signals, matchedTitle: matched?.title };
}

/** Run the four-step engine over a reference list, batched by concurrency. */
async function runVerificationBatch(refs: CitationVerifyRef[]): Promise<CitationVerdict[]> {
  const items: CitationVerdict[] = [];
  for (let i = 0; i < refs.length; i += VERIFY_CONCURRENCY) {
    const chunk = refs.slice(i, i + VERIFY_CONCURRENCY);
    const settled = await Promise.all(
      chunk.map(async (ref): Promise<CitationVerdict> => {
        try {
          const result = await verifyOneCitation(ref);
          return {
            reference: ref.title,
            citation: ref.citation,
            doi: ref.doi,
            arxivId: ref.arxivId,
            status: result.status,
            issues: result.signals.metadataIssues,
            matchedTitle: result.matchedTitle,
          };
        } catch {
          return {
            reference: ref.title,
            citation: ref.citation,
            status: "unverifiable",
            issues: [],
          };
        }
      }),
    );
    items.push(...settled);
  }
  return items;
}

function tally(items: CitationVerdict[]): { checked: number; verified: number; flagged: number } {
  const verified = items.filter((item) => item.status === "verified").length;
  const flagged = items.filter((item) => FLAGGED_INTEGRITY_STATUSES.has(item.status)).length;
  return { checked: items.length, verified, flagged };
}

// ── bibliography extraction (deterministic, free; imperfect parses degrade to
//    "unverifiable" rather than false flags) ──────────────────────────────────

const REFERENCE_HEADINGS =
  /^#{0,6}\s*(references|bibliography|daftar\s+pustaka|referensi)\s*:?\s*$/im;
const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s"'<>)\],;]+)/i;
const ARXIV_PATTERN = /\barxiv[:\s/]*(\d{4}\.\d{4,5})(v\d+)?\b/i;
const YEAR_PATTERN = /\((19|20)\d{2}[a-z]?\)|\b(19|20)\d{2}\b/;

function extractReferencesSection(text: string): string | null {
  const match = REFERENCE_HEADINGS.exec(text);
  if (!match || match.index === undefined) return null;
  return text.slice(match.index + match[0].length).trim() || null;
}

function splitReferenceEntries(section: string): string[] {
  const numbered = section.split(/\n(?=\s*(?:\[\d{1,3}\]|\d{1,3}\.)\s+)/);
  const parts =
    numbered.length > 1
      ? numbered
      : section.split(/\n{2,}/).flatMap((block) => block.split(/\n(?=[A-Z[])/));
  return parts.map((entry) => collapse(entry)).filter((entry) => entry.length >= 20);
}

function cleanTitleFragment(fragment: string): string {
  return collapse(
    fragment
      .replace(/^[\s.,;:–—-]+/, "")
      .replace(/[\s.,;:–—-]+$/, "")
      .replace(/^["'“”]+|["'“”]+$/g, ""),
  );
}

function guessTitle(entry: string): string {
  const quoted = entry.match(/["“]([^"”]{8,300})["”]/);
  if (quoted?.[1]) return cleanTitleFragment(quoted[1]);
  const afterYear = entry.match(/\((?:19|20)\d{2}[a-z]?\)\s*\.?\s*([^.]{8,300})\./);
  if (afterYear?.[1]) return cleanTitleFragment(afterYear[1]);
  const stripped = entry.replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}\.)\s*/, "");
  const sentences = stripped
    .split(/(?<=[a-z0-9])\.\s+/)
    .map(cleanTitleFragment)
    .filter((s) => s.length >= 8);
  return sentences.sort((a, b) => b.length - a.length)[0] ?? cleanTitleFragment(stripped);
}

function guessAuthors(entry: string): string[] | undefined {
  const beforeYear = entry.split(/\((?:19|20)\d{2}[a-z]?\)/)[0];
  if (!beforeYear || beforeYear.length > 220) return undefined;
  const authors = beforeYear
    .replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}\.)\s*/, "")
    .split(/;|,\s*&\s*|\s+&\s+|\band\b|\bdan\b/i)
    .map((author) => collapse(author.replace(/[.,]+$/, "")))
    .filter((author) => author.length >= 3 && /[a-z]/i.test(author));
  return authors.length > 0 ? authors.slice(0, 8) : undefined;
}

function parseReferenceEntry(entry: string): CitationInput | null {
  const compact = collapse(entry);
  if (compact.length < 20) return null;
  const doiMatch = DOI_PATTERN.exec(compact);
  const arxivMatch = ARXIV_PATTERN.exec(compact);
  const yearMatch = YEAR_PATTERN.exec(compact);
  const title = guessTitle(compact);
  if (!title) return null;
  const yearText = yearMatch?.[0]?.replace(/[()a-z]/gi, "");
  const doiRaw = doiMatch?.[1] ? normalizeDoi(doiMatch[1].replace(/[.,;]+$/, "")) : "";
  return {
    title,
    authors: guessAuthors(compact),
    year: yearText ? Number(yearText) : undefined,
    doi: doiRaw || undefined,
    arxivId: arxivMatch ? extractArxivId(arxivMatch[0]) : undefined,
  };
}

function extractCitations(text: string): CitationInput[] {
  const section = extractReferencesSection(text);
  if (!section) return [];
  return splitReferenceEntries(section)
    .map(parseReferenceEntry)
    .filter((citation): citation is CitationInput => Boolean(citation))
    .slice(0, MAX_CITATIONS);
}

// ── public service ───────────────────────────────────────────────────────────

export const CitationService = {
  MAX_CITATIONS,

  /** Verify a caller-supplied reference list (mid-research, no artifact). */
  async verifyIdentifiers(refs: CitationVerifyRef[]): Promise<VerificationResult> {
    const items = await runVerificationBatch(refs.slice(0, MAX_CITATIONS));
    return { status: "completed", summary: tally(items), items, caveat: NEUTRAL_CAVEAT };
  },

  /** Extract a finished document's bibliography and verify it. */
  async verifyCitations(artifactText: string): Promise<VerificationResult> {
    const citations = extractCitations(artifactText);
    if (citations.length === 0) {
      return {
        status: "completed",
        summary: { checked: 0, verified: 0, flagged: 0 },
        items: [],
        caveat: NEUTRAL_CAVEAT,
        note: "No parseable references section was found in this document.",
      };
    }
    return this.verifyIdentifiers(citations);
  },
};
