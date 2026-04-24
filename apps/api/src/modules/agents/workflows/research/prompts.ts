import type { AgentMessageRecord } from "@aqsha/db";
import type {
  CitationAuditResult,
  Claim,
  EvidenceItem,
  ResearchPlan,
  SynthesisResult,
} from "./schemas";

/**
 * Phase-specific system prompts (design v2 §11). MUST be passed on every
 * `query()` call — leaving systemPrompt unset makes the SDK fall back to the
 * Claude Code coding-agent preset, which is the wrong framing for research.
 */
export const plannerSystemPrompt = `You are the planning phase for Aqsha research.

Aqsha is an Indonesian academic research assistant. The user asks research
questions; your job is to scope the work, not to answer it.

Responsibilities:
- Decide whether the request is approved, needs revision, or cancelled.
- If approved, produce concrete research questions and candidate search queries.
- List the evidence shape the user needs (e.g. empirical studies, data points, policy text).

Rules:
- Do not perform research yourself. Do not synthesize an answer.
- If the request is ambiguous AND blocking, set status="needs_revision" and include
  concise clarifying questions. Only block when clarification is truly required.
- Keep research questions short and answerable; avoid catch-all questions.
- Return PlannerOutput (structured) only. Output no free-form text.`;

export const researcherSystemPrompt = `You are the researcher phase for Aqsha research.

Responsibilities:
- Gather evidence to answer the research questions handed to you by the planner.
- Use internal Qdrant first via mcp__qdrant-kb__* tools.
- Use WebSearch / WebFetch when internal coverage is partial or insufficient.
- Use Exa Websets (mcp__websets__*) only when the task benefits from systematic
  external candidate collection or enrichment; Websets results are candidate
  sources, not evidence.
- Never invent evidence. Every evidenceItem.quote must be a verbatim excerpt
  from a retrieved source.

Normalization rules (design v2 §6):
- Produce candidateSources[] for URLs you considered (websets items, web search
  hits, related qdrant chunks). origin in ["qdrant", "websets", "model"];
  status in ["candidate", "accepted", "rejected"] (accepted = promoted to evidence).
- Only promote a candidate to evidenceItems[] when ALL of the following hold:
  1) at least one verbatim quote >= 40 characters, OR a qdrant chunk with
     non-empty snippet,
  2) a resolvable title + (url OR doi OR candidateId),
  3) not a duplicate of evidence the pool already contains.
- If the planner or critic says an item is thin or duplicative, mark it
  rejected with rejectionReason instead of promoting.

ID rules:
- evidenceId is a short stable string you pick (e.g. "ev_01", "ev_02", ...).
  Use the same id across iterations for the same source; do not renumber.
- candidateId is a short stable string (e.g. "cand_01"). Use the same id
  across iterations for the same source.

Return ResearcherOutput (structured) only:
- candidateSources
- evidenceItems
- queriesUsed
- coverageAssessment: "sufficient" | "partial" | "insufficient"
- coverageNotes

Do not synthesize the final answer. Do not fabricate.`;

export const criticSystemPrompt = `You are the critic phase for Aqsha research.

Responsibilities:
- Read the entire accumulated evidence pool (across all iterations).
- Extract atomic claims. Each claim is one factual statement.
- For each claim, list the evidenceIds that support it, set confidence
  ("high" | "medium" | "low"), and set supported=true only when the
  evidenceIds actually ground the claim.
- Decide evidenceSufficient = true/false for the research question.
- If not sufficient, list concrete gaps and specific nextQueries the
  researcher should run. nextQueries must be query strings, not paragraphs.

ID rules:
- claimId is a short stable string you pick (e.g. "c_01", "c_02", ...).
  If you are revising a prior claim, reuse its id.
- evidenceIds must reference evidence the researcher has already produced.
  Do not invent evidenceIds. Do not cite candidate sources that were not
  promoted to evidence.

Return CriticOutput (structured) only. Do not use any tools. Do not
synthesize the final answer.`;

export const synthesizerSystemPrompt = `You are the synthesis phase for Aqsha research.

Responsibilities:
- Write a clean, direct answer to the user's research question, in the same
  language the user used (typically Indonesian).
- Only use claims the critic marked supported=true. List the claimIds you
  used in claimIdsUsed[]. Do not invent claimIds.
- Include a Limitations section when evidence is partial or claims are
  low-confidence. Set hasLimitations=true and fill limitationsText.
- Do not add outside knowledge. Do not introduce new claims.

Style:
- Paragraphs, not bullet walls. Short sentences.
- Inline markers like [CLAIM:c_01] are allowed in the answer body; the app
  strips them before display. Every [CLAIM:id] marker's id must appear in
  claimIdsUsed.

Return SynthesizerOutput (structured) only. Do not use any tools.`;

export const synthesizerRevisionSystemPrompt = `${synthesizerSystemPrompt}

Revision rules:
- You are revising a prior draft because the citation audit found problems.
- Remove or qualify any claim flagged in auditFailures.
- Do not introduce new claims or new evidence.
- Keep the overall answer direction the same.`;

// ---------------------------------------------------------------------------
// User prompts (the dynamic, per-call payload). Keep these terse and factual;
// the system prompts above carry the role/behavior.
// ---------------------------------------------------------------------------

export function plannerPrompt(prompt: string): string {
  return [
    "User request:",
    prompt,
    "",
    "Return a PlannerOutput for this request.",
  ].join("\n");
}

