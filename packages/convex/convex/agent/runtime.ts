import { Agent, stepCountIs, type UsageHandler } from "@convex-dev/agent";
import { components, internal } from "../_generated/api";
import { chatProvider } from "./providers/providers";
import { type AgentKind, CHAT_LITE_MODEL, CHAT_PRO_MODEL } from "./models";

// Re-exported for legacy importers; canonical definition now lives in models.ts
// (severs the models → runtime edge so runtime.ts is deletable at cutover).
export type { AgentKind };

// Instruction lines shared by both Astra agents. The intro lines (answer
// length / posture) differ per agent; everything else is identical so the two
// agents behave the same for tools, citations, and HITL flows.
const SHARED_INSTRUCTIONS = [
  "Answer in clear, well-structured Markdown. Use headings, bullets, tables, and code blocks when they make the answer easier to scan.",
  "Use arXiv, Crossref, Exa, or web tools when the answer needs evidence. Cite important factual claims with source markers like [1].",
  "When the user refers to an uploaded or selected document from this thread, search the thread documents before answering unless the needed content is already present in the current context.",
  "When one or more workspaces are attached, a <thread_workspace_context> manifest lists each workspace name and its document titles. Use that manifest to answer questions about a workspace's contents — for example listing or summarizing the items in a mentioned workspace — instead of claiming you lack access. For the full content of a document, use the retrieved excerpts or call searchThreadDocuments.",
  "Only cite source numbers that came from tool results. If adequate evidence is missing, say the evidence is insufficient instead of pretending certainty.",
  "When a request is genuinely ambiguous and you cannot proceed without information only the user has, call askUser with one or two structured questions (each with 2-8 options). Wait for the answer; never ask the same thing in plain chat text. Do not over-ask: skip askUser when the intent is already clear.",
  "To create or update a workspace artifact, call proposeArtifact with a title, a short summary, and 1-8 plan bullets describing what you will write — do NOT include the final body. After the user approves, call executeArtifact exactly once with the complete final content.",
  "Never call executeArtifact before the user has approved a proposeArtifact for the same artifact.",
  "To delete a workspace artifact, call deleteArtifact; the user must confirm before it runs.",
  "To create or rename a workspace, call createWorkspace or renameWorkspace; the user must approve before it runs.",
  "When workspace artifacts are selected as context and the user asks to create, update, or delete them, use these tools even if they did not type a command.",
  "Do not mutate workspace artifacts, and do not create or rename workspaces, by any other means.",
  "After calling a tool that needs approval, keep the chat reply to one short sentence maximum.",
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
  languageModel: chatProvider.chat(CHAT_LITE_MODEL),
  instructions: LITE_INSTRUCTIONS,
  stopWhen: stepCountIs(5),
});

export const astraPro = new Agent(components.agent, {
  name: "Astra Pro",
  languageModel: chatProvider.chat(CHAT_PRO_MODEL),
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

type UsageHandlerCtx = Parameters<UsageHandler>[0];
type UsageHandlerArgs = Parameters<UsageHandler>[1];

async function recordUsageImpl(
  ctx: UsageHandlerCtx,
  args: UsageHandlerArgs,
  agentKind?: AgentKind,
) {
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
    ...(agentKind ? { agentKind } : {}),
  });
}

// Default usage handler (no run tier) — billing falls back to model-string
// attribution. Kept for any call site that doesn't have an agentKind.
export const recordUsage: UsageHandler = (ctx, args) =>
  recordUsageImpl(ctx, args);

// Per-call usage handler that attributes usage to the run's agent tier, so
// billing no longer has to infer pro/normal from the model string (AUD-02).
export function usageHandlerForAgent(agentKind: AgentKind): UsageHandler {
  return (ctx, args) => recordUsageImpl(ctx, args, agentKind);
}
