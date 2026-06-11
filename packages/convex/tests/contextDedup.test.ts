import { describe, expect, it } from "vitest";
import { isArtifactFullyIncluded } from "../convex/agent/context/threadContext";

// Slice R3.1 (AUD-17): an artifact is "fully included" (and so dropped from RAG to
// avoid duplicate text) only when neither the per-artifact 4k clip nor the running
// budget dropped any content. Truncated artifacts stay RAG-eligible.

describe("isArtifactFullyIncluded", () => {
  it("is true when content fits and was not per-artifact truncated", () => {
    expect(isArtifactFullyIncluded({ truncated: false, content: "short body" }, 16_000)).toBe(true);
  });

  it("is false when the per-artifact 4k clip dropped content (tail still RAG-eligible)", () => {
    // truncated=true means getPromptContextArtifact already clipped the source.
    expect(isArtifactFullyIncluded({ truncated: true, content: "x".repeat(4_000) }, 16_000)).toBe(false);
  });

  it("is false when the running budget cannot fit the (untruncated) content", () => {
    expect(isArtifactFullyIncluded({ truncated: false, content: "x".repeat(500) }, 200)).toBe(false);
  });

  it("collapses whitespace before measuring against the budget", () => {
    const padded = `${" ".repeat(400)}body${" ".repeat(400)}`;
    // collapsed length is ~6, well under budget → included despite raw length 800.
    expect(isArtifactFullyIncluded({ truncated: false, content: padded }, 50)).toBe(true);
  });
});
