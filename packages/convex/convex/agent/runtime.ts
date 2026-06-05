import { Agent, stepCountIs, type UsageHandler } from "@convex-dev/agent";
import { components, internal } from "../_generated/api";
import { chatProvider } from "./providers";

export const NORMAL_MODEL = process.env.AQSHA_NORMAL_MODEL ?? "gpt-5.4-mini";
export const PRO_MODEL = process.env.AQSHA_PRO_MODEL ?? "gpt-5.5";

export type AgentKind = "lite" | "pro";

// Instruction lines shared by both Astra agents. The intro lines (answer
// length / posture) differ per agent; everything else is identical so the two
// agents behave the same for tools, citations, and HITL flows.
const SHARED_INSTRUCTIONS = [
  "Answer in clear, well-structured Markdown. Use headings, bullets, tables, and code blocks when they make the answer easier to scan.",
  "Use arXiv, Crossref, Exa, or web tools when the answer needs evidence. Cite important factual claims with source markers like [1].",
  "When the user refers to an uploaded or selected document from this thread, search the thread documents before answering unless the needed content is already present in the current context.",
  "Only cite source numbers that came from tool results. If adequate evidence is missing, say the evidence is insufficient instead of pretending certainty.",
  "For /artifact create: ALWAYS call askHuman first (1-2 questions about title, structure, or tone), wait for user answers via question cards, then call presentPlan.",
  "For /artifact update: use askHuman if target is unclear; otherwise presentPlan.",
  "For /artifact delete: use confirmAction only.",
  "Never skip askHuman on create by jumping straight to presentPlan.",
  "Use askHuman for structured clarification (question cards). Use presentPlan for create/update plans. Use confirmAction for delete.",
  "presentPlan must NOT include final markdown; content is generated only after the user clicks Build.",
  "After calling a HITL tool, keep the chat reply to one short sentence maximum.",
  "When workspace artifacts are selected as context and the user asks to create, update, or delete them, use the /artifact HITL flow even if they did not type /artifact.",
  "When the user asks to create or rename a workspace, use the /workspace HITL flow with askHuman and presentWorkspacePlan.",
  "Do not mutate workspace artifacts outside the /artifact HITL flow. Do not create or rename workspaces outside the /workspace HITL flow.",
  "Do not mention internal workflow status, model names, or implementation details.",
];

const LITE_INSTRUCTIONS = [
  "You are Astra, Aqsha's product research assistant.",
  "Keep answers focused and efficient; give a complete answer without unnecessary length.",
  ...SHARED_INSTRUCTIONS,
].join(" ");

const PRO_INSTRUCTIONS = [
  "You are Astra, Aqsha's product research assistant in its most capable configuration.",
  "Be thorough and rigorous: take additional reasoning and tool-use steps when they improve accuracy, and do not artificially shorten answers.",
  ...SHARED_INSTRUCTIONS,
].join(" ");

// Two agents sharing the same components.agent store (same threads/messages),
// differing only in model, step budget, and intro instructions.
export const astraLite = new Agent(components.agent, {
  name: "Astra Lite",
  languageModel: chatProvider.chat(NORMAL_MODEL),
  instructions: LITE_INSTRUCTIONS,
  stopWhen: stepCountIs(5),
});

export const astraPro = new Agent(components.agent, {
  name: "Astra Pro",
  languageModel: chatProvider.chat(PRO_MODEL),
  instructions: PRO_INSTRUCTIONS,
  stopWhen: stepCountIs(10),
});

export function agentForKind(kind: AgentKind | undefined) {
  return kind === "pro" ? astraPro : astraLite;
}

// Back-compat alias for agent-neutral call sites (saveMessages, thread title
// patches, failure messages). Both agents share the same components.agent
// store, so any of them can perform these neutral operations.
export const astra = astraLite;

export const recordUsage: UsageHandler = async (ctx, args) => {
  if (!args.userId || !args.threadId) {
    return;
  }

  const inputTokens = args.usage.inputTokens ?? 0;
  const outputTokens = args.usage.outputTokens ?? 0;
  const totalTokens = args.usage.totalTokens ?? inputTokens + outputTokens;

  await ctx.runMutation(internal.agent.messages.recordUsage, {
    ownerUserId: args.userId,
    threadId: args.threadId,
    provider: args.provider,
    model: args.model,
    inputTokens,
    outputTokens,
    totalTokens,
  });
};
