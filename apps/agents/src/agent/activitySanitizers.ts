// Activity payload sanitizers (plan docs/agent-activity-stream-plan.md §8).
//
// SINGLE CHOKEPOINT: every tool/run detail that reaches a RunEvent payload —
// and therefore Convex `agentRunEvents.payloadJson` and the client — is
// projected here to SAFE SCALARS ONLY through a per-tool allow-list. Raw
// `tool_input` / `tool_response` (user queries, document bodies, secrets,
// internal ids, raw JSON) NEVER leave this module. Default-deny: an unknown
// tool → `{}` (the activity node then shows only its human-readable label).
//
// Tool names here are LOGICAL (post `logicalToolName`), e.g. "searchWeb".

// One definition of the scalar-summary shape, shared with the wire contract
// (`toolStart/EndPayloadSchema`) and the view-model normalizer.
import type { ActivityScalar, ActivityScalarRecord } from "@aqsha/agent-contracts";

const MAX_LABEL_LENGTH = 120;

/**
 * Bound + single-line a free-text scalar so a long/multiline value cannot
 * smuggle detail through an allow-listed key (e.g. an artifact title that the
 * model padded with extra context).
 */
function safeLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const firstLine = value.split("\n", 1)[0]?.trim() ?? "";
  if (!firstLine) return undefined;
  return firstLine.length > MAX_LABEL_LENGTH
    ? `${firstLine.slice(0, MAX_LABEL_LENGTH - 1)}…`
    : firstLine;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function safeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Drop undefined entries so empty summaries serialize as `{}`, not `{k:undefined}`. */
