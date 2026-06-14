import { activityEventsFromRun, type AgentRunRow } from "@aqsha/agent-contracts";
import { describe, expect, it } from "vitest";
import {
  sanitizeRunErrorMessage,
  sanitizeToolInput,
  sanitizeToolResult,
  toolResponseIsError,
} from "../src/agent/activitySanitizers";

// MCP tool results are { content: [{ type:"text", text }], isError? }; the data
// is JSON inside the text block. Build that wrapper for the result tests.
function jsonResponse(value: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}
function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("sanitizeToolInput", () => {
  it("surfaces the clamped agent query for searchWeb but never secrets (D6)", () => {
    const out = sanitizeToolInput("searchWeb", {
      query: "meta-analisis olahraga dan kognisi",
      apiKey: "sk-secret-123",
      limit: 5,
    });
    // D6: the model-composed query rides through (single field), nothing else.
    expect(out).toEqual({ query: "meta-analisis olahraga dan kognisi" });
    expect(JSON.stringify(out)).not.toContain("sk-secret-123");
    expect(out).not.toHaveProperty("apiKey");
    expect(out).not.toHaveProperty("limit");
  });

  it("single-lines and bounds a long / multi-line search query (D6 clamp)", () => {
    const long = `${"a".repeat(200)}\nbaris kedua bocor`;
    const out = sanitizeToolInput("searchArxiv", { query: long });
    expect(typeof out.query).toBe("string");
    expect((out.query as string).length).toBeLessThanOrEqual(120);
    expect(JSON.stringify(out)).not.toContain("baris kedua bocor");
  });

  it("exposes only the DOI for lookupDoi", () => {
    expect(sanitizeToolInput("lookupDoi", { doi: "10.1000/xyz" })).toEqual({
      doi: "10.1000/xyz",
    });
  });

  it("exposes only the safe title for proposeArtifact, never the body", () => {
    const out = sanitizeToolInput("proposeArtifact", {
      action: "create",
      title: "Ringkasan studi",
      summary: "panjang... rahasia rencana internal",
      planBullets: ["a", "b"],
    });
    expect(out).toEqual({ title: "Ringkasan studi" });
    expect(JSON.stringify(out)).not.toContain("rahasia rencana");
  });

  it("single-lines and bounds a free-text label", () => {
    const out = sanitizeToolInput("createWorkspace", {
      name: `Riset\nbaris kedua bocor`,
    });
    expect(out.name).toBe("Riset");
  });

  it("cuts at every line terminator, not just \\n (CR, U+2028, U+2029, NEL)", () => {
    // An interior CR / Unicode line/paragraph separator / NEL must NOT smuggle a
    // second line through an allow-listed scalar (Fase 0 adversarial review).
    const separators = ["\r", "\r\n", "\u2028", "\u2029", "\u0085"];
    for (const sep of separators) {
      const out = sanitizeToolInput("createWorkspace", {
        name: `Riset${sep}baris kedua bocor`,
      });
      expect(out.name).toBe("Riset");
      expect(JSON.stringify(out)).not.toContain("baris kedua bocor");
    }
  });

  it("counts askUser questions without copying their text", () => {
    const out = sanitizeToolInput("askUser", {
      questions: [{ prompt: "rahasia?" }, { prompt: "lainnya?" }],
    });
    expect(out).toEqual({ questionCount: 2 });
    expect(JSON.stringify(out)).not.toContain("rahasia");
  });

  it("default-denies unknown tools and non-object input", () => {
    expect(sanitizeToolInput("totallyUnknownTool", { secret: "x" })).toEqual({});
    expect(sanitizeToolInput("searchWeb", null)).toEqual({});
    // verifyCitations + deleteArtifact are intentionally default-deny.
    expect(sanitizeToolInput("verifyCitations", { artifactId: "a1" })).toEqual({});
    expect(sanitizeToolInput("deleteArtifact", { artifactId: "a1" })).toEqual({});
  });
});

