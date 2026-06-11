import { describe, expect, it } from "vitest";
import {
  assessEvidenceReadiness,
  shouldReviseUnsupportedClaims,
  type DiscoveryCandidate,
  type ResearchExtract,
} from "../convex/agent/research/deepResearch";
import { canonicalSourceKey } from "../convex/agent/research/sourceQuality";

// Behavior-preservation baseline for the Slice 3.1 decomposition (authored FIRST,
// before any refactor). The deep-research workflow handler drives its round loop
// off SCALAR decisions: per round it asks "is the evidence ready/sufficient?" to
// decide whether to continue, and after synthesis it asks "must any unsupported
// claim be revised?". Slice 3.1 hoists that loop out of the monolith into the
// workflow handler — these helpers move into subagents/* but their OUTPUTS must
// not change. This test pins the COMPOSITE decision trace (the integration of the
// pure helpers the way the pipeline composes them); deepResearch.test.ts already
// pins each helper individually. Counts/ready/status are stable across 3.1; the
// AUD-15 tier-scaled floor (Slice 3.4) will intentionally update the trace then.

function sourceFixture(domainCount: number, buckets: string[]): DiscoveryCandidate[] {
  return Array.from({ length: domainCount }, (_, index) => {
    const bucketName = buckets[index % buckets.length];
    return {
      origin: "web" as const,
      provider: "exa" as const,
      evidenceStrength: "medium" as const,
      title: `Report ${index}`,
      locator: `https://domain-${index}.example/report`,
      url: `https://domain-${index}.example/report`,
      snippet: "Discovery snippet.",
      bucketName,
      discoveryQuery: `${bucketName} query`,
      // bucket coverage is read from metadataJson (mirrors deepResearch.test.ts).
      metadataJson: JSON.stringify({ bucketName }),
      citationNumber: index + 1,
      readStatus: "ready" as const,
    };
  });
}

function extractFixture(
  sources: DiscoveryCandidate[],
  count: number,
  highCount: number,
): ResearchExtract[] {
  return sources.slice(0, count).map((source, index) => ({
    sourceKey: canonicalSourceKey(source),
    citationNumber: index + 1,
    title: source.title,
    locator: source.locator,
    quote: "Detailed readable evidence extract. ".repeat(24),
    relevance: index < highCount ? "high" : "medium",
  }));
}

/** The scalar trace the workflow handler reads to decide loop continuation. */
function readinessTrace(sources: DiscoveryCandidate[], extracts: ResearchExtract[]) {
  const r = assessEvidenceReadiness(sources, extracts);
  return {
    ready: r.ready,
    status: r.status,
    continueLoop: !r.ready,
    readableSourceCount: r.readableSourceCount,
    domainCount: r.domainCount,
    bucketCount: r.bucketCount,
    extractCount: r.extractCount,
    highQualityExtractCount: r.highQualityExtractCount,
  };
}

describe("deep-research pipeline decision trace (3.1 baseline)", () => {
  it("strong evidence -> sufficient, loop stops", () => {
    const sources = sourceFixture(10, ["academic", "industry reports", "government/regulation"]);
    const extracts = extractFixture(sources, 8, 4);
    expect(readinessTrace(sources, extracts)).toEqual({
      ready: true,
      status: "sufficient",
      continueLoop: false,
      readableSourceCount: 10,
      domainCount: 10,
      bucketCount: 3,
      extractCount: 8,
      highQualityExtractCount: 8,
    });
  });

  it("thin evidence -> not ready, loop continues", () => {
    const sources = sourceFixture(3, ["academic"]);
    const extracts = extractFixture(sources, 2, 1);
    const trace = readinessTrace(sources, extracts);
    expect(trace.ready).toBe(false);
    expect(trace.continueLoop).toBe(true);
    expect(trace.status).not.toBe("sufficient");
    expect(trace.readableSourceCount).toBe(3);
  });

  it("revision gate: contradicted / no-evidence-unsupported revise, extract-backed do not", () => {
    const trace = {
      // unsupported but a textual extract backs it (low confidence) -> not revised
      unsupportedWithExtract: shouldReviseUnsupportedClaims([
        { support: "unsupported", claim: "Minor aside with a citation.", confidence: 0.3, extractKeys: ["k1"] },
      ]),
      // Slice 3.2 agentic-RAG enforcement: unsupported + no extract + no computation -> revised
      unsupportedNoEvidence: shouldReviseUnsupportedClaims([
        { support: "unsupported", claim: "An unsupported aside with no backing.", confidence: 0.3 },
      ]),
      contradicted: shouldReviseUnsupportedClaims([
        { support: "contradicted", claim: "A contradicted claim.", confidence: 0.2 },
      ]),
      allSupported: shouldReviseUnsupportedClaims([
        { support: "supported", claim: "A supported claim.", confidence: 0.9 },
      ]),
    };
    expect(trace).toEqual({
      unsupportedWithExtract: false,
      unsupportedNoEvidence: true,
      contradicted: true,
      allSupported: false,
    });
  });
});
