import { describe, expect, it } from "vitest";
import {
  createCitationCounter,
  numberCandidates,
} from "../convex/agent/research/researchTools";
import type { SourceCandidate } from "../convex/agent/research/sourceCandidates";

type RawCandidate = Omit<SourceCandidate, "citationNumber">;

function realCandidate(title: string): RawCandidate {
  return {
    origin: "web",
    evidenceStrength: "moderate",
    title,
    locator: "https://example.org",
    snippet: "A genuine source snippet.",
  } as RawCandidate;
}

function providerFailureCandidate(): RawCandidate {
  return {
    origin: "academic",
    evidenceStrength: "weak",
    title: "Provider unavailable",
    locator: "arxiv timeout",
    snippet: "Source lookup failed: arxiv timeout",
    metadataJson: JSON.stringify({ providerFailure: true, reason: "arxiv timeout" }),
  } as RawCandidate;
}

// AUD-05: the research tools used to each create their own counter, so two tool
// calls in one turn both started at [1] and collided. The fix threads ONE counter
// per turn through the tool factory; these assertions lock the primitive that
// makes that work.
describe("citation counter", () => {
  it("yields a monotonic increasing sequence", () => {
    const counter = createCitationCounter(1);
    expect([counter.next(), counter.next(), counter.next()]).toEqual([1, 2, 3]);
  });

  it("a single shared counter numbers across multiple tool calls without collision", () => {
    const counter = createCitationCounter(1);
    const firstCall = [counter.next(), counter.next(), counter.next()];
    const secondCall = [counter.next(), counter.next()];
    expect(firstCall).toEqual([1, 2, 3]);
    expect(secondCall).toEqual([4, 5]);
    expect(new Set([...firstCall, ...secondCall]).size).toBe(5);
  });

  it("independent counters both restart at 1 (the bug the shared counter removes)", () => {
    const a = createCitationCounter(1);
    const b = createCitationCounter(1);
    expect(a.next()).toBe(1);
    expect(b.next()).toBe(1);
  });
});

// AUD-09: a provider failure is normalized to a synthetic "Provider unavailable"
// candidate. numberCandidates must drop it so the model can never cite the error
// message as a [n] source — and the dropped candidate must NOT consume a number.
describe("numberCandidates provider-failure filtering", () => {
  it("drops provider-failure candidates before numbering", () => {
    const counter = createCitationCounter(1);
    const out = numberCandidates(
      [realCandidate("Real A"), providerFailureCandidate(), realCandidate("Real B")],
      counter,
    );
    expect(out.map((c) => c.title)).toEqual(["Real A", "Real B"]);
    expect(out.map((c) => c.citationNumber)).toEqual([1, 2]);
  });

  it("returns an empty list (not a synthetic source) when every result failed", () => {
    const out = numberCandidates([providerFailureCandidate()], createCitationCounter(1));
    expect(out).toEqual([]);
  });
});
