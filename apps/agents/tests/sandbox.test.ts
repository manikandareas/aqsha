import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  normalizeExtractedClaims,
  verificationExtractionSchema,
} from "../src/sandbox/claimExtraction";
import { summarizeOutcomes } from "../src/sandbox/computationOutcome";
import {
  hasNhstReporting,
  routeComputationTaskKind,
} from "../src/sandbox/computationRouting";
import {
  runMetaAnalysisFlow,
  runStatVerificationFlow,
  type EngineDeps,
  type SandboxVendor,
} from "../src/sandbox/engine";
import { classifyGrimRow, parseGrimStdout } from "../src/sandbox/grimClassify";
import {
  createAnthropicJsonClient,
  firstJsonBlock,
  nullJsonLlmClient,
  type JsonLlmClient,
} from "../src/sandbox/llmExtract";
import {
  describeHeterogeneity,
  parseMetaStdout,
  suggestsPublicationBias,
  type MetaAnalysisSummary,
} from "../src/sandbox/metaAnalysisClassify";
import { normalizeMetaStudies } from "../src/sandbox/metaClaimExtraction";
import { classifyPowerRow, parsePowerStdout } from "../src/sandbox/powerClassify";
import {
  buildClaimText,
  classifyStatcheckRow,
  parseStatcheckStdout,
  type StatcheckRawRow,
} from "../src/sandbox/statcheckClassify";
import type { SandboxSessionRequest } from "../src/sandbox/sandboxVendor";
import {
  buildVerificationReport,
  verificationVerdict,
} from "../src/sandbox/verificationReport";
import { buildSandboxService } from "../src/tools/sandboxService";

