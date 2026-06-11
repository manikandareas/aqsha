import { describe, expect, it } from "vitest";
import { createCitationCounter } from "../convex/agent/research/researchTools";

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
