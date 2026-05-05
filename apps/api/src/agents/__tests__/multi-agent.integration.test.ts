import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openai } from "@ai-sdk/openai";
import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { users } from "@aqsha/db";
import { sql } from "drizzle-orm";
import { env, resolveAppPath } from "../../config";
import { database } from "../../database/client";
import { MemoryRepository } from "../../modules/memory/repository";
import { MemoryService } from "../../modules/memory/service";
import { subAgentForToolName, type SubAgentName } from "../agent-events";
import type { AstraDeps } from "../deps";
import { resolveModel } from "../model";
import { discoverSkills } from "../skills";
import { createAstraAgentResponse } from "../streams";
import { deepResearchReportSchema } from "../subagents/schemas";

const FIXTURE_PATH = resolve(import.meta.dir, "fixtures", "multi-agent-run.json");
const RESEARCH_QUESTION =
  "Apa state of the art untuk RAG retrieval evaluation per 2025? Kasih ringkasan singkat dengan citations.";

type AgentEventLog = {
  agentName: SubAgentName;
  status: "running" | "completed" | "failed";
  toolName: string;
};

type FixtureSnapshot = {
  question: string;
  capturedAt: string;
  agentEventCounts: Record<string, number>;
  uniqueSourceUrlCount: number;
  finishReasons: string[];
};

const skip = !env.RUN_INTEGRATION_TESTS;
const describeOrSkip = skip ? describe.skip : describe;

describeOrSkip("multi-agent research flow (integration)", () => {
  it("decomposes a research question through planner → searcher → reader → synthesizer → critic", async () => {
    const skillsRoots = env.ASTRA_SKILLS_ROOTS.split(",")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => resolveAppPath(r));
    const skills = await discoverSkills(skillsRoots);

    // Owner-scoped DB writes (sources, source_chunks, research_evidence_cards)
    // require a real UUID that exists in the users table. ASTRA_USER_ID may
    // be a non-UUID placeholder like "local-user" in dev .env, which fails
    // postgres uuid casting. Seed a deterministic test user instead.
    const testUserId = await ensureIntegrationTestUser();

    // conversationId / runId are intentionally omitted so memory writes
    // (which use these as nullable FKs) save with chat_thread_id=null and
    // run_id=null instead of failing FK constraints.
    const deps: AstraDeps = {
      userId: testUserId,
      workspace: env.ASTRA_WORKSPACE,
      constraints: ["This is an automated integration test; keep responses concise."],
    };

    const resolved = resolveModel(null);

    const memoryRepository = new MemoryRepository(database);
    const embeddingModel = openai.textEmbedding(env.ASTRA_EMBEDDING_MODEL);
    const memoryService = new MemoryService(memoryRepository, embeddingModel);

    const sourceUrls = new Set<string>();
    const response = await createAstraAgentResponse({
      model: resolved.model,
      providerOptions: resolved.providerOptions,
      context: { deps, skills },
      memoryService,
      uiMessages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: RESEARCH_QUESTION }],
        },
      ],
      onSource: (source) => {
        if (source.url) {
          sourceUrls.add(source.url);
        }
      },
    });

    expect(response.body).not.toBeNull();
    if (!response.body) {
      throw new Error("Stream had no body");
    }

    const {
      agentEvents,
      finishReasons,
      finalText,
      verifyToolCalls,
      assembledMessages,
    } = await drainAgentEvents(response.body);

    const completedAgents = new Set(
      agentEvents.filter((event) => event.status === "completed").map((event) => event.agentName),
    );

    expect(completedAgents.has("planner")).toBe(true);
    expect(completedAgents.has("searcher")).toBe(true);
    expect(completedAgents.has("reader")).toBe(true);
    expect(completedAgents.has("synthesizer")).toBe(true);
    expect(completedAgents.has("critic")).toBe(true);

    expect(sourceUrls.size).toBeGreaterThanOrEqual(3);

    // Phase 4 — final answer must be a structured deepResearchReport object.
    // Prefer assembled UIMessage parts (per text-id) over the raw text-delta
    // accumulator: AI SDK can interleave reasoning/multiple text streams, so
    // concatenating all deltas may corrupt the JSON shape.
    const assistantTextSpans = collectAssistantTextSpans(assembledMessages);
    if (env.RUN_INTEGRATION_TESTS) {
      writeFileSync(
        "/tmp/phase4-final-text.json",
        JSON.stringify(
          {
            finalText,
            finalTextLength: finalText.length,
            assembledTextSpans: assistantTextSpans,
          },
          null,
          2,
        ),
        "utf8",
      );
    }
    console.error(
      "[phase-4 debug] finalText length:",
      finalText.length,
      "assembled text spans:",
      assistantTextSpans.map((s) => s.length),
    );

    const candidate = (() => {
      const candidates = [
        ...assistantTextSpans.map((span) => span.trim()),
        finalText.trim(),
      ];
      for (const text of candidates) {
        const parsed = tryParseJson(text);
        if (parsed) return parsed;
      }
      return null;
    })();

    expect(candidate).not.toBeNull();
    const validated = deepResearchReportSchema.safeParse(candidate);
    if (!validated.success) {
      console.error(
        "[multi-agent] structured report validation failed:",
        JSON.stringify(validated.error.format(), null, 2),
      );
    }
    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.data.bibliography.length).toBeGreaterThanOrEqual(1);
      expect(validated.data.sections.length).toBeGreaterThanOrEqual(1);
      expect(["PROCEED", "REFINE", "PIVOT"]).toContain(validated.data.decision);
      console.error(
        "[multi-agent] phase 4 report summary:",
        JSON.stringify(
          {
            depth: validated.data.depth,
            decision: validated.data.decision,
            sections: validated.data.sections.length,
            bibliography: validated.data.bibliography.length,
            conflicts: validated.data.evidenceConflicts.length,
            uncertainties: validated.data.uncertainties.length,
          },
          null,
          2,
        ),
      );
    }

    // Note: critic sub-agent tool calls (verify_*) execute inside the isolated
    // sub-agent loop and do NOT propagate to the orchestrator UI stream, so
    // verifyToolCalls is observed empty here. We log it for diagnostics only;
    // wiring is covered by the verify-tools.test.ts unit tests instead.
    console.error(
      "[multi-agent] verification tools observed in orchestrator stream:",
      JSON.stringify(Array.from(verifyToolCalls)),
    );

    const snapshot: FixtureSnapshot = {
      question: RESEARCH_QUESTION,
      capturedAt: new Date().toISOString(),
      agentEventCounts: countBy(agentEvents, (event) => `${event.agentName}.${event.status}`),
      uniqueSourceUrlCount: sourceUrls.size,
      finishReasons,
    };

    if (!existsSync(FIXTURE_PATH)) {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, JSON.stringify(snapshot, null, 2));
      return;
    }

    const previous = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as FixtureSnapshot;

    for (const role of ["planner", "searcher", "reader", "synthesizer", "critic"] as const) {
      const previousCount = previous.agentEventCounts[`${role}.completed`] ?? 0;
      const currentCount = snapshot.agentEventCounts[`${role}.completed`] ?? 0;
      expect(currentCount).toBeGreaterThan(0);
      expect(previousCount).toBeGreaterThan(0);
    }

    expect(snapshot.uniqueSourceUrlCount).toBeGreaterThanOrEqual(3);
  }, 900_000);
});