// ── statcheck classification (ported from the legacy Convex suite) ──────────
// The verdict (consistent/discrepant/decision_error/not_computable) is
// recomputed in TS from statcheck's raw reported-vs-recomputed p under an
// explicit tolerance — no live sandbox needed.

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
    expect(
      classifyStatcheckRow(
        row({ reportedComparison: "=", reportedPValue: 0.04, computedPValue: 0.043 }),
      ),
    ).toBe("consistent");
  });

  it("flags a numeric mismatch (same decision) as discrepant", () => {
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
    expect(rows[0]?.reportedPValue).toBe(0.04);
    expect(rows[0]?.computedPValue).toBe(0.041);
    expect(rows[0]?.raw).toBe("t(28) = 2.10, p = .04");
    expect(rows[0]?.statcheckError).toBe(false);
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
    expect(rows[0]?.reportedComparison).toBe("<");
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

// ── GRIM / GRIMMER ───────────────────────────────────────────────────────────

describe("classifyGrimRow", () => {
  it("maps a passing GRIM flag to consistent", () => {
    const checks = classifyGrimRow({
      label: "Scale A",
      mean: 3.5,
      n: 20,
      items: 1,
      grimConsistent: true,
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ kind: "grim", outcome: "consistent" });
  });

  it("maps a failing GRIM flag to discrepant and a null flag to not_computable", () => {
    expect(
      classifyGrimRow({ label: "B", mean: 3.51, n: 20, items: 1, grimConsistent: false })[0]
        ?.outcome,
    ).toBe("discrepant");
    expect(
      classifyGrimRow({ label: "C", mean: 3.5, n: 20, items: 1, grimConsistent: null })[0]
        ?.outcome,
    ).toBe("not_computable");
  });

  it("adds a GRIMMER check when an SD was provided", () => {
    const checks = classifyGrimRow({
      label: "D",
      mean: 3.5,
      sd: 1.2,
      n: 20,
      items: 1,
      grimConsistent: true,
      grimmerConsistent: false,
    });
    expect(checks.map((c) => c.kind)).toEqual(["grim", "grimmer"]);
    expect(checks[1]?.outcome).toBe("discrepant");
  });

  it("parses grim.R stdout with leading noise", () => {
    const rows = parseGrimStdout(
      'Attaching package: scrutiny\n[{"label":"A","mean":3.5,"n":20,"items":1,"grimConsistent":"TRUE"}]',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.grimConsistent).toBe(true);
  });
});

// ── power ────────────────────────────────────────────────────────────────────

describe("classifyPowerRow", () => {
  it("maps a computed power to consistent with an adequacy read", () => {
    const check = classifyPowerRow({
      label: "Main t-test",
      test: "t",
      n: 30,
      effectSize: 0.5,
      alpha: 0.05,
      power: 0.47,
    });
    expect(check.outcome).toBe("consistent");
    expect(check.adequate).toBe(false);
    expect(check.power).toBeCloseTo(0.47);
  });

  it("marks adequate power at the .80 threshold", () => {
    expect(
      classifyPowerRow({ label: "x", test: "t", n: 200, effectSize: 0.5, alpha: 0.05, power: 0.8 })
        .adequate,
    ).toBe(true);
  });

  it("maps a missing power to not_computable", () => {
    const check = classifyPowerRow({ label: "anova", test: "anova", n: 40, effectSize: 0.3, power: null });
    expect(check.outcome).toBe("not_computable");
    expect(check.adequate).toBeNull();
  });

  it("parses power.R stdout", () => {
    const rows = parsePowerStdout(
      '[{"label":"t","test":"t","n":30,"effectSize":0.5,"alpha":0.05,"power":0.47}]',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.power).toBeCloseTo(0.47);
  });
});

// ── verification report verdict logic ────────────────────────────────────────

describe("verificationVerdict", () => {
  it("fails when the run failed regardless of checks", () => {
    expect(verificationVerdict(summarizeOutcomes(["consistent"]), true)).toBe("failed");
  });

  it("needs review on any decision error", () => {
    expect(
      verificationVerdict(summarizeOutcomes(["consistent", "decision_error"]), false),
    ).toBe("needs_review");
  });

  it("passes with notes on discrepancies, uncomputable claims, or zero checks", () => {
    expect(verificationVerdict(summarizeOutcomes(["discrepant"]), false)).toBe(
      "passed_with_notes",
    );
    expect(verificationVerdict(summarizeOutcomes(["not_computable"]), false)).toBe(
      "passed_with_notes",
    );
    expect(verificationVerdict(summarizeOutcomes([]), false)).toBe("passed_with_notes");
  });

  it("passes when every check is consistent", () => {
    expect(
      verificationVerdict(summarizeOutcomes(["consistent", "consistent"]), false),
    ).toBe("passed");
  });
});

describe("buildVerificationReport", () => {
  it("aggregates checks per kind and overall", () => {
    const report = buildVerificationReport({
      artifactId: "a1",
      runFailed: false,
      sandboxRunIds: [],
      checks: [
        { checkKind: "statcheck", outcome: "consistent" },
        { checkKind: "statcheck", outcome: "decision_error" },
        { checkKind: "grim", outcome: "discrepant" },
        { checkKind: "power", outcome: "consistent" },
      ],
    });
    expect(report.verdict).toBe("needs_review");
    expect(report.statistics.checked).toBe(4);
    expect(report.byKind.statcheck.decisionErrors).toBe(1);
    expect(report.byKind.grim.discrepant).toBe(1);
    expect(report.byKind.grimmer.checked).toBe(0);
    expect(report.byKind.power.consistent).toBe(1);
  });
});

// ── computation routing ──────────────────────────────────────────────────────

describe("routeComputationTaskKind", () => {
  it("runs stat verification and meta-analysis inline", () => {
    expect(routeComputationTaskKind("stat_verification")).toBe("inline");
    expect(routeComputationTaskKind("meta_analysis")).toBe("inline");
  });

  it("blocks replication and custom analysis at the current tier", () => {
    expect(routeComputationTaskKind("replication")).toBe("tier_unavailable");
    expect(routeComputationTaskKind("custom_analysis")).toBe("tier_unavailable");
  });
});

describe("hasNhstReporting", () => {
  it("requires both a test statistic and a p-value", () => {
    expect(hasNhstReporting("t(28) = 2.10, p = .04")).toBe(true);
    expect(hasNhstReporting("the effect was significant, p = .04")).toBe(false);
    expect(hasNhstReporting("t(28) = 2.10 was observed")).toBe(false);
    expect(hasNhstReporting("plain prose with no statistics")).toBe(false);
  });
});

// ── meta-analysis envelope parsing ───────────────────────────────────────────

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
  it("parses a complete ok envelope, tolerating surrounding noise", () => {
    const result = parseMetaStdout(`Loading metafor...\n${OK_ENVELOPE}\nWarning: foo`);
    expect(result?.status).toBe("ok");
    const ok = result as MetaAnalysisSummary;
    expect(ok.k).toBe(12);
    expect(ok.pooledEstimate).toBeCloseTo(0.42);
    expect(ok.eggerPValue).toBeCloseTo(0.02);
  });

  it("parses error envelopes and rejects garbage", () => {
    expect(parseMetaStdout(JSON.stringify({ status: "insufficient_studies", k: 1 }))).toEqual({
      status: "insufficient_studies",
      k: 1,
      measure: undefined,
    });
    expect(parseMetaStdout("")).toBeNull();
    expect(parseMetaStdout("not json")).toBeNull();
    expect(parseMetaStdout(JSON.stringify({ status: "weird" }))).toBeNull();
  });
});

