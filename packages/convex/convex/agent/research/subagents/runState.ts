import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../../_generated/server";
import type { MutationCtx } from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { throwAppError } from "../../../lib/appError";
import { sourceCandidateValidator, type SourceCandidate } from "../sourceCandidates";
import type { ResearchExtract } from "../deepResearch";
import {
  addToBudget,
  parseBudgetEnvelope,
  serializeBudgetEnvelope,
  subagentBudgetValidator,
} from "./contracts";
import { parseRoundSnapshot, type RoundSnapshot } from "./loopState";

// ID-keyed run-state surface shared by the deep-research subagents (Phase 3,
// Slice 3.1): the writer stages its markdown here, the auditor restages the
// revised version, and each subagent folds its consumption into the budget
// envelope. Keeping bulk markdown on the run row (not in step returns) is what
// holds every workflow step under the 1 MB limit.

async function assertRunOwner(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  ownerUserId: string,
) {
  const run = await ctx.db.get("agentRuns", runId);
  if (!run || run.ownerUserId !== ownerUserId) {
    throwAppError({
      code: "agent_run_not_found",
      message: "Agent run tidak ditemukan.",
      severity: "error",
    });
    throw new Error("unreachable");
  }
  return run;
}

// Stage (or restage) the report markdown on the run — writer -> auditor ->
// finalizeArtifactContent read it back by runId instead of journaling the full
// report between steps.
export const setRunDraftMarkdown = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    markdown: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.patch("agentRuns", args.runId, {
      draftMarkdown: args.markdown,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getRunDraftMarkdown = internalQuery({
  args: { runId: v.id("agentRuns"), ownerUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId) return null;
    return run.draftMarkdown ?? null;
  },
});

// Fold one subagent's consumption (tokens / provider calls / sandbox minutes)
// into agentRuns.budgetJson. Read-modify-write is safe because split timing runs
// the subagents sequentially (no two fan-out steps write the row at once).
export const updateBudget = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    subagent: v.string(),
    delta: subagentBudgetValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await assertRunOwner(ctx, args.runId, args.ownerUserId);
    const next = addToBudget(parseBudgetEnvelope(run.budgetJson), args.subagent, args.delta);
    await ctx.db.patch("agentRuns", args.runId, {
      budgetJson: serializeBudgetEnvelope(next),
      updatedAt: Date.now(),
    });
    return null;
  },
});

// ── Verification degradation markers (Slice R1c/R1d) ──────────────────────────
// A non-fatal verifier (citation / statistical / semantic) appends a marker here
// instead of throwing; the finalizer reads them to ship a "verification
// incomplete" section. Read-modify-write is OCC-safe under split timing (verifiers
// run sequentially).

export interface VerificationMarker {
  marker: string;
  reason: string;
}

// AUD/Slice R1d: when any non-fatal verifier degraded, the report ships a visible
// "verification incomplete" caveat instead of the run failing. Pure so the writer
// can append it deterministically and it can be unit-tested.
const VERIFICATION_REASON_LABELS: Record<string, string> = {
  citation_rate_limited: "verifikasi integritas sitasi dibatasi rate limit",
  citation_failed: "verifikasi integritas sitasi gagal dijalankan",
  statistical_not_configured: "verifikasi statistik tidak tersedia di lingkungan ini",
  statistical_failed: "verifikasi statistik gagal dijalankan",
};

export function buildVerificationCaveat(markers: VerificationMarker[]): string {
  if (markers.length === 0) return "";
  const reasons = [...new Set(markers.map((m) => VERIFICATION_REASON_LABELS[m.reason] ?? m.reason))];
  return [
    "> **Catatan verifikasi: tidak lengkap.**",
    ">",
    `> Sebagian pemeriksaan otomatis tidak selesai (${reasons.join("; ")}). `,
    "> Klaim tetap didasarkan pada sumber yang dikutip, namun perlakukan angka dan",
    "> klaim yang belum terverifikasi dengan hati-hati.",
  ].join("\n");
}

export function appendVerificationCaveat(markdown: string, markers: VerificationMarker[]): string {
  const caveat = buildVerificationCaveat(markers);
  if (!caveat) return markdown;
  return `${markdown.trimEnd()}\n\n${caveat}\n`;
}