function compact(
  record: Record<string, ActivityScalar | undefined>,
): ActivityScalarRecord {
  const out: ActivityScalarRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// ── tool_response decoding (defensive; never throws) ─────────────────────────
// The PostToolUse `tool_response` for an in-process MCP tool is delivered as the
// BARE content-block array `[{ type:"text", text }]` (verified live against the
// 0.3.x SDK), though the full CallToolResult `{ content: [...], isError? }` shape
// is also accepted for robustness. The payload data is JSON-encoded inside the
// text block(s); we expose only counts/enums derived from it — never the decoded
// value itself.

function responseContentArray(response: unknown): unknown[] | undefined {
  if (Array.isArray(response)) return response;
  if (
    response &&
    typeof response === "object" &&
    Array.isArray((response as { content?: unknown }).content)
  ) {
    return (response as { content: unknown[] }).content;
  }
  return undefined;
}

function responseText(response: unknown): string | undefined {
  const content = responseContentArray(response);
  if (!content) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.length > 0 ? parts.join("") : undefined;
}

function responseJson(response: unknown): unknown {
  const text = responseText(response);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function responseArrayLength(response: unknown): number | undefined {
  const parsed = responseJson(response);
  return Array.isArray(parsed) ? parsed.length : undefined;
}

/** Whether the MCP tool result reported an error (`errorResult` → isError:true). */
export function toolResponseIsError(response: unknown): boolean {
  return Boolean(
    response &&
      typeof response === "object" &&
      (response as { isError?: unknown }).isError === true,
  );
}

// ── per-tool allow-list ──────────────────────────────────────────────────────

type ToolSanitizer = {
  input?: (input: Record<string, unknown>) => ActivityScalarRecord;
  result?: (response: unknown) => ActivityScalarRecord;
};

/** Result-count summary for search tools (candidates come back as a JSON array). */
const searchResult = (response: unknown): ActivityScalarRecord =>
  compact({ resultCount: safeCount(responseArrayLength(response)) });

const SANDBOX_VERDICTS = ["passed", "passed_with_notes", "needs_review", "failed"] as const;

// Every key emitted below is consumed by `describeTool` in the view-model
// (packages/agent-contracts/src/activity.ts) — keep that 1:1 so the chokepoint
// never produces scalars that are never rendered. An end-to-end test
// (apps/agents/tests/activitySanitizers.test.ts) bridges the two to catch drift.
const TOOL_SANITIZERS: Record<string, ToolSanitizer> = {
  // Research — only the result COUNT is exposed; never the query text.
  searchWeb: { result: searchResult },
  searchArxiv: { result: searchResult },
  lookupDoi: {
    // A DOI is a public identifier, safe to surface; the result is the
    // resolved candidate count.
    input: (input) => compact({ doi: safeLabel(input.doi) }),
    result: searchResult,
  },
  searchThreadDocuments: {
    // The excerpt is plain text (textResult). Expose only whether anything
    // matched — never the excerpt itself.
    result: (response) =>
      compact({ hasResults: (responseText(response)?.trim().length ?? 0) > 0 }),
  },
  // Statistical verification — verdict enum + how many checks ran (the items
  // array is counted, never copied; its per-check content stays internal).
  verifyStatistics: {
    result: (response) => {
      const parsed = responseJson(response);
      if (!parsed || typeof parsed !== "object") return {};
      const value = parsed as { verdict?: unknown; items?: unknown };
      return compact({
        verdict: safeEnum(value.verdict, SANDBOX_VERDICTS),
        checksRun: safeCount(Array.isArray(value.items) ? value.items.length : undefined),
      });
    },
  },
  // Artifact / workspace — only the safe (clamped, single-line) label.
  proposeArtifact: {
    input: (input) => compact({ title: safeLabel(input.title) }),
  },
  executeArtifact: {
    input: (input) => compact({ title: safeLabel(input.title) }),
  },
  createWorkspace: {
    input: (input) => compact({ name: safeLabel(input.name) }),
  },
  renameWorkspace: {
    input: (input) => compact({ name: safeLabel(input.name) }),
  },
  askUser: {
    input: (input) =>
      compact({
        questionCount: safeCount(
          Array.isArray(input.questions) ? input.questions.length : undefined,
        ),
      }),
  },
  // INTENTIONAL default-deny (no entry):
  //  - verifyCitations: its rich summary is owned by the `citation_check` event,
  //    so a result summary here would just duplicate that count.
  //  - deleteArtifact: no user-meaningful safe scalar (only an opaque id).
  //  - runComputation: the label alone ("Menjalankan komputasi") suffices; its
  //    kind/status are not rendered, so we don't extract them (default-deny).
};

/**
 * Project a raw tool input to safe scalars per the allow-list. Default-deny:
 * unknown tool, missing sanitizer, or non-object input → `{}`.
 */
export function sanitizeToolInput(
  toolName: string,
  input: unknown,
): ActivityScalarRecord {
  const sanitizer = TOOL_SANITIZERS[toolName];
  if (!sanitizer?.input || !input || typeof input !== "object") return {};
  return sanitizer.input(input as Record<string, unknown>);
}

/**
 * Project a raw tool response to safe scalars per the allow-list. Default-deny:
 * unknown tool or missing sanitizer → `{}`.
 */
export function sanitizeToolResult(
  toolName: string,
  response: unknown,
): ActivityScalarRecord {
  const sanitizer = TOOL_SANITIZERS[toolName];
  if (!sanitizer?.result) return {};
  return sanitizer.result(response);
}

// ── run-level error sanitization (plan §8 / Fase 2 item 3) ───────────────────
//
// The `error` RunEvent payload feeds the timeline run header. Raw caught-error
// messages can carry a stack frame, file path, URL, or secret — so we map a
// short allow-list of known-safe internal codes / SDK result subtypes to
// friendly Indonesian copy and DEFAULT-DENY everything else to a generic line.
// (The raw message still lands in the run's stored `errorMessage` for ops/logs;
// only the client-facing event payload is sanitized.)

const GENERIC_RUN_ERROR = "Terjadi kesalahan internal";

// Known-safe internal codes. `budgetExhausted` is constructed by the service
// itself (runManager) — reference this constant at the emit site so the literal
// can never silently drift from its allow-list key (a rename is a compile
// error). `maxTurns`/`duringExecution` also match SDK result subtypes.
export const RUN_ERROR_CODES = {
  budgetExhausted: "budget_exhausted",
  maxTurns: "error_max_turns",
  duringExecution: "error_during_execution",
} as const;

const SAFE_RUN_ERROR_MESSAGES: Record<string, string> = {
  [RUN_ERROR_CODES.budgetExhausted]: "Batas biaya tercapai",
  [RUN_ERROR_CODES.maxTurns]: "Batas langkah agen tercapai",
  [RUN_ERROR_CODES.duringExecution]: "Terjadi kesalahan saat eksekusi",
};

export function sanitizeRunErrorMessage(message: string | undefined): string {
  if (!message) return GENERIC_RUN_ERROR;
  const trimmed = message.trim();
  const direct = SAFE_RUN_ERROR_MESSAGES[trimmed];
  if (direct) return direct;
  // Deep-research phase errors arrive as "phase <name>: <subtype>".
  const phaseMatch = /^phase\s+\w+:\s*(\S+)$/.exec(trimmed);
  const viaPhase = phaseMatch?.[1] ? SAFE_RUN_ERROR_MESSAGES[phaseMatch[1]] : undefined;
  if (viaPhase) return viaPhase;
  return GENERIC_RUN_ERROR;
}