describe("sanitizeToolResult", () => {
  it("returns only the result count for searchWeb, never the candidates", () => {
    const out = sanitizeToolResult(
      "searchWeb",
      jsonResponse([
        { title: "rahasia paper 1", url: "https://secret.example" },
        { title: "rahasia paper 2" },
      ]),
    );
    expect(out).toEqual({ resultCount: 2 });
    expect(JSON.stringify(out)).not.toContain("rahasia paper");
    expect(JSON.stringify(out)).not.toContain("secret.example");
  });

  it("decodes the LIVE bare content-array tool_response shape", () => {
    // Verified against the 0.3.x SDK: PostToolUse delivers the content blocks as
    // a bare array, not wrapped in { content: [...] }.
    const bareArray = [
      { type: "text", text: JSON.stringify([{ title: "a" }, { title: "b" }, { title: "c" }]) },
    ];
    expect(sanitizeToolResult("searchWeb", bareArray)).toEqual({ resultCount: 3 });
    expect(
      sanitizeToolResult("verifyStatistics", [
        { type: "text", text: JSON.stringify({ verdict: "passed", items: [{}, {}] }) },
      ]),
    ).toEqual({ verdict: "passed", checksRun: 2 });
  });

  it("reports only whether thread documents matched, never the excerpt", () => {
    expect(sanitizeToolResult("searchThreadDocuments", textResponse("kutipan rahasia")))
      .toEqual({ hasResults: true });
    expect(sanitizeToolResult("searchThreadDocuments", textResponse("   "))).toEqual({
      hasResults: false,
    });
  });

  it("exposes verdict + check count for verifyStatistics, never the items", () => {
    const out = sanitizeToolResult(
      "verifyStatistics",
      jsonResponse({
        status: "completed",
        verdict: "needs_review",
        summary: "8 checks — ...",
        items: [{ secret: "extracted claim" }, {}, {}],
      }),
    );
    expect(out).toEqual({ verdict: "needs_review", checksRun: 3 });
    expect(JSON.stringify(out)).not.toContain("extracted claim");
  });

  it("exposes only the opaque artifact id + action for executeArtifact, never the body", () => {
    const out = sanitizeToolResult(
      "executeArtifact",
      jsonResponse({
        ok: true,
        artifactId: "k17abc99",
        action: "create",
        content: "isi dokumen rahasia yang sangat panjang",
      }),
    );
    expect(out).toEqual({ artifactId: "k17abc99", action: "create" });
    expect(JSON.stringify(out)).not.toContain("isi dokumen rahasia");
  });

  it("rejects a non-id artifactId and out-of-range action (no free text on id scalar)", () => {
    // Prose where an id is expected is dropped — only the id-safe token survives.
    expect(
      sanitizeToolResult(
        "executeArtifact",
        jsonResponse({ artifactId: "judul dokumen rahasia", action: "update" }),
      ),
    ).toEqual({ action: "update" });
    // An action outside the allow-list enum is dropped.
    expect(
      sanitizeToolResult(
        "executeArtifact",
        jsonResponse({ artifactId: "k1", action: "exfiltrate" }),
      ),
    ).toEqual({ artifactId: "k1" });
  });

  it("default-denies unknown tools and malformed responses", () => {
    expect(sanitizeToolResult("searchWeb", { content: [{ type: "text", text: "{" }] }))
      .toEqual({});
    expect(sanitizeToolResult("totallyUnknownTool", jsonResponse([1, 2]))).toEqual({});
    expect(sanitizeToolResult("verifyCitations", jsonResponse({ checked: 8 }))).toEqual({});
  });
});

describe("toolResponseIsError", () => {
  it("detects the isError flag", () => {
    expect(toolResponseIsError(jsonResponse({ ok: false }, true))).toBe(true);
    expect(toolResponseIsError(jsonResponse({ ok: true }))).toBe(false);
    expect(toolResponseIsError(undefined)).toBe(false);
  });
});

