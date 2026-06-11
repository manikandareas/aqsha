import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { recordProviderUsage } from "../../billing/entitlements";
import { rateLimiter } from "../../limits";
import { normalizeDoi } from "../../lib/identifiers";
import { authorOverlap, titleSimilarity } from "../../lib/similarity";
import {
  lookupDoiProvider,
  providerFailureReason,
  searchArxivProvider,
  type ExternalCandidate,
} from "../providers/externalProviders";
import { searchOpenAlexWorks } from "../providers/openalexProvider";
import { normalizeArxivId } from "./sourceQuality";

// ── Contract ────────────────────────────────────────────────────────────────

// One of the five integrity verdicts persisted on researchSources.integrityStatus.
export type IntegrityStatus =
  | "verified"
  | "metadata_mismatch"
  | "identifier_invalid"
  | "not_found"
  | "unverifiable";

// The citation under test. Built from a persisted researchSources row (auto
// path) or from a paper's bibliography entry (chat-tool path).
export type CitationInput = {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxivId?: string;
  url?: string;
};

// A run's final citation, loaded from researchSources and shaped for the engine.
export type RunCitationSource = {
  sourceId: Id<"researchSources">;
  title: string;
  doi?: string;
  arxivId?: string;
  url?: string;
  authors?: string[];
  year?: number;
  venue?: string;
};

// Per-step signals fed to the pure classifier. `null` means "the step could
// not run / was not applicable" (e.g. a provider error), which is treated
// conservatively — never as evidence of fabrication (discrepancy ≠ fraud).
export type IntegritySignals = {
  hasIdentifier: boolean;
  identifierResolved: boolean | null;
  identifierTitleMatch: boolean | null;
  existenceFound: boolean | null;
  metadataConsistent: boolean | null;
  metadataIssues: string[];
};

// Title-match thresholds. Existence is lenient (we only need to find the work);
// an identifier claiming a different title is the strong negative signal.
const EXISTENCE_TITLE_THRESHOLD = 0.7;
const IDENTIFIER_TITLE_THRESHOLD = 0.6;
const AUTHOR_OVERLAP_THRESHOLD = 0.5;
const VENUE_SIMILARITY_THRESHOLD = 0.5;
const YEAR_TOLERANCE = 1;

// ── Pure helpers (unit-tested in isolation) ──────────────────────────────────

// Compare the cited metadata against the resolved record's metadata. Returns
// the issues found; an empty list means consistent.
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

