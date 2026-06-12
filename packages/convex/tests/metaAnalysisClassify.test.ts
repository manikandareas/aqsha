import { describe, expect, it } from "vitest";
import {
  describeHeterogeneity,
  parseMetaStdout,
  suggestsPublicationBias,
  type MetaAnalysisSummary,
} from "../convex/agent/sandbox/metaAnalysisClassify";

// Slice P4.2: pure parsing/interpretation of the metaanalysis.R JSON envelope.
// The envelope is a single pooled SUMMARY object — never a per-claim
// consistent/discrepant check — so it stands apart from computationChecks.

const OK_ENVELOPE = JSON.stringify({
  status: "ok",
  k: 12,
  measure: "SMD",
  pooledEstimate: 0.42,
  ciLower: 0.21,
  ciUpper: 0.63,
  pValue: 0.0001,
  tau2: 0.05,
  i2: 68.4,
  q: 34.8,
  qPValue: 0.0003,
  eggerPValue: 0.02,
  trimfillEstimate: 0.31,
  trimfillImputed: 3,
});

describe("parseMetaStdout", () => {
  it("parses a complete ok envelope", () => {
    const result = parseMetaStdout(OK_ENVELOPE);
    expect(result?.status).toBe("ok");
    const ok = result as MetaAnalysisSummary;
    expect(ok.k).toBe(12);
    expect(ok.measure).toBe("SMD");
    expect(ok.pooledEstimate).toBeCloseTo(0.42);
    expect(ok.i2).toBeCloseTo(68.4);
    expect(ok.eggerPValue).toBeCloseTo(0.02);
    expect(ok.trimfillImputed).toBe(3);
  });

  it("tolerates leading/trailing noise around the JSON object", () => {
    const noisy = `Loading metafor...\n${OK_ENVELOPE}\nWarning message: foo`;
    expect(parseMetaStdout(noisy)?.status).toBe("ok");
  });

  it("parses error envelopes with their study count", () => {
    expect(parseMetaStdout(JSON.stringify({ status: "no_studies", k: 0 }))).toEqual({
      status: "no_studies",
      k: 0,
      measure: undefined,
    });
    expect(
      parseMetaStdout(JSON.stringify({ status: "insufficient_studies", k: 1, measure: "GEN" })),
    ).toEqual({ status: "insufficient_studies", k: 1, measure: "GEN" });
  });

  it("nulls absent publication-bias diagnostics instead of defaulting them", () => {
    const ok = parseMetaStdout(
      JSON.stringify({ ...JSON.parse(OK_ENVELOPE), eggerPValue: null, trimfillEstimate: null, trimfillImputed: null }),
    ) as MetaAnalysisSummary;
    expect(ok.eggerPValue).toBeNull();
    expect(ok.trimfillEstimate).toBeNull();
    expect(ok.trimfillImputed).toBeNull();
  });

  it("returns null for empty or unparseable output", () => {
    expect(parseMetaStdout("")).toBeNull();
    expect(parseMetaStdout("not json at all")).toBeNull();
    expect(parseMetaStdout(JSON.stringify({ status: "weird" }))).toBeNull();
  });
});

describe("describeHeterogeneity", () => {
  it("bands I² by the Cochrane rules of thumb", () => {
    expect(describeHeterogeneity(20)).toBe("low");
    expect(describeHeterogeneity(60)).toBe("moderate");
    expect(describeHeterogeneity(80)).toBe("high");
  });
});

describe("suggestsPublicationBias", () => {
  const base = parseMetaStdout(OK_ENVELOPE) as MetaAnalysisSummary;

  it("flags when k is large and Egger is significant", () => {
    expect(suggestsPublicationBias(base)).toBe(true);
  });

  it("flags when trim-and-fill imputed studies even if Egger is null", () => {
    expect(
      suggestsPublicationBias({ ...base, eggerPValue: null, trimfillImputed: 2 }),
    ).toBe(true);
  });

  it("does not flag with too few studies", () => {
    expect(suggestsPublicationBias({ ...base, k: 6 })).toBe(false);
  });

  it("does not flag when diagnostics are clean", () => {
    expect(
      suggestsPublicationBias({ ...base, eggerPValue: 0.7, trimfillImputed: 0 }),
    ).toBe(false);
  });
});