const VERIFY_TOOL_NAMES = new Set([
  "verify_citation_exists",
  "verify_url_live",
  "verify_quote_in_source",
]);

async function drainAgentEvents(stream: ReadableStream<Uint8Array>): Promise<{
  agentEvents: AgentEventLog[];
  finishReasons: string[];
  finalText: string;
  verifyToolCalls: Set<string>;
  assembledMessages: UIMessage[];
}> {
  const agentEvents: AgentEventLog[] = [];
  const finishReasons: string[] = [];
  const verifyToolCalls = new Set<string>();
  const debug = process.env.DEBUG_MULTI_AGENT === "true";
  const counts: Record<string, number> = {};
  const toolCallNames = new Map<string, string>();
  let textDelta = "";
  let errorPayload: unknown = null;
  const assembledMessages: UIMessage[] = [];

  // Tee the stream so we can both inspect raw chunks AND assemble UIMessages.
  const [chunkBranch, messageBranch] = stream.tee();

  const messageStreamPromise = (async () => {
    const parsedForMessages = parseJsonEventStream({
      stream: messageBranch,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<
        | { success: true; value: UIMessageChunk }
        | { success: false; error: unknown },
        UIMessageChunk
      >({
        transform(chunk, controller) {
          if (!chunk.success) return;
          controller.enqueue(chunk.value);
        },
      }),
    );

    try {
      for await (const message of readUIMessageStream({
        stream: parsedForMessages,
      })) {
        // readUIMessageStream yields the latest assembled snapshot; replace
        // the entry rather than appending duplicates.
        const idx = assembledMessages.findIndex((m) => m.id === message.id);
        if (idx >= 0) {
          assembledMessages[idx] = message;
        } else {
          assembledMessages.push(message);
        }
      }
    } catch {
      // ignore — chunkBranch is the source of truth for assertions.
    }
  })();

  // Use chunkBranch for raw inspection.
  const chunkSourceStream = chunkBranch;

  const parsed = parseJsonEventStream({
    stream: chunkSourceStream,
    schema: uiMessageChunkSchema,
  });
  const reader = parsed.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (!value.success) {
      if (debug) {
        console.error("[multi-agent] parse failure", value.error);
      }
      continue;
    }

    const chunk = value.value;
    counts[chunk.type] = (counts[chunk.type] ?? 0) + 1;
    const record = chunk as unknown as Record<string, unknown>;

    if (
      typeof record.toolCallId === "string" &&
      typeof record.toolName === "string"
    ) {
      toolCallNames.set(record.toolCallId, record.toolName);
    }

    if (debug && chunk.type !== "tool-input-delta" && chunk.type !== "text-delta") {
      const summary: Record<string, unknown> = { type: chunk.type };
      if (typeof record.toolName === "string") summary.toolName = record.toolName;
      if (typeof record.toolCallId === "string") summary.toolCallId = record.toolCallId;
      if (typeof record.errorText === "string") summary.errorText = record.errorText;
      if (typeof record.finishReason === "string") summary.finishReason = record.finishReason;
      console.error("[multi-agent]", JSON.stringify(summary));
    }

    if (chunk.type === "text-delta" && typeof record.delta === "string") {
      textDelta += record.delta;
    }
    if (chunk.type === "error" && record.errorText) {
      errorPayload = record;
    }

    if (
      chunk.type === "tool-output-available" &&
      typeof record.toolName === "string" &&
      VERIFY_TOOL_NAMES.has(record.toolName)
    ) {
      verifyToolCalls.add(record.toolName);
    }
    if (
      chunk.type === "tool-output-available" &&
      typeof record.toolCallId === "string"
    ) {
      const name = toolCallNames.get(record.toolCallId);
      if (name && VERIFY_TOOL_NAMES.has(name)) {
        verifyToolCalls.add(name);
      }
    }

    handleChunk(chunk, agentEvents, finishReasons, toolCallNames);
  }

  if (debug) {
    console.error("[multi-agent] chunk counts", JSON.stringify(counts));
    console.error("[multi-agent] agentEvents", JSON.stringify(agentEvents));
    console.error("[multi-agent] text length", textDelta.length);
    console.error("[multi-agent] text snippet", textDelta.slice(0, 400));
    if (errorPayload) {
      console.error("[multi-agent] error payload", JSON.stringify(errorPayload));
    }
  }

  await messageStreamPromise;

  return {
    agentEvents,
    finishReasons,
    finalText: textDelta,
    verifyToolCalls,
    assembledMessages,
  };
}