describe("meta interpretation helpers", () => {
  const base = parseMetaStdout(OK_ENVELOPE) as MetaAnalysisSummary;

  it("bands heterogeneity by Cochrane rules of thumb", () => {
    expect(describeHeterogeneity(20)).toBe("low");
    expect(describeHeterogeneity(60)).toBe("moderate");
    expect(describeHeterogeneity(80)).toBe("high");
  });

  it("flags publication bias only with enough studies and a signal", () => {
    expect(suggestsPublicationBias(base)).toBe(true);
    expect(suggestsPublicationBias({ ...base, k: 6 })).toBe(false);
    expect(
      suggestsPublicationBias({ ...base, eggerPValue: 0.7, trimfillImputed: 0 }),
    ).toBe(false);
  });
});

describe("normalizeMetaStudies", () => {
  it("keeps only studies with a complete effect-size form", () => {
    const out = normalizeMetaStudies({
      studies: [
        { label: "pre", yi: 0.4, vi: 0.02 },
        { label: "sei", yi: 0.3, sei: 0.1 },
        { label: "means", mean1: 10, sd1: 2, n1: 30, mean2: 8, sd2: 2.5, n2: 28 },
        { label: "binary", events1: 12, n1: 50, events2: 5, n2: 48 },
        { label: "partial", mean1: 10, n1: 30 },
        { label: "yi-only", yi: 0.5 },
        { label: "zero-vi", yi: 0.4, vi: 0 },
      ],
    });
    expect(out.map((s) => s.label)).toEqual(["pre", "sei", "means", "binary"]);
  });

  it("defaults a blank label", () => {
    expect(normalizeMetaStudies({ studies: [{ label: "  ", yi: 0.2, vi: 0.01 }] })[0]?.label).toBe(
      "(unlabeled)",
    );
  });
});

// ── claim extraction normalizers ─────────────────────────────────────────────

describe("normalizeExtractedClaims", () => {
  it("sanitizes GRIM and power claims", () => {
    const claims = normalizeExtractedClaims({
      grimClaims: [
        { label: "ok", mean: 3.5, sd: 1.1, n: 20, items: 2 },
        { label: "bad-n", mean: 3.5, n: -3 },
        { label: "neg-sd", mean: 2.5, sd: -1, n: 10 },
      ],
      powerClaims: [
        { label: "ok", test: "T", n: 30, effectSize: 0.5, alpha: 0.01, tails: 1 },
        { label: "bad-test", test: "mannwhitney", n: 30, effectSize: 0.5 },
        { label: "bad-alpha", test: "t", n: 30, effectSize: 0.5, alpha: 0.9 },
      ],
    });
    expect(claims.grimClaims).toHaveLength(2);
    expect(claims.grimClaims[1]).toMatchObject({ label: "neg-sd", sd: null });
    expect(claims.powerClaims).toHaveLength(2);
    expect(claims.powerClaims[0]).toMatchObject({ test: "t", alpha: 0.01, tails: 1 });
    expect(claims.powerClaims[1]?.alpha).toBe(0.05);
  });
});

// ── llmExtract: strict-JSON Messages API client ──────────────────────────────