export function parseVerificationMarkers(json?: string | null): VerificationMarker[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is VerificationMarker =>
        Boolean(m) && typeof m === "object" && typeof (m as VerificationMarker).marker === "string",
    );
  } catch {
    return [];
  }
}

export const setVerificationMarker = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    marker: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await assertRunOwner(ctx, args.runId, args.ownerUserId);
    const markers = parseVerificationMarkers(run.verificationMarkersJson);
    markers.push({ marker: args.marker, reason: args.reason });
    await ctx.db.patch("agentRuns", args.runId, {
      verificationMarkersJson: JSON.stringify(markers),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getVerificationMarkers = internalQuery({
  args: { runId: v.id("agentRuns"), ownerUserId: v.string() },
  returns: v.array(v.object({ marker: v.string(), reason: v.string() })),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId) return [];
    return parseVerificationMarkers(run.verificationMarkersJson);
  },
});

// ── Cross-round state read-back (Slice 3.1 Task 2) ────────────────────────────
// literatureRoundAgent re-reads these by runId at entry and feeds them through
// the pure rehydrateLoopState (subagents/loopState.ts) — the persisted half of
// the accumulation that no longer survives across decomposed round steps.

const SOURCE_SCAN = 400;
const EXTRACT_SCAN = 100;

function rowToSourceCandidate(row: Doc<"researchSources">): SourceCandidate {
  return {
    citationNumber: row.citationNumber,
    sourceKey: row.sourceKey,
    usage: row.usage,
    origin: row.origin,
    provider: row.provider,
    providerRequestId: row.providerRequestId,
    evidenceStrength: row.evidenceStrength,
    title: row.title,
    locator: row.locator,
    url: row.url,
    doi: row.doi,
    arxivId: row.arxivId,
    snippet: row.snippet,
    readStatus: row.readStatus,
    readError: row.readError,
    qualityReason: row.qualityReason,
    bucketName: row.bucketName,
    discoveryQuery: row.discoveryQuery,
    rerankScore: row.rerankScore,
    metadataJson: row.metadataJson,
  };
}

// Accepted sources (reconstructed as SourceCandidate) + rejected source keys for
// a run, in one pass over the run's researchSources.
export const listRunSourceState = internalQuery({
  args: { ownerUserId: v.string(), runId: v.id("agentRuns") },
  returns: v.object({
    accepted: v.array(sourceCandidateValidator),
    rejected: v.array(sourceCandidateValidator),
    rejectedKeys: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("researchSources")
      .withIndex("by_owner_run", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
      )
      .take(SOURCE_SCAN);
    const accepted: SourceCandidate[] = [];
    const rejected: SourceCandidate[] = [];
    const rejectedKeys: string[] = [];
    for (const row of rows) {
      if (row.usage === "accepted") accepted.push(rowToSourceCandidate(row));
      else if (row.usage === "rejected") {
        // Full candidate for round-≥2 domain biasing; key for dedupe sets.
        rejected.push(rowToSourceCandidate(row));
        if (row.sourceKey) rejectedKeys.push(row.sourceKey);
      }
    }
    return { accepted, rejected, rejectedKeys };
  },
});

export const listExtractsForRun = internalQuery({
  args: { ownerUserId: v.string(), runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<ResearchExtract[]> => {
    const rows = await ctx.db
      .query("researchExtracts")
      .withIndex("by_owner_run", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
      )
      .take(EXTRACT_SCAN);
    return rows.map((row) => ({
      sourceKey: row.sourceKey,
      citationNumber: row.citationNumber,
      title: row.title,
      locator: row.locator,
      quote: row.quote,
      relevance: row.relevance,
      notes: row.notes,
    }));
  },
});

export const getLatestRoundSnapshot = internalQuery({
  args: { ownerUserId: v.string(), runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<RoundSnapshot | null> => {
    const latest = await ctx.db
      .query("researchRoundStates")
      .withIndex("by_owner_run_round", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
      )
      .order("desc")
      .first();
    return parseRoundSnapshot(latest?.stateJson);
  },
});
