import { describe, expect, it } from "vitest";
import {
  assessEvidenceReadiness,
  type DiscoveryCandidate,
  type ResearchExtract,
} from "../convex/agent/research/deepResearch";
import { canonicalSourceKey } from "../convex/agent/research/sourceQuality";

// AUD-15 (Slice 3.4): the evidence floor is tier-scaled — Astra Lite (roundCap 2)
// is held to a lower floor than Astra Pro (roundCap 4), and readiness names which
// floor failed at which tier.

function sources(count: number, buckets: string[]): DiscoveryCandidate[] {
  return Array.from({ length: count }, (_, i) => {
    const bucketName = buckets[i % buckets.length];
    return {
      origin: "web" as const,
      provider: "exa" as const,
      evidenceStrength: "medium" as const,
      title: `Report ${i}`,
      locator: `https://domain-${i}.example/report`,
      url: `https://domain-${i}.example/report`,
      snippet: "snippet",
      bucketName,
      metadataJson: JSON.stringify({ bucketName }),
      citationNumber: i + 1,
      readStatus: "ready" as const,
    };
  });
}

function extracts(srcs: DiscoveryCandidate[], count: number, strong: number): ResearchExtract[] {
  return srcs.slice(0, count).map((s, i) => ({
    sourceKey: canonicalSourceKey(s),
    citationNumber: i + 1,
    title: s.title,
    locator: s.locator,
    quote: "Readable evidence extract. ".repeat(20),
    relevance: i < strong ? "high" : "medium",
  }));
}

describe("assessEvidenceReadiness tier-scaled floor", () => {
  // 7 sources across 3 buckets, 5 extracts (4 strong): clears the Lite floor
  // (sources>=6, extracts>=5, domains>=3, buckets>=2, strong>=3) but NOT the Pro
  // floor (sources>=10, extracts>=8).
  const srcs = sources(7, ["academic", "industry", "government"]);
  const exs = extracts(srcs, 5, 4);

  it("Lite is ready where Pro is not", () => {
    const lite = assessEvidenceReadiness(srcs, exs, "lite");
    const pro = assessEvidenceReadiness(srcs, exs, "pro");
    expect(lite.ready).toBe(true);
    expect(lite.tier).toBe("lite");
    expect(pro.ready).toBe(false);
    expect(pro.tier).toBe("pro");
  });

  it("names the binding floor + tier in the recommendation", () => {
    const pro = assessEvidenceReadiness(srcs, exs, "pro");
    expect(pro.recommendation).toContain("pro floor");
    expect(pro.recommendation).toMatch(/readable sources/);
    const failedKeys = pro.floors.filter((f) => !f.met).map((f) => f.key);
    expect(failedKeys).toContain("readable sources");
    expect(failedKeys).toContain("accepted extracts");
  });

  it("exposes a structured floor breakdown with have/floor/met", () => {
    const lite = assessEvidenceReadiness(srcs, exs, "lite");
    const sourceFloor = lite.floors.find((f) => f.key === "readable sources");
    expect(sourceFloor).toEqual({ key: "readable sources", have: 7, floor: 6, met: true });
  });

  it("defaults to the Pro floor when agentKind is omitted (backward-compatible)", () => {
    const def = assessEvidenceReadiness(srcs, exs);
    expect(def.tier).toBe("pro");
    expect(def.ready).toBe(false);
  });
});