function fakeFetch(
  handler: (url: string, init: RequestInit) => { status?: number; body: unknown },
): typeof fetch {
  return (async (url: unknown, init: unknown) => {
    const out = handler(String(url), (init ?? {}) as RequestInit);
    return new Response(JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function messagesBody(text: string): unknown {
  return { content: [{ type: "text", text }] };
}

describe("firstJsonBlock", () => {
  it("extracts a fenced/noisy JSON object", () => {
    expect(firstJsonBlock('Sure! Here it is:\n```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it("handles nested braces and braces inside strings", () => {
    expect(firstJsonBlock('{"a": {"b": "}"}, "c": [1, 2]} trailing')).toBe(
      '{"a": {"b": "}"}, "c": [1, 2]}',
    );
  });

  it("returns null when no JSON is present", () => {
    expect(firstJsonBlock("no json here")).toBeNull();
  });
});

describe("createAnthropicJsonClient", () => {
  const schema = z.object({ value: z.number() });

  it("POSTs to /v1/messages with x-api-key auth and parses strict JSON", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const client = createAnthropicJsonClient({
      baseUrl: "https://api.anthropic.com/",
      apiKey: "sk-test",
      fetchImpl: fakeFetch((url, init) => {
        captured = { url, init };
        return { body: messagesBody('{"value": 42}') };
      }),
    });
    const result = await client.extractJson({ model: "claude-haiku-4-5", prompt: "p", schema });
    expect(result).toEqual({ value: 42 });
    expect(captured!.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.authorization).toBeUndefined();
    const payload = JSON.parse(String(captured!.init.body)) as { model: string };
    expect(payload.model).toBe("claude-haiku-4-5");
  });

  it("uses bearer auth when only an auth token is given", async () => {
    let headers: Record<string, string> = {};
    const client = createAnthropicJsonClient({
      baseUrl: "https://gateway.example",
      authToken: "tok",
      fetchImpl: fakeFetch((_url, init) => {
        headers = init.headers as Record<string, string>;
        return { body: messagesBody('{"value": 1}') };
      }),
    });
    await client.extractJson({ model: "m", prompt: "p", schema });
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("recovers JSON wrapped in prose and markdown fences", async () => {
    const client = createAnthropicJsonClient({
      baseUrl: "https://api.anthropic.com",
      apiKey: "k",
      fetchImpl: fakeFetch(() => ({
        body: messagesBody('Here you go:\n```json\n{"value": 7}\n```\nLet me know!'),
      })),
    });
    expect(await client.extractJson({ model: "m", prompt: "p", schema })).toEqual({ value: 7 });
  });

  it("returns null on HTTP errors, malformed JSON, schema mismatch, and thrown fetch", async () => {
    const cases: Array<typeof fetch> = [
      fakeFetch(() => ({ status: 500, body: { error: "boom" } })),
      fakeFetch(() => ({ body: messagesBody("{not json") })),
      fakeFetch(() => ({ body: messagesBody('{"value": "not-a-number"}') })),
      fakeFetch(() => ({ body: messagesBody("no json at all") })),
      (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    ];
    for (const fetchImpl of cases) {
      const client = createAnthropicJsonClient({
        baseUrl: "https://api.anthropic.com",
        apiKey: "k",
        fetchImpl,
      });
      expect(await client.extractJson({ model: "m", prompt: "p", schema })).toBeNull();
    }
  });
});

// ── engine end-to-end with a fake vendor ─────────────────────────────────────

const STATCHECK_STDOUT = JSON.stringify([
  {
    reportedComparison: "=",
    reportedPValue: 0.04,
    computedPValue: 0.04,
    raw: "t(28) = 2.10, p = .04",
  },
  {
    reportedComparison: "=",
    reportedPValue: 0.04,
    computedPValue: 0.06,
    raw: "t(30) = 2.00, p = .04",
  },
]);

const GRIM_STDOUT = JSON.stringify([
  { label: "Scale A", mean: 3.51, n: 20, items: 1, grimConsistent: false },
]);

const POWER_STDOUT = JSON.stringify([
  { label: "Main", test: "t", n: 30, effectSize: 0.5, alpha: 0.05, power: 0.47 },
]);

function stubLlm(payload: unknown): JsonLlmClient {
  return {
    async extractJson<T>(req: { schema: z.ZodType<T> }): Promise<T | null> {
      const parsed = req.schema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    },
  };
}

function fakeVendor(
  stdoutByKey: Record<string, string>,
  capture?: { requests: SandboxSessionRequest[] },
): SandboxVendor {
  return async (req) => {
    capture?.requests.push(req);
    return req.commands.map((command) => ({
      key: command.key,
      exitCode: 0,
      stdout: stdoutByKey[command.key] ?? "",
      timedOut: false,
    }));
  };
}

function engineDeps(overrides: Partial<EngineDeps>): EngineDeps {
  return {
    vendor: fakeVendor({}),
    llm: nullJsonLlmClient,
    config: { apiKey: "dk", snapshot: "aqsha-statverify-v1", model: "claude-haiku-4-5" },
    ...overrides,
  };
}

describe("runStatVerificationFlow", () => {
  it("runs parse→classify→report end-to-end without Daytona", async () => {
    const capture: { requests: SandboxSessionRequest[] } = { requests: [] };
    const deps = engineDeps({
      vendor: fakeVendor(
        { statcheck: STATCHECK_STDOUT, grim: GRIM_STDOUT, power: POWER_STDOUT },
        capture,
      ),
      llm: stubLlm({
        grimClaims: [{ label: "Scale A", mean: 3.51, n: 20, items: 1 }],
        powerClaims: [{ label: "Main", test: "t", n: 30, effectSize: 0.5 }],
      }),
    });

    const result = await runStatVerificationFlow(deps, {
      artifactText: "t(28) = 2.10, p = .04",
    });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");

    // One sandbox session, all three commands, scripts + inputs uploaded once.
    expect(capture.requests).toHaveLength(1);
    const req = capture.requests[0]!;
    expect(req.snapshot).toBe("aqsha-statverify-v1");
    expect(req.commands.map((c) => c.key)).toEqual(["statcheck", "grim", "power"]);
    expect(req.files.map((f) => f.path)).toContain("/workspace/check.R");
    expect(req.files.map((f) => f.path)).toContain("/workspace/grim_claims.json");

    // 2 statcheck + 1 grim + 1 power checks; the flipped decision wins.
    expect(result.verdict).toBe("needs_review");
    expect(result.summary).toEqual({
      checked: 4,
      consistent: 2,
      discrepant: 1,
      decisionErrors: 1,
      notComputable: 0,
    });
    expect(result.byKind.statcheck.decisionErrors).toBe(1);
    expect(result.byKind.grim.discrepant).toBe(1);
    expect(result.byKind.power.consistent).toBe(1);

    // Notable items: the decision error, the GRIM failure, and the inadequate power.
    expect(result.items.map((item) => item.checkKind).sort()).toEqual([
      "grim",
      "power",
      "statcheck",
    ]);
    const report = JSON.parse(result.reportJson) as { verdict: string };
    expect(report.verdict).toBe("needs_review");
  });

  it("skips GRIM/power uploads when extraction yields nothing", async () => {
    const capture: { requests: SandboxSessionRequest[] } = { requests: [] };
    const deps = engineDeps({
      vendor: fakeVendor({ statcheck: "[]" }, capture),
    });
    const result = await runStatVerificationFlow(deps, { artifactText: "prose only" });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(capture.requests[0]!.commands.map((c) => c.key)).toEqual(["statcheck"]);
    expect(result.verdict).toBe("passed_with_notes");
    expect(result.summary.checked).toBe(0);
  });

  it("returns failed (never throws) when the vendor errors", async () => {
    const deps = engineDeps({
      vendor: async () => {
        throw new Error("sandbox provisioning failed");
      },
    });
    const result = await runStatVerificationFlow(deps, { artifactText: "t(1)=1, p=.5" });
    expect(result).toEqual({ status: "failed", reason: "sandbox provisioning failed" });
  });
});

describe("runMetaAnalysisFlow", () => {
  const studiesPayload = {
    studies: [
      { label: "A", yi: 0.4, vi: 0.02 },
      { label: "B", yi: 0.3, sei: 0.1 },
    ],
  };

  it("pools extracted studies and interprets the envelope", async () => {
    const capture: { requests: SandboxSessionRequest[] } = { requests: [] };
    const deps = engineDeps({
      vendor: fakeVendor(
        { meta: OK_ENVELOPE, forest: "Zm9yZXN0", funnel: "" },
        capture,
      ),
      llm: stubLlm(studiesPayload),
    });
    const result = await runMetaAnalysisFlow(deps, { artifactText: "review text" });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(result.summary.status).toBe("ok");
    expect(result.forestPngBase64).toBe("Zm9yZXN0");
    expect(result.funnelPngBase64).toBeUndefined();
    const output = JSON.parse(result.outputJson) as Record<string, unknown>;
    expect(output.heterogeneity).toBe("moderate");
    expect(output.publicationBiasSignal).toBe(true);
    expect(output.forestPlotAvailable).toBe(true);
    expect(capture.requests[0]!.commands.map((c) => c.key)).toEqual([
      "meta",
      "forest",
      "funnel",
    ]);
  });

  it("returns insufficient_studies without provisioning a sandbox", async () => {
    const capture: { requests: SandboxSessionRequest[] } = { requests: [] };
    const deps = engineDeps({
      vendor: fakeVendor({}, capture),
      llm: stubLlm({ studies: [{ label: "only", yi: 0.4, vi: 0.02 }] }),
    });
    expect(await runMetaAnalysisFlow(deps, { artifactText: "x" })).toEqual({
      status: "insufficient_studies",
    });
    expect(capture.requests).toHaveLength(0);
  });

  it("fails when the envelope is unparseable", async () => {
    const deps = engineDeps({
      vendor: fakeVendor({ meta: "Rscript exploded" }),
      llm: stubLlm(studiesPayload),
    });
    const result = await runMetaAnalysisFlow(deps, { artifactText: "x" });
    expect(result.status).toBe("failed");
  });
});

// ── service wiring ───────────────────────────────────────────────────────────

describe("buildSandboxService", () => {
  it("returns not_configured without a Daytona key or snapshot", async () => {
    const noKey = buildSandboxService({});
    expect((await noKey.verifyStatistics({ ownerUserId: "u", runId: "r", artifactText: "t" })).status).toBe(
      "not_configured",
    );
    const noSnapshot = buildSandboxService({ daytonaApiKey: "dk", snapshot: "" });
    expect(
      (await noSnapshot.runComputation({ ownerUserId: "u", runId: "r", computationKind: "meta_analysis" }))
        .status,
    ).toBe("not_configured");
  });

  it("runs the stat flow through verifyStatistics when configured", async () => {
    const service = buildSandboxService({
      daytonaApiKey: "dk",
      snapshot: "aqsha-statverify-v1",
      vendor: fakeVendor({ statcheck: STATCHECK_STDOUT }),
      llm: nullJsonLlmClient,
    });
    const result = await service.verifyStatistics({
      ownerUserId: "u",
      runId: "r",
      artifactText: "t(28) = 2.10, p = .04",
    });
    expect(result.status).toBe("completed");
    expect(result.verdict).toBe("needs_review");
    expect(result.summary).toContain("2 checks");
    expect(result.items).toHaveLength(1);
  });

  it("routes runComputation by kind and blocks unsupported kinds", async () => {
    const service = buildSandboxService({
      daytonaApiKey: "dk",
      snapshot: "aqsha-statverify-v1",
      vendor: fakeVendor({ meta: OK_ENVELOPE }),
      llm: stubLlm({
        studies: [
          { label: "A", yi: 0.4, vi: 0.02 },
          { label: "B", yi: 0.3, sei: 0.1 },
        ],
      }),
    });
    const meta = await service.runComputation({
      ownerUserId: "u",
      runId: "r",
      computationKind: "meta_analysis",
      artifactText: "review",
    });
    expect(meta.status).toBe("completed");
    expect(meta.summary).toContain("k=12");
    expect(JSON.parse(meta.outputJson ?? "{}")).toMatchObject({ status: "ok", k: 12 });

    const blocked = await service.runComputation({
      ownerUserId: "u",
      runId: "r",
      computationKind: "data_analysis",
    });
    expect(blocked.status).toBe("not_configured");
  });

  it("validates the extraction schema before normalizing (engine + zod)", async () => {
    // A malformed extraction payload fails schema validation → no GRIM/power
    // commands, statcheck still runs.
    const malformed = verificationExtractionSchema.safeParse({ grimClaims: "nope" });
    expect(malformed.success).toBe(false);
    const capture: { requests: SandboxSessionRequest[] } = { requests: [] };
    const service = buildSandboxService({
      daytonaApiKey: "dk",
      snapshot: "aqsha-statverify-v1",
      vendor: fakeVendor({ statcheck: "[]" }, capture),
      llm: stubLlm({ grimClaims: "nope" }),
    });
    const result = await service.verifyStatistics({
      ownerUserId: "u",
      runId: "r",
      artifactText: "t(1) = 1.0, p = .5",
    });
    expect(result.status).toBe("completed");
    expect(capture.requests[0]!.commands.map((c) => c.key)).toEqual(["statcheck"]);
  });
});
