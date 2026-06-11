import { describe, expect, it } from "vitest";
import {
  classifyGrimRow,
  parseGrimStdout,
  type GrimResultRow,
} from "../convex/agent/sandbox/grimClassify";
import {
  classifyPowerRow,
  parsePowerStdout,
  type PowerResultRow,
} from "../convex/agent/sandbox/powerClassify";
import {
  buildVerificationReport,
  verificationVerdict,
} from "../convex/agent/sandbox/verificationReport";
import { summarizeOutcomes } from "../convex/agent/sandbox/computationOutcome";
import {
  normalizeGrimClaims,
  normalizePowerClaims,
} from "../convex/agent/sandbox/claimExtraction";

// Slice 1.3: pure GRIM/GRIMMER + power classifiers, the verification-report
// verdict, and the LLM claim normalizers — all unit-testable without a sandbox
// or a model.

describe("classifyGrimRow", () => {
  function row(overrides: Partial<GrimResultRow>): GrimResultRow {
    return { label: "Group A", mean: 3.2, n: 20, items: 1, ...overrides };
  }

  it("emits a single GRIM check when no SD is provided", () => {
    const checks = classifyGrimRow(row({ grimConsistent: true }));
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ kind: "grim", outcome: "consistent" });
  });

  it("emits GRIM + GRIMMER checks when an SD is present", () => {
    const checks = classifyGrimRow(
      row({ sd: 1.1, grimConsistent: true, grimmerConsistent: false }),
    );
    expect(checks.map((c) => c.kind)).toEqual(["grim", "grimmer"]);
    expect(checks[1]).toMatchObject({ kind: "grimmer", outcome: "discrepant" });
  });

  it("maps an inconsistent flag to discrepant and a null flag to not_computable", () => {
    expect(classifyGrimRow(row({ grimConsistent: false }))[0].outcome).toBe(
      "discrepant",
    );
    expect(classifyGrimRow(row({ grimConsistent: null }))[0].outcome).toBe(
      "not_computable",
    );
  });
});

describe("parseGrimStdout", () => {
  it("parses rows and tolerates noise / empties", () => {
    expect(
      parseGrimStdout(
        '[{"label":"A","mean":3.2,"n":20,"items":1,"grimConsistent":true}]',
      ),
    ).toHaveLength(1);
    expect(parseGrimStdout("")).toEqual([]);
    expect(
      parseGrimStdout('noise\n[{"label":"A","mean":1,"n":2,"grimConsistent":false}]'),
    ).toHaveLength(1);
  });
});

describe("classifyPowerRow", () => {
  function row(overrides: Partial<PowerResultRow>): PowerResultRow {
    return { label: "H1", test: "t", n: 30, effectSize: 0.5, alpha: 0.05, ...overrides };
  }

  it("treats a computed power as consistent and flags inadequacy separately", () => {
    const low = classifyPowerRow(row({ power: 0.62 }));
    expect(low.outcome).toBe("consistent");
    expect(low.adequate).toBe(false);

    const high = classifyPowerRow(row({ power: 0.9 }));
    expect(high.outcome).toBe("consistent");
    expect(high.adequate).toBe(true);
  });

  it("maps an uncomputable power to not_computable", () => {
    const check = classifyPowerRow(row({ power: null }));
    expect(check.outcome).toBe("not_computable");
    expect(check.adequate).toBeNull();
  });
});

describe("parsePowerStdout", () => {
  it("parses rows and tolerates empties", () => {
    expect(
      parsePowerStdout('[{"label":"H1","test":"t","n":30,"effectSize":0.5,"power":0.62}]'),
    ).toHaveLength(1);
    expect(parsePowerStdout("")).toEqual([]);
  });
});

describe("verificationVerdict", () => {
  it("escalates only a flipped decision to needs_review", () => {
    expect(
      verificationVerdict(summarizeOutcomes(["decision_error", "consistent"]), false),
    ).toBe("needs_review");
  });

  it("treats discrepancies and uncomputable checks as notes, not failures", () => {
    expect(verificationVerdict(summarizeOutcomes(["discrepant"]), false)).toBe(
      "passed_with_notes",
    );
    expect(verificationVerdict(summarizeOutcomes(["not_computable"]), false)).toBe(
      "passed_with_notes",
    );
    expect(verificationVerdict(summarizeOutcomes([]), false)).toBe(
      "passed_with_notes",
    );
  });

  it("passes when every check is consistent", () => {
    expect(
      verificationVerdict(summarizeOutcomes(["consistent", "consistent"]), false),
    ).toBe("passed");
  });

  it("returns failed when the run itself failed", () => {
    expect(verificationVerdict(summarizeOutcomes(["consistent"]), true)).toBe(
      "failed",
    );
  });
});

describe("buildVerificationReport", () => {
  it("aggregates checks per kind and overall with a verdict", () => {
    const report = buildVerificationReport({
      artifactId: "artifact_1",
      runFailed: false,
      sandboxRunIds: ["run_1"],
      checks: [
        { checkKind: "statcheck", outcome: "consistent" },
        { checkKind: "statcheck", outcome: "decision_error" },
        { checkKind: "grim", outcome: "discrepant" },
        { checkKind: "power", outcome: "consistent" },
      ],
    });
    expect(report.verdict).toBe("needs_review");
    expect(report.statistics).toMatchObject({
      checked: 4,
      consistent: 2,
      discrepant: 1,
      decisionErrors: 1,
    });
    expect(report.byKind.statcheck.checked).toBe(2);
    expect(report.byKind.grim.discrepant).toBe(1);
    expect(report.byKind.power.consistent).toBe(1);
    expect(report.sandboxRunIds).toEqual(["run_1"]);
  });
});

describe("claim normalizers", () => {
  it("normalizeGrimClaims drops invalid N, defaults items, and clamps SD", () => {
    const claims = normalizeGrimClaims([
      { label: " Anxiety ", mean: 3.2, sd: 1.1, n: 20.0 },
      { label: "Bad N", mean: 2, n: 0 },
      { label: "Neg SD", mean: 2, sd: -1, n: 10, items: 2 },
    ]);
    expect(claims).toHaveLength(2);
    expect(claims[0]).toEqual({ label: "Anxiety", mean: 3.2, sd: 1.1, n: 20, items: 1 });
    expect(claims[1]).toEqual({ label: "Neg SD", mean: 2, sd: null, n: 10, items: 2 });
  });

  it("normalizePowerClaims drops unknown tests and defaults alpha/tails", () => {
    const claims = normalizePowerClaims([
      { label: "H1", test: "T", n: 30, effectSize: 0.5 },
      { label: "bad", test: "wilcoxon", n: 30, effectSize: 0.5 },
      { label: "H2", test: "correlation", n: 50, effectSize: 0.3, alpha: 0.01, tails: 1 },
    ]);
    expect(claims).toHaveLength(2);
    expect(claims[0]).toEqual({
      label: "H1",
      test: "t",
      n: 30,
      effectSize: 0.5,
      alpha: 0.05,
      tails: 2,
    });
    expect(claims[1]).toMatchObject({ test: "correlation", alpha: 0.01, tails: 1 });
  });
});
