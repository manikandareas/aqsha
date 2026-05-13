import { describe, expect, it } from "vitest";
import {
  dedupeCandidatesForPersistence,
  sourceKeyForCandidate,
  usageForCandidate,
} from "../convex/agent/sources";
import type { SourceCandidate } from "../convex/agent/sourceCandidates";

describe("source provenance persistence helpers", () => {
  it("marks cited normal-mode candidates and keeps uncited candidates visible", () => {
    expect(usageForCandidate(candidate(1), new Set([1]))).toBe("cited");
    expect(usageForCandidate(candidate(2), new Set([1]))).toBe("candidate");
  });

  it("preserves explicit accepted and rejected deep-research usage", () => {
    expect(usageForCandidate(candidate(1, { usage: "accepted" }), new Set())).toBe("accepted");
    expect(usageForCandidate(candidate(2, { usage: "rejected" }), new Set([2]))).toBe("rejected");
  });

  it("dedupes by canonical source key", () => {
    const abs = candidate(1, {
      title: "Attention Is All You Need",
      locator: "https://arxiv.org/abs/1706.03762v7",
      url: "https://arxiv.org/abs/1706.03762v7",
    });
    const pdf = candidate(2, {
      title: "Attention Is All You Need",
      locator: "https://arxiv.org/pdf/1706.03762v7.pdf",
      url: "https://arxiv.org/pdf/1706.03762v7.pdf",
    });

    expect(sourceKeyForCandidate(abs)).toBe("arxiv:1706.03762");
    expect(dedupeCandidatesForPersistence([abs, pdf])).toHaveLength(1);
  });
});

function candidate(
  citationNumber: number,
  overrides: Partial<SourceCandidate> = {},
): SourceCandidate {
  return {
    citationNumber,
    origin: "web",
    evidenceStrength: "medium",
    title: `Source ${citationNumber}`,
    locator: `https://example.com/${citationNumber}`,
    url: `https://example.com/${citationNumber}`,
    snippet: "Snippet",
    ...overrides,
  };
}