// Deterministic UUID v5-style seed for the integration test user, derived
// from a fixed namespace string. Picked once and reused across runs so the
// `users` row is created on first run and re-used afterwards.
const INTEGRATION_TEST_USER_ID = "00000000-0000-4000-8000-000000abc001";
const INTEGRATION_TEST_USER_EMAIL = "integration-test@aqsha.local";

async function ensureIntegrationTestUser(): Promise<string> {
  await database
    .insert(users)
    .values({
      id: INTEGRATION_TEST_USER_ID,
      email: INTEGRATION_TEST_USER_EMAIL,
      emailVerified: true,
      name: "Integration Test",
    })
    .onConflictDoNothing({ target: users.id });
  // Some schemas require unique email; if a conflict on email occurs from a
  // prior partial run with a different id, fall back to selecting that row.
  const [row] = await database
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.id} = ${INTEGRATION_TEST_USER_ID}`)
    .limit(1);
  return row?.id ?? INTEGRATION_TEST_USER_ID;
}

function collectAssistantTextSpans(messages: UIMessage[]): string[] {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!lastAssistant) return [];

  const parts = lastAssistant.parts ?? [];
  const spans: string[] = [];
  for (const part of parts) {
    if (
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      const text = (part as { text: string }).text;
      if (text.trim()) spans.push(text);
    }
  }
  return spans;
}

function tryParseJson(text: string): unknown | null {
  if (!text) return null;

  // Strip optional ```json ... ``` fence first.
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const candidates: string[] = [];
  if (fence?.[1]) candidates.push(fence[1].trim());

  if (text.startsWith("{") && text.endsWith("}")) {
    candidates.push(text);
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch (error) {
      console.error(
        "[phase-4 debug] JSON.parse failed:",
        error instanceof Error ? error.message : String(error),
        "candidate length:",
        candidate.length,
      );
    }
  }
  return null;
}

function handleChunk(
  chunk: UIMessageChunk,
  agentEvents: AgentEventLog[],
  finishReasons: string[],
  toolCallNames: Map<string, string>,
) {
  const record = chunk as unknown as Record<string, unknown>;

  if (chunk.type === "finish") {
    const reason = typeof record.finishReason === "string" ? record.finishReason : "unknown";
    finishReasons.push(reason);
    return;
  }

  const explicitToolName = typeof record.toolName === "string" ? record.toolName : null;
  const callId = typeof record.toolCallId === "string" ? record.toolCallId : null;
  const toolName = explicitToolName ?? (callId ? toolCallNames.get(callId) ?? null : null);
  const agentName = subAgentForToolName(toolName);
  if (!agentName || !toolName) {
    return;
  }

  if (chunk.type === "tool-input-start" || chunk.type === "tool-input-available") {
    agentEvents.push({ agentName, status: "running", toolName });
    return;
  }

  if (chunk.type === "tool-output-available") {
    agentEvents.push({ agentName, status: "completed", toolName });
    return;
  }

  if (chunk.type === "tool-input-error" || chunk.type === "tool-output-error") {
    agentEvents.push({ agentName, status: "failed", toolName });
    return;
  }
}

function countBy<T>(items: ReadonlyArray<T>, key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
