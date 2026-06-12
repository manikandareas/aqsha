import type { ExternalCandidate, IntegrityStatus } from "@aqsha/agent-contracts";
import { normalizeArxivId, normalizeDoi } from "../lib/identifiers";
import { authorOverlap, titleSimilarity } from "../lib/similarity";
import { providerFailureReason } from "../providers/types";

// Citation-integrity engine, ported from agent/research/citationIntegrity.ts.
// The pure classifier is unchanged; provider orchestration now takes an
// injected CitationProviders bundle instead of a Convex ActionCtx, so the
// engine is unit-testable with fakes and reusable by tools + subagents.

export type { IntegrityStatus };

export type CitationInput = {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxivId?: string;
  url?: string;
};

// Per-step signals fed to the pure classifier. `null` means "the step could
// not run / was not applicable" — treated conservatively, never as evidence of
// fabrication (discrepancy ≠ fraud).
export type IntegritySignals = {
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

// Compare the cited metadata against the resolved record's metadata.
export function compareMetadata(
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

// Pure decision: map the four-step signals to a single integrity verdict.
export function classifyIntegrity(s: IntegritySignals): IntegrityStatus {
  if (s.hasIdentifier && s.identifierResolved !== null) {
    if (s.identifierResolved === false) {
      return "identifier_invalid";
    }
    if (s.identifierTitleMatch === false) {
      return "identifier_invalid";
    }
    if (s.metadataConsistent === false) {
      return "metadata_mismatch";
    }
    return "verified";
  }
  if (s.existenceFound === true) {
    return s.metadataConsistent === false ? "metadata_mismatch" : "verified";
  }
  if (s.existenceFound === false) {
    return "not_found";
  }
  return "unverifiable";
}

export type CitationProviders = {
  lookupDoi: (doi: string) => Promise<ExternalCandidate[]>;
  searchArxiv: (query: string, limit: number) => Promise<ExternalCandidate[]>;
  searchOpenAlex: (query: string, limit: number) => Promise<ExternalCandidate[]>;
};

function parseCandidateMeta(candidate: ExternalCandidate): {
  authors?: string[];
  year?: number;
  venue?: string;
} {
  if (!candidate.metadataJson) {
    return {};
  }
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

// A returned candidate is a real resolution only when it is not a provider
// failure sentinel.
function asResolvedRecord(candidates: ExternalCandidate[]): ExternalCandidate | null {
  const real = candidates.find(
    (candidate) => providerFailureReason(candidate) === null && candidate.title,
  );
  return real ?? null;
}

// Run the 4-step check for one citation. Provider errors degrade the relevant
// signal to `null` (→ unverifiable), never to a false accusation.
export async function verifyOneCitation(
  providers: CitationProviders,
  input: CitationInput,
): Promise<{
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
  let matched: ExternalCandidate | null = null;

  // Step 3 (identifier validation) first — it is the strongest signal.
  try {
    if (input.doi) {
      const doi = normalizeDoi(input.doi);
      if (doi) {
        const record = asResolvedRecord(await providers.lookupDoi(doi));
        if (record) {
          signals.identifierResolved = true;
          signals.identifierTitleMatch =
            titleSimilarity(input.title, record.title) >= IDENTIFIER_TITLE_THRESHOLD;
          matched = record;
        }
      }
    } else if (input.arxivId) {
      const id = normalizeArxivId(input.arxivId) ?? input.arxivId;
      const record = asResolvedRecord(await providers.searchArxiv(id, 1));
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
      const works = await providers.searchOpenAlex(query, 5);
      const real = works.filter((work) => providerFailureReason(work) === null);
      if (works.length > 0 && real.length === 0) {
        // Only failure sentinels came back — a provider outage is no signal,
        // never evidence the work does not exist.
      } else {
        const best = real
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

  return {
    status: classifyIntegrity(signals),
    signals,
    matchedTitle: matched?.title,
  };
}

export const FLAGGED_INTEGRITY_STATUSES: ReadonlySet<IntegrityStatus> = new Set([
  "metadata_mismatch",
  "identifier_invalid",
  "not_found",
]);