// Pure decision: map the four-step signals to a single integrity verdict. The
// identifier is the strongest signal; absent/unresolvable identifiers fall back
// to existence + metadata. Conservative by construction.
export function classifyIntegrity(s: IntegritySignals): IntegrityStatus {
  if (s.hasIdentifier && s.identifierResolved !== null) {
    if (s.identifierResolved === false) {
      return "identifier_invalid";
    }
    // Resolved: a different title means the identifier points elsewhere.
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
  // Nothing could be checked (no identifier resolution + no existence signal).
  return "unverifiable";
}

// ── Provider orchestration (service mode — no per-user charge) ────────────────

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
// failure sentinel (Crossref/arXiv swallow errors into a marker candidate).
function asResolvedRecord(
  candidates: ExternalCandidate[],
): ExternalCandidate | null {
  const real = candidates.find(
    (candidate) => providerFailureReason(candidate) === null && candidate.title,
  );
  return real ?? null;
}

// Run the 4-step check for one citation. Throws nothing fatal — provider errors
// degrade the relevant signal to `null` (→ unverifiable), never to a false
// accusation.
export async function verifyOneCitation(
  ctx: ActionCtx,
  ownerUserId: string,
  input: CitationInput,
): Promise<{ status: IntegrityStatus; signals: IntegritySignals; matchedTitle?: string }> {
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
        const record = asResolvedRecord(
          await lookupDoiProvider(ctx, { ownerUserId, doi, serviceMode: true }),
        );
        if (record) {
          signals.identifierResolved = true;
          signals.identifierTitleMatch =
            titleSimilarity(input.title, record.title) >= IDENTIFIER_TITLE_THRESHOLD;
          matched = record;
        }
        // A failure sentinel leaves identifierResolved = null (could be a
        // transient Crossref outage, not proof the DOI is fake).
      }
    } else if (input.arxivId) {
      const id = normalizeArxivId(input.arxivId) ?? input.arxivId;
      const record = asResolvedRecord(
        await searchArxivProvider(ctx, {
          ownerUserId,
          query: id,
          limit: 1,
          serviceMode: true,
        }),
      );
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
      const works = await searchOpenAlexWorks(ctx, {
        ownerUserId,
        query,
        limit: 5,
        serviceMode: true,
      });
      const best = works
        .filter((work) => providerFailureReason(work) === null)
        .map((work) => ({ work, score: titleSimilarity(input.title, work.title) }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= EXISTENCE_TITLE_THRESHOLD) {
        signals.existenceFound = true;
        matched = matched ?? best.work;
      } else {
        signals.existenceFound = false;
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

// ── Convex functions ──────────────────────────────────────────────────────────

// Load the final report citations for a run (persisted by persistSourcesForRun
// with usage="accepted" + an artifactId), shaped for the engine.
export const listRunCitationSources = internalQuery({
  args: { ownerUserId: v.string(), runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("researchSources")
      .withIndex("by_owner_run", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
      )
      .take(120);
    return rows
      .filter((row) => row.usage === "accepted" && row.artifactId !== undefined)
      .map((row) => {
        const meta = row.metadataJson ? parseMeta(row.metadataJson) : {};
        return {
          sourceId: row._id,
          title: row.title,
          doi: row.doi,
          arxivId: row.arxivId,
          url: row.url,
          authors: meta.authors,
          year: meta.year,
          venue: meta.venue,
        };
      });
  },
});

function parseMeta(metadataJson: string): {
  authors?: string[];
  year?: number;
  venue?: string;
} {
  try {
    const meta = JSON.parse(metadataJson) as {
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

// Patch integrity onto the sources, record the (free) usage event, and write a
// provenance event — all in one transaction. Owner-scoped patches only.
export const applySourceIntegrity = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.optional(v.string()),
    runId: v.id("agentRuns"),
    updates: v.array(
      v.object({
        sourceId: v.id("researchSources"),
        status: v.union(
          v.literal("verified"),
          v.literal("metadata_mismatch"),
          v.literal("identifier_invalid"),
          v.literal("not_found"),
          v.literal("unverifiable"),
        ),
        detailJson: v.string(),
      }),
    ),
    summary: v.object({
      total: v.number(),
      verified: v.number(),
      flagged: v.number(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const update of args.updates) {
      const row = await ctx.db.get("researchSources", update.sourceId);
      if (!row || row.ownerUserId !== args.ownerUserId) {
        continue;
      }
      await ctx.db.patch("researchSources", update.sourceId, {
        integrityStatus: update.status,
        integrityDetailJson: update.detailJson,
        integrityCheckedAt: now,
      });
    }

    // Usage-tracked, not charged (citation_verify is a free feature; the auto
    // path's providers ran in service mode). Records the ledger + rollup.
    await recordProviderUsage(ctx, {
      ownerUserId: args.ownerUserId,
      feature: "citation_verify",
      credits: 0,
      provider: "openalex",
      threadId: args.threadId,
      runId: args.runId,
    });

    if (args.threadId) {
      await ctx.db.insert("agentRunEvents", {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        eventType: "citation_check",
        title: "Verifikasi sitasi",
        summary: `${args.summary.verified}/${args.summary.total} sitasi terverifikasi${
          args.summary.flagged > 0 ? `, ${args.summary.flagged} perlu ditinjau` : ""
        }`,
        createdAt: now,
      });
    }
    return null;
  },
});

// Record the (free) citation_verify usage event for the chat-tool path, which
// verifies a paper's bibliography rather than a run's persisted sources.
export const recordCitationVerifyUsage = internalMutation({
  args: { ownerUserId: v.string(), threadId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordProviderUsage(ctx, {
      ownerUserId: args.ownerUserId,
      feature: "citation_verify",
      credits: 0,
      provider: "openalex",
      threadId: args.threadId,
    });
    return null;
  },
});

const VERIFY_CONCURRENCY = 4;
const FLAGGED_STATUSES = new Set<IntegrityStatus>([
  "metadata_mismatch",
  "identifier_invalid",
  "not_found",
]);

// Auto-verify every final source of a deep-research run. Fire-and-forget from
// persistArtifact: non-fatal (a rate-limit or provider failure simply leaves
// integrity unset) and idempotent (re-running just re-patches).
export const verifyCitationsForRun = internalAction({
  args: {
    ownerUserId: v.string(),
    threadId: v.optional(v.string()),
    runId: v.id("agentRuns"),
  },
  returns: v.object({
    verified: v.number(),
    total: v.number(),
    rateLimited: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Explicit annotation works around the same-file runQuery TS circularity.
    const sources: RunCitationSource[] = await ctx.runQuery(
      internal.agent.research.citationIntegrity.listRunCitationSources,
      { ownerUserId: args.ownerUserId, runId: args.runId },
    );
    if (sources.length === 0) {
      return { verified: 0, total: 0, rateLimited: false };
    }
    // One token per run batch (not per source) so a 14-source run is one unit.
    const gate = await rateLimiter.check(ctx, "citationVerifyPerUser", {
      key: args.ownerUserId,
    });
    if (!gate.ok) {
      return { verified: 0, total: sources.length, rateLimited: true };
    }

    const results: Array<{
      sourceId: Id<"researchSources">;
      status: IntegrityStatus;
      detailJson: string;
    }> = [];
    for (let i = 0; i < sources.length; i += VERIFY_CONCURRENCY) {
      const chunk = sources.slice(i, i + VERIFY_CONCURRENCY);
      const settled = await Promise.all(
        chunk.map(async (source) => {
          try {
            const result = await verifyOneCitation(ctx, args.ownerUserId, source);
            return {
              sourceId: source.sourceId,
              status: result.status,
              detailJson: JSON.stringify({
                signals: result.signals,
                matchedTitle: result.matchedTitle,
              }),
            };
          } catch {
            return {
              sourceId: source.sourceId,
              status: "unverifiable" as IntegrityStatus,
              detailJson: JSON.stringify({ error: true }),
            };
          }
        }),
      );
      results.push(...settled);
    }

    await rateLimiter.limit(ctx, "citationVerifyPerUser", {
      key: args.ownerUserId,
    });

    const verified = results.filter((r) => r.status === "verified").length;
    const flagged = results.filter((r) => FLAGGED_STATUSES.has(r.status)).length;
    await ctx.runMutation(
      internal.agent.research.citationIntegrity.applySourceIntegrity,
      {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        updates: results,
        summary: { total: results.length, verified, flagged },
      },
    );
    return { verified, total: results.length, rateLimited: false };
  },
});
