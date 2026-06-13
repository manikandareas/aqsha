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
  it("never copies the raw query or secrets for searchWeb", () => {
    const out = sanitizeToolInput("searchWeb", {
      query: "kueri rahasia pengguna",
      apiKey: "sk-secret-123",
      limit: 5,
    });
    expect(out).toEqual({});
    expect(JSON.stringify(out)).not.toContain("kueri rahasia");
    expect(JSON.stringify(out)).not.toContain("sk-secret-123");
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