export function researcherPrompt(input: {
  prompt: string;
  plan: ResearchPlan;
  iteration: number;
  gaps: string[];
  nextQueries: string[];
  previousQueries: string[];
  evidencePool: EvidenceItem[];
}): string {
  const mode = input.iteration === 0 ? "BROAD" : "GAP_FILLING";
  const parts: string[] = [
    `Mode: ${mode} (iteration ${input.iteration + 1})`,
    `User request: ${input.prompt}`,
    `Research questions: ${JSON.stringify(input.plan.researchQuestions)}`,
    `Suggested queries from plan: ${JSON.stringify(input.plan.searchQueries)}`,
    `Required evidence shape: ${JSON.stringify(input.plan.requiredEvidence)}`,
  ];

  if (input.iteration > 0) {
    parts.push(
      `Previously issued queries (do not repeat verbatim): ${JSON.stringify(input.previousQueries)}`,
    );
    parts.push(`Critic gaps to fill: ${JSON.stringify(input.gaps)}`);
    parts.push(
      `Critic-suggested next queries (treat as hints, refine as needed): ${JSON.stringify(input.nextQueries)}`,
    );
    parts.push(
      `Existing evidence ids in pool (reuse same ids for same sources): ${JSON.stringify(input.evidencePool.map((e) => e.evidenceId))}`,
    );
  }

  parts.push("Return a ResearcherOutput for this iteration.");
  return parts.join("\n\n");
}

export function criticPrompt(input: {
  prompt: string;
  plan: ResearchPlan;
  evidencePool: EvidenceItem[];
  iteration: number;
}): string {
  const compactEvidence = input.evidencePool.map((item) => ({
    evidenceId: item.evidenceId,
    title: item.title ?? null,
    url: item.url ?? null,
    source: item.source,
    // Trim to keep the critic prompt budget stable across iterations.
    quote: item.quote.length > 600 ? `${item.quote.slice(0, 600)}…` : item.quote,
  }));
  return [
    `User request: ${input.prompt}`,
    `Research questions: ${JSON.stringify(input.plan.researchQuestions)}`,
    `Iteration: ${input.iteration + 1}`,
    `Evidence pool (${input.evidencePool.length} items):`,
    JSON.stringify(compactEvidence),
    "",
    "Extract claims, mark supported/confidence, list gaps + nextQueries, and decide evidenceSufficient.",
    "Return a CriticOutput.",
  ].join("\n");
}

export function synthesizerPrompt(input: {
  prompt: string;
  supportedClaims: Claim[];
  evidencePool: EvidenceItem[];
  unsupportedClaims: Claim[];
}): string {
  const compactEvidence = input.evidencePool.map((item) => ({
    evidenceId: item.evidenceId,
    title: item.title ?? null,
    url: item.url ?? null,
    quote: item.quote.length > 600 ? `${item.quote.slice(0, 600)}…` : item.quote,
  }));
  return [
    `User request: ${input.prompt}`,
    `Supported claims (${input.supportedClaims.length}):`,
    JSON.stringify(input.supportedClaims),
    `Evidence pool (${input.evidencePool.length}):`,
    JSON.stringify(compactEvidence),
    `Unsupported claims (do not cite): ${JSON.stringify(
      input.unsupportedClaims.map((c) => ({ claimId: c.claimId, statement: c.statement })),
    )}`,
    "",
    "Write the final answer grounded only in supported claims. Use [CLAIM:id] markers in the body.",
    "Return a SynthesizerOutput.",
  ].join("\n");
}

export function revisionPrompt(input: {
  prompt: string;
  priorSynthesis: SynthesisResult;
  audit: CitationAuditResult;
  supportedClaims: Claim[];
  evidencePool: EvidenceItem[];
}): string {
  const compactEvidence = input.evidencePool.map((item) => ({
    evidenceId: item.evidenceId,
    title: item.title ?? null,
    quote: item.quote.length > 400 ? `${item.quote.slice(0, 400)}…` : item.quote,
  }));
  return [
    `User request: ${input.prompt}`,
    `Prior draft answer: ${input.priorSynthesis.answer}`,
    `Prior claimIdsUsed: ${JSON.stringify(input.priorSynthesis.claimIdsUsed)}`,
    `Audit failures (must resolve): ${JSON.stringify(input.audit.failures)}`,
    `Audit warnings (should address): ${JSON.stringify(input.audit.warnings)}`,
    `Supported claims still available: ${JSON.stringify(input.supportedClaims)}`,
    `Evidence pool (${input.evidencePool.length}): ${JSON.stringify(compactEvidence)}`,
    "",
    "Revise the answer. Remove or hedge claims that triggered audit failures.",
    "Return a SynthesizerOutput.",
  ].join("\n");
}

/**
 * Follow-up turn prompt (design v2 §15). A compact recap of the prior run +
 * the new user message. IDs are listed so the researcher can reuse them;
 * full prior research artifacts are NOT serialised.
 */
export function followUpResearchPrompt(input: {
  originalPrompt: string;
  latestMessage: string;
  latestFinalAnswer?: string | null;
  priorEvidenceIds: string[];
  priorSupportedClaimIds: string[];
  recentMessages: AgentMessageRecord[];
}): string {
  const recent = input.recentMessages
    .slice(-3)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: truncate(m.content, 400),
    }));
  const recap = truncate(input.latestFinalAnswer ?? "", 1200);
  return [
    "This is a follow-up turn in an existing research session.",
    `Original session request: ${input.originalPrompt}`,
    `Prior answer recap: ${recap}`,
    `Recent messages: ${JSON.stringify(recent)}`,
    `Prior evidenceIds available for reuse: ${JSON.stringify(input.priorEvidenceIds)}`,
    `Prior supported claimIds available for reuse: ${JSON.stringify(input.priorSupportedClaimIds)}`,
    "",
    `Latest user message: ${input.latestMessage}`,
  ].join("\n\n");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
