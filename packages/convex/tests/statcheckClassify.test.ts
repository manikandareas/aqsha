import { describe, expect, it } from "vitest";
import {
  buildClaimText,
  classifyStatcheckRow,
  parseStatcheckStdout,
  summarizeOutcomes,
  type StatcheckRawRow,
} from "../convex/agent/sandbox/statcheckClassify";

// Slice 1.1: the verdict (consistent/discrepant/decision_error/not_computable)
// is recomputed in TS from statcheck's raw reported-vs-recomputed p under an
// explicit tolerance — no live sandbox needed. These assertions lock that
// deterministic mapping so the stored raw numbers and the interpretation stay
// decoupled.

function row(overrides: Partial<StatcheckRawRow>): StatcheckRawRow {
  return {
    reportedComparison: "=",
    reportedPValue: null,
    computedPValue: null,
    ...overrides,
  };
}

describe("classifyStatcheckRow", () => {
  it("marks an exact reported = recomputed match as consistent", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "=", reportedPValue: 0.04, computedPValue: 0.04 }),
      ),
    ).toBe("consistent");
  });

  it("treats a recomputed value that rounds to the reported value as consistent", () => {
    // .043 rounds to .04 at the reported precision (2 decimals).
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "=", reportedPValue: 0.04, computedPValue: 0.043 }),
      ),
    ).toBe("consistent");
  });

  it("flags a numeric mismatch (same decision) as discrepant", () => {
    // Both significant, but .02 does not reconcile with reported .04.
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "=", reportedPValue: 0.04, computedPValue: 0.02 }),
      ),
    ).toBe("discrepant");
  });

  it("flags a flipped significance decision as decision_error (sig → ns)", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "=", reportedPValue: 0.04, computedPValue: 0.06 }),
      ),
    ).toBe("decision_error");
  });

  it("flags a flipped significance decision as decision_error (ns → sig)", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "=", reportedPValue: 0.08, computedPValue: 0.03 }),
      ),
    ).toBe("decision_error");
  });

  it("returns not_computable when statcheck could not recompute the p-value", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "=", reportedPValue: 0.04, computedPValue: null }),
      ),
    ).toBe("not_computable");
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "<", reportedPValue: null, computedPValue: 0.04 }),
      ),
    ).toBe("not_computable");
  });

  it("honors the < comparison: below the threshold is consistent", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "<", reportedPValue: 0.05, computedPValue: 0.03 }),
      ),
    ).toBe("consistent");
  });

  it("honors the < comparison: far above the bound (same decision) is discrepant", () => {
    // Reported p < .001 (significant) but recomputed .03 (still significant, so
    // no decision flip) — the numbers don't reconcile.
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "<", reportedPValue: 0.001, computedPValue: 0.03 }),
      ),
    ).toBe("discrepant");
  });

  it("honors the < comparison: crossing alpha is a decision_error", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "<", reportedPValue: 0.05, computedPValue: 0.051 }),
      ),
    ).toBe("decision_error");
  });

  it("honors the > comparison: above the threshold (ns) is consistent", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: ">", reportedPValue: 0.05, computedPValue: 0.2 }),
      ),
    ).toBe("consistent");
  });

  it("honors the > comparison: a significant recompute is a decision_error", () => {
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: ">", reportedPValue: 0.05, computedPValue: 0.01 }),
      ),
    ).toBe("decision_error");
  });
});

describe("parseStatcheckStdout", () => {
  it("parses a JSON array of result rows", () => {
    const rows = parseStatcheckStdout(
      '[{"reportedComparison":"=","reportedPValue":0.04,"computedPValue":0.041,"raw":"t(28) = 2.10, p = .04","statcheckError":false}]',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reportedPValue).toBe(0.04);
    expect(rows[0].computedPValue).toBe(0.041);
    expect(rows[0].raw).toBe("t(28) = 2.10, p = .04");
    expect(rows[0].statcheckError).toBe(false);
  });

  it("returns an empty array for empty or non-array output", () => {
    expect(parseStatcheckStdout("")).toEqual([]);
    expect(parseStatcheckStdout("[]")).toEqual([]);
    expect(parseStatcheckStdout("not json at all")).toEqual([]);
    expect(parseStatcheckStdout("{}")).toEqual([]);
  });

  it("tolerates leading R noise before the JSON array", () => {
    const rows = parseStatcheckStdout(
      'Loading required package: foo\n[{"reportedComparison":"<","reportedPValue":0.05,"computedPValue":0.03}]',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reportedComparison).toBe("<");
  });
});

describe("summarizeOutcomes", () => {
  it("counts each outcome bucket", () => {
    expect(
      summarizeOutcomes([
        "consistent",
        "discrepant",
        "decision_error",
        "not_computable",
        "consistent",
      ]),
    ).toEqual({
      checked: 5,
      consistent: 2,
      discrepant: 1,
      decisionErrors: 1,
      notComputable: 1,
    });
  });

  it("returns an all-zero summary for no checks", () => {
    expect(summarizeOutcomes([])).toEqual({
      checked: 0,
      consistent: 0,
      discrepant: 0,
      decisionErrors: 0,
      notComputable: 0,
    });
  });
});

describe("buildClaimText", () => {
  it("uses the raw matched span when present", () => {
    expect(buildClaimText(row({ raw: "F(1, 28) = 5.10, p = .03" }))).toBe(
      "F(1, 28) = 5.10, p = .03",
    );
  });

  it("synthesizes a claim from fields when raw is absent", () => {
    expect(
      buildClaimText(
        row({
          statistic: "t",
          df1: 28,
          testValue: 2.1,
          reportedComparison: "=",
          reportedPValue: 0.04,
        }),
      ),
    ).toBe("t(28) = 2.1, p = 0.04");
  });
});
