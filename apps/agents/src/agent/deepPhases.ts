import { DEEP_PHASES, type DeepPhase, type ResearchPhaseState } from "@aqsha/agent-contracts";

// Durable deep-research phases (plan §5.5, §9.4 Step 4). Each phase is an
// ISOLATED query() call: no session resume between phases — the durable state
// is the phase outputs persisted in the store, injected into the next phase's
// prompt. A service restart (or failed-run retry) replays only missing phases.

export { DEEP_PHASES };
export type { DeepPhase };

export type DeepPhasePolicy = {
  /** Turn budget for this phase's query() call. */
  maxTurns: number;
  /** Literature phase delegates to parallel literature-searcher subagents. */
  useSubagents: boolean;
  /** Only the write phase streams into the visible assistant message. */
  streamsToChat: boolean;
  /**
   * Quality-gate phases (counter-evidence, citation verification) must not
   * kill the run when their turn budget runs dry with nothing usable — the
   * writer proceeds with an explicit caveat instead.
   */
  optional?: boolean;
};

export const PHASE_BUDGET_EXHAUSTED_NOTE =
  "(Fase ini terhenti karena budget turn habis sebelum menghasilkan ringkasan — perlakukan hasilnya sebagai tidak lengkap dan sampaikan keterbatasan ini di laporan.)";

// Every tool call consumes a turn, so search-heavy phases need slack; a phase
// that still hits its cap with usable text degrades to done-partial instead of
// failing the run (legacy "budget exhausted → partial" semantics).
export const DEEP_PHASE_POLICIES: Record<DeepPhase, DeepPhasePolicy> = {
  plan: { maxTurns: 4, useSubagents: false, streamsToChat: false },
  literature: { maxTurns: 16, useSubagents: true, streamsToChat: false },
  counter_evidence: {
    maxTurns: 10,
    useSubagents: true,
    streamsToChat: false,
    optional: true,
  },
  citation_verify: {
    maxTurns: 12,
    useSubagents: true,
    streamsToChat: false,
    optional: true,
  },
  write: { maxTurns: 8, useSubagents: false, streamsToChat: true },
};

/** True when a phase ended by exhausting its turn budget. */
export function isMaxTurnsStop(input: {
  streamError?: string;
  resultSubtype?: string;
}): boolean {
  return (
    input.resultSubtype === "error_max_turns" ||
    /maximum number of turns/i.test(input.streamError ?? "")
  );
}

export type DeepPhasePromptInput = {
  phase: DeepPhase;
  /** The research question (the /deep arguments). */
  question: string;
  /** Context blocks (artifacts/manifest/RAG) — only used by the plan phase. */
  contextBlock?: string;
  /** Outputs of the already-completed phases, keyed by phase. */
  priorOutputs: Partial<Record<DeepPhase, string>>;
  /** Domain-pack skill for the writer (legacy skillDelegation port). */
  writerSkill?: string | null;
};

const CITATION_DISCIPLINE =
  "Citation discipline: only cite sources that appeared in tool results during THIS run, keep the [n] citation numbers from the tool results, never invent identifiers.";

function section(title: string, body: string | undefined): string {
  return body?.trim() ? `## ${title}\n\n${body.trim()}` : "";
}

export function buildDeepPhasePrompt(input: DeepPhasePromptInput): string {
  const { phase, question, priorOutputs } = input;
  const blocks: string[] = [];

  switch (phase) {
    case "plan":
      blocks.push(
        "PHASE 1/5 — RESEARCH PLAN. Decompose the research question into 3-6 focused, independently searchable sub-questions. For each: the sub-question, the best search strategy (web / arXiv / DOI lookup), and the expected evidence types. Return the plan as structured Markdown. Do NOT perform searches in this phase.",
        input.contextBlock ?? "",
        section("Research question", question),
      );
      break;
    case "literature":
      blocks.push(
        "PHASE 2/5 — LITERATURE SEARCH. Execute the research plan below. Delegate one literature-searcher subagent per sub-question (independent sub-questions in parallel via the Agent tool), then consolidate their findings yourself.",
        "Your final message must be a consolidated evidence inventory in Markdown: per sub-question, every useful source with title, identifier (DOI/arXiv/URL), citation number [n], a 2-4 sentence evidence extract, and an evidence-strength rating (strong/medium/weak).",
        CITATION_DISCIPLINE,
        section("Research question", question),
        section("Research plan", priorOutputs.plan),
      );
      break;
    case "counter_evidence":
      blocks.push(
        "PHASE 3/5 — COUNTER-EVIDENCE. Delegate to the counter-evidence subagent (via the Agent tool) to run an adversarial pass over the evidence inventory below — searching specifically for evidence AGAINST its emerging conclusions: failed replications, contradicting studies, critiques, retractions. Then consolidate the subagent's findings into your own final message: list each rebuttal with its [n] citation and strength, and report honestly when none is found. Your final message is the only output that survives, so do not leave the consolidation to the subagent.",
        CITATION_DISCIPLINE,
        section("Research question", question),
        section("Evidence inventory", priorOutputs.literature),
      );
      break;
    case "citation_verify":
      blocks.push(
        "PHASE 4/5 — CITATION VERIFICATION. Delegate to the citation-verifier subagent (via the Agent tool), passing the full reference list collected below (each source's title, identifier, authors, year, and its [n] number). Then consolidate the subagent's verdicts into your own final message: per-reference results keyed by [n], with neutral framing — a flag is not an accusation, recommend manual review for anything uncertain. Your final message is the only output that survives, so do not leave the consolidation to the subagent.",
        CITATION_DISCIPLINE,
        section("Research question", question),
        section("Evidence inventory", priorOutputs.literature),
        section("Counter-evidence findings", priorOutputs.counter_evidence),
      );
      break;
    case "write":
      blocks.push(
        "PHASE 5/5 — REPORT. Synthesize the verified evidence below into a rigorous, well-structured research report in Markdown: executive summary, findings per sub-question, counter-evidence and limitations, and a references list. Every factual claim carries a [n] citation marker mapping to a verified source. State evidence strength explicitly and keep disagreements between sources visible.",
        "Deliver the report as a workspace artifact: call proposeArtifact with a title, summary, and plan bullets; after the user approves, write the full report with executeArtifact. Also give a concise summary of the key findings as your chat reply.",
        input.writerSkill
          ? `Apply the "${input.writerSkill}" skill's domain conventions to the report.`
          : "",
        CITATION_DISCIPLINE,
        section("Research question", question),
        section("Research plan", priorOutputs.plan),
        section("Evidence inventory", priorOutputs.literature),
        section("Counter-evidence findings", priorOutputs.counter_evidence),
        section("Citation verification", priorOutputs.citation_verify),
      );
      break;
  }

  return blocks.filter((block) => block.trim()).join("\n\n");
}

/** Map persisted phase states by phase for quick lookup. */
export function phaseStateMap(
  states: ResearchPhaseState[],
): Partial<Record<DeepPhase, ResearchPhaseState>> {
  const map: Partial<Record<DeepPhase, ResearchPhaseState>> = {};
  for (const state of states) {
    map[state.phase] = state;
  }
  return map;
}

/** Outputs of all phases marked done, for prompt assembly. */
export function priorOutputsFrom(
  states: Partial<Record<DeepPhase, ResearchPhaseState>>,
): Partial<Record<DeepPhase, string>> {
  const outputs: Partial<Record<DeepPhase, string>> = {};
  for (const phase of DEEP_PHASES) {
    const state = states[phase];
    if (state?.status === "done" && state.output) {
      outputs[phase] = state.output;
    }
  }
  return outputs;
}
