import type { PrepareStepFunction, StopCondition, ToolSet, UIMessage } from "ai";

type StepLike = {
  toolCalls?: ReadonlyArray<{ toolName: string }>;
  toolResults?: ReadonlyArray<{ toolName: string; output?: unknown; result?: unknown }>;
  usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number };
};

type StopConditionInput = { steps: ReadonlyArray<StepLike> };

const RESEARCH_KEYWORDS = [
  "research",
  "literature",
  "review",
  "analyze",
  "analysis",
  "compare",
  "evidence",
  "citation",
  "cite",
  "source",
  "academic",
  "paper",
  "study",
  "studies",
  "report",
  "policy",
  "regulation",
  "market",
  "competitive",
  "deep dive",
];

export function tokenBudget(limitTotal: number): StopCondition<ToolSet> {
  return ((args: StopConditionInput) => {
    const total = args.steps.reduce((sum, step) => {
      const used = step.usage?.totalTokens
        ?? ((step.usage?.inputTokens ?? 0) + (step.usage?.outputTokens ?? 0));
      return sum + (used ?? 0);
    }, 0);

    return total > limitTotal;
  }) as StopCondition<ToolSet>;
}

export function lastToolCallName(steps: ReadonlyArray<StepLike>): string | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    const lastCall = step.toolCalls?.at(-1);
    if (lastCall?.toolName) {
      return lastCall.toolName;
    }
  }

  return null;
}

export function lastToolResultPayload(
  steps: ReadonlyArray<StepLike>,
  toolName: string,
): unknown {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    const results = step.toolResults ?? [];
    for (let j = results.length - 1; j >= 0; j -= 1) {
      const result = results[j];
      if (result.toolName === toolName) {
        return (result.output ?? result.result) as unknown;
      }
    }
  }

  return null;
}

export function hasToolCall(steps: ReadonlyArray<StepLike>, toolName: string): boolean {
  return steps.some((step) => step.toolCalls?.some((call) => call.toolName === toolName));
}

export function countSuccessfulToolResults(
  steps: ReadonlyArray<StepLike>,
  toolName: string,
): number {
  let count = 0;
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (result.toolName !== toolName) {
        continue;
      }
      const payload = (result.output ?? result.result) as { ok?: boolean } | string | null | undefined;
      if (payload === null || payload === undefined) {
        continue;
      }
      // Count any non-null payload as success. Tool errors surface as the
      // result being absent, not as a falsy payload.
      count += 1;
    }
  }
  return count;
}

export function looksLikeResearchRequest(messages: ReadonlyArray<UIMessage>): boolean {
  const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
  if (!lastUser) {
    return false;
  }

  const text = (lastUser.parts ?? [])
    .filter((part): part is { type: "text"; text: string } =>
      typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text",
    )
    .map((part) => part.text)
    .join(" ")
    .toLowerCase();

  if (!text) {
    return false;
  }

  if (text.length > 240) {
    return true;
  }

  return RESEARCH_KEYWORDS.some((keyword) => text.includes(keyword));
}

type PhaseAwareOptions = {
  /**
   * When true, the orchestrator will be steered through the planner → searcher/reader →
   * synthesizer → critic pipeline. When false, all tools remain available with toolChoice "auto".
   */
  isResearch: boolean;
};

export function phaseAwarePrepareStep(opts: PhaseAwareOptions): PrepareStepFunction<ToolSet> {
  if (!opts.isResearch) {
    // Non-research chat: leave tool selection fully to the orchestrator.
    return (() => undefined) as PrepareStepFunction<ToolSet>;
  }

  return ((args: { stepNumber?: number; steps: ReadonlyArray<StepLike> }) => {
    const stepNumber = args.stepNumber ?? args.steps.length;
    const steps = args.steps;

    if (stepNumber === 0) {
      return {
        activeTools: ["research_planner", "loadSkill", "readSkillResource"],
        toolChoice: "required",
      };
    }

    const plannerDone = countSuccessfulToolResults(steps, "research_planner") > 0;
    const searcherDone = countSuccessfulToolResults(steps, "research_searcher");
    const readerDone = countSuccessfulToolResults(steps, "research_reader");
    const synthDone = countSuccessfulToolResults(steps, "research_synthesizer");
    const criticDone = countSuccessfulToolResults(steps, "research_critic");
    const lastTool = lastToolCallName(steps);

    if (lastTool === "research_critic") {
      const criticPayload = lastToolResultPayload(steps, "research_critic");
      const ok = (criticPayload as { ok?: boolean } | null)?.ok === true;
      if (ok) {
        return { activeTools: [], toolChoice: "none" };
      }
      return {
        activeTools: ["research_synthesizer"],
        toolChoice: "required",
      };
    }

    if (!plannerDone) {
      return {
        activeTools: ["research_planner"],
        toolChoice: "required",
      };
    }

    // Phase ordering: searcher → reader → synthesizer → critic → final.
    if (searcherDone === 0) {
      return {
        activeTools: ["research_searcher"],
        toolChoice: "required",
      };
    }

    if (readerDone === 0) {
      return {
        activeTools: ["research_reader"],
        toolChoice: "required",
      };
    }

    if (synthDone === 0) {
      return {
        activeTools: ["research_synthesizer"],
        toolChoice: "required",
      };
    }

    if (criticDone === 0) {
      return {
        activeTools: ["research_critic"],
        toolChoice: "required",
      };
    }

    // All five phases have run at least once: let the orchestrator finish.
    return { activeTools: [], toolChoice: "none" };
  }) as PrepareStepFunction<ToolSet>;
}
