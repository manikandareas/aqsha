import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  parseJsonEventStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from "ai";
import { env, resolveAppPath } from "../../config";
import { subAgentForToolName, type SubAgentName } from "../agent-events";
import type { AstraDeps } from "../deps";
import { resolveModel } from "../model";
import { discoverSkills } from "../skills";
import { createAstraAgentResponse } from "../streams";

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

    const deps: AstraDeps = {
      userId: env.ASTRA_USER_ID,
      workspace: env.ASTRA_WORKSPACE,
      conversationId: "integration-test",
      runId: crypto.randomUUID(),
      constraints: ["This is an automated integration test; keep responses concise."],
    };

    const resolved = resolveModel(null);

    const sourceUrls = new Set<string>();
    const response = await createAstraAgentResponse({
      model: resolved.model,
      providerOptions: resolved.providerOptions,
      context: { deps, skills },
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

    const { agentEvents, finishReasons } = await drainAgentEvents(response.body);

    const completedAgents = new Set(
      agentEvents.filter((event) => event.status === "completed").map((event) => event.agentName),
    );

    expect(completedAgents.has("planner")).toBe(true);
    expect(completedAgents.has("searcher")).toBe(true);
    expect(completedAgents.has("reader")).toBe(true);
    expect(completedAgents.has("synthesizer")).toBe(true);
    expect(completedAgents.has("critic")).toBe(true);

    expect(sourceUrls.size).toBeGreaterThanOrEqual(3);

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

async function drainAgentEvents(stream: ReadableStream<Uint8Array>): Promise<{
  agentEvents: AgentEventLog[];
  finishReasons: string[];
}> {
  const agentEvents: AgentEventLog[] = [];
  const finishReasons: string[] = [];
  const debug = process.env.DEBUG_MULTI_AGENT === "true";
  const counts: Record<string, number> = {};
  const toolCallNames = new Map<string, string>();
  let textDelta = "";
  let errorPayload: unknown = null;

  const parsed = parseJsonEventStream({
    stream,
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

  return { agentEvents, finishReasons };
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