// End-to-end bridge: the sanitizer (producer, this package) emits scalar keys
// that describeTool (consumer, @aqsha/agent-contracts) reads by name. These keys
// are coupled only by string literals across packages, so this test pipes REAL
// sanitizer output through the normalizer — a rename on either side breaks here.
describe("sanitizer → normalizer key contract (cross-package)", () => {
  function toolNodeFor(toolName: string, resultSummary: Record<string, unknown>) {
    const row: AgentRunRow = {
      runId: "r",
      status: "completed",
      mode: "normal",
      agentKind: "lite",
      createdAt: 1000,
      updatedAt: 5000,
      events: [
        {
          id: "r:1",
          seq: 1,
          type: "tool_start",
          payloadJson: JSON.stringify({ toolName, toolUseId: "tu" }),
          createdAt: 2000,
        },
        {
          id: "r:2",
          seq: 2,
          type: "tool_end",
          payloadJson: JSON.stringify({ toolName, toolUseId: "tu", status: "ok", resultSummary }),
          createdAt: 4000,
        },
      ],
    };
    return activityEventsFromRun(row).find((node) => node.type === "tool");
  }

  it("searchWeb sanitizer output → '2 hasil' description", () => {
    const summary = sanitizeToolResult("searchWeb", jsonResponse([{ title: "a" }, { title: "b" }]));
    expect(toolNodeFor("searchWeb", summary)?.description).toBe("2 hasil");
  });

  it("verifyStatistics sanitizer output → check count + verdict description", () => {
    const summary = sanitizeToolResult(
      "verifyStatistics",
      jsonResponse({ verdict: "needs_review", items: [{}, {}, {}] }),
    );
    expect(toolNodeFor("verifyStatistics", summary)?.description).toBe(
      "3 pemeriksaan, perlu ditinjau",
    );
  });

  it("executeArtifact result scalars reach node.metadata for the artifact card", () => {
    // The artifact card (plan §7) resolves its row via node.metadata.artifactId
    // and labels create/update via node.metadata.action — assert both survive the
    // sanitizer → normalizer pipe end to end.
    const summary = sanitizeToolResult(
      "executeArtifact",
      jsonResponse({ ok: true, artifactId: "k42xyz", action: "update" }),
    );
    const node = toolNodeFor("executeArtifact", summary);
    expect(node?.metadata?.artifactId).toBe("k42xyz");
    expect(node?.metadata?.action).toBe("update");
  });

  it("searchWeb query input reaches node.metadata for the expanded tool row (D6)", () => {
    // The clamped query is carried in tool_start's inputSummary; assert it lands
    // in node.metadata where the expanded ToolRow body (plan §6) reads it.
    const inputSummary = sanitizeToolInput("searchWeb", {
      query: "efek tidur terhadap memori",
    });
    const row: AgentRunRow = {
      runId: "r",
      status: "completed",
      mode: "normal",
      agentKind: "lite",
      createdAt: 1000,
      updatedAt: 5000,
      events: [
        {
          id: "r:1",
          seq: 1,
          type: "tool_start",
          payloadJson: JSON.stringify({ toolName: "searchWeb", toolUseId: "tu", inputSummary }),
          createdAt: 2000,
        },
        {
          id: "r:2",
          seq: 2,
          type: "tool_end",
          payloadJson: JSON.stringify({
            toolName: "searchWeb",
            toolUseId: "tu",
            status: "ok",
            resultSummary: sanitizeToolResult("searchWeb", jsonResponse([{ title: "a" }])),
          }),
          createdAt: 4000,
        },
      ],
    };
    const node = activityEventsFromRun(row).find((n) => n.type === "tool");
    expect(node?.metadata?.query).toBe("efek tidur terhadap memori");
    expect(node?.description).toBe("1 hasil");
  });
});

describe("sanitizeRunErrorMessage", () => {
  it("maps known-safe codes to friendly Indonesian copy", () => {
    expect(sanitizeRunErrorMessage("budget_exhausted")).toBe("Batas biaya tercapai");
    expect(sanitizeRunErrorMessage("error_max_turns")).toBe("Batas langkah agen tercapai");
    expect(sanitizeRunErrorMessage("error_during_execution")).toBe(
      "Terjadi kesalahan saat eksekusi",
    );
  });

  it("maps the deep-research phase prefix to the underlying safe code", () => {
    expect(sanitizeRunErrorMessage("phase literature: error_during_execution")).toBe(
      "Terjadi kesalahan saat eksekusi",
    );
  });

  it("default-denies a raw caught-error message (no stack/path/secret leaks)", () => {
    const raw = "fetch failed: connect ECONNREFUSED 10.0.0.5:5432\n  at /srv/app/x.ts:42";
    const safe = sanitizeRunErrorMessage(raw);
    expect(safe).toBe("Terjadi kesalahan internal");
    expect(safe).not.toContain("ECONNREFUSED");
    expect(safe).not.toContain("/srv/app");
  });

  it("falls back to the generic line for an empty message", () => {
    expect(sanitizeRunErrorMessage(undefined)).toBe("Terjadi kesalahan internal");
    expect(sanitizeRunErrorMessage("")).toBe("Terjadi kesalahan internal");
  });
});
