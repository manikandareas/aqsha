import type { ResearchPlan, ResearchResult, SynthesisResult } from "./schemas";
import type { AgentMessageRecord, JsonValue } from "@aqsha/db";

export function plannerPrompt(prompt: string): string {
  return [
    "Create a concise research plan for the user request.",
    "Return only structured output matching the schema.",
    `User request: ${prompt}`,
  ].join("\n\n");
}

export function researcherPrompt(input: {
  prompt: string;
  plan: ResearchPlan;
  priorResults: ResearchResult[];
}): string {
  return [
    "Research the request using only allowed tools. Prefer retrieved evidence over unsupported reasoning.",
    "Return evidence items with stable citation keys and claims tied to those citation keys.",
    `User request: ${input.prompt}`,
    `Plan: ${JSON.stringify(input.plan)}`,
    `Prior results: ${JSON.stringify(input.priorResults)}`,
  ].join("\n\n");
}

export function criticPrompt(input: {
  prompt: string;
  plan: ResearchPlan;
  results: ResearchResult[];
}): string {
  return [
    "Decide whether the gathered evidence is sufficient to answer the request.",
    "Mark sufficient=false when important claims are unsupported.",
    `User request: ${input.prompt}`,
    `Plan: ${JSON.stringify(input.plan)}`,
    `Results: ${JSON.stringify(input.results)}`,
  ].join("\n\n");
}

export function synthesizerPrompt(input: {
  prompt: string;
  results: ResearchResult[];
}): string {
  return [
    "Write a clean final answer grounded in cited evidence.",
    "Every material claim must include citation keys in the structured claims list.",
    `User request: ${input.prompt}`,
    `Evidence: ${JSON.stringify(input.results)}`,
  ].join("\n\n");
}

export function revisionPrompt(input: {
  prompt: string;
  synthesis: SynthesisResult;
  failures: string[];
}): string {
  return [
    "Revise the answer so unsupported claims are removed or clearly qualified.",
    "Keep only claims that can be supported by citation keys.",
    `User request: ${input.prompt}`,
    `Draft: ${JSON.stringify(input.synthesis)}`,
    `Audit failures: ${JSON.stringify(input.failures)}`,
  ].join("\n\n");
}

export function followUpResearchPrompt(input: {
  originalPrompt: string;
  latestMessage: string;
  latestFinalAnswer?: string | null;
  messages: AgentMessageRecord[];
  researchContext: {
    plan?: JsonValue;
    synthesis?: JsonValue;
    audit?: JsonValue;
    evidenceItems: JsonValue;
    claims: JsonValue;
  };
}): string {
  return [
    "Run a new research pass for the latest user message while preserving the existing conversation context.",
    "Use the latest message as the immediate task. Treat prior answers as context, not as guaranteed evidence.",
    `Original session request: ${input.originalPrompt}`,
    `Conversation messages: ${JSON.stringify(
      input.messages.map((message) => ({
        role: message.role,
        status: message.status,
        content: message.content,
        turnNumber: message.turnNumber,
        depthMode: message.depthMode,
        createdAt: message.createdAt.toISOString(),
      })),
    )}`,
    `Latest final answer: ${input.latestFinalAnswer ?? ""}`,
    `Prior research context: ${JSON.stringify(input.researchContext)}`,
    `Latest user message: ${input.latestMessage}`,
  ].join("\n\n");
}
