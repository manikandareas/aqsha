import { env } from "../../config";
import type {
  AgentDepthMode,
  AgentResearchPhase,
  PhaseModelConfig,
} from "./types";

const phaseTurnDefaults = {
  planner: 6,
  researcher: {
    standard: 16,
    deep: 32,
  },
  critic: 8,
  synthesizer: 10,
  citation_audit: 6,
  synthesizer_revision: 8,
  final: 2,
} as const;

export class AgentModelManager {
  getPhaseConfig(input: {
    phase: AgentResearchPhase;
    depthMode: AgentDepthMode;
  }): PhaseModelConfig {
    return {
      phase: input.phase,
      depthMode: input.depthMode,
      model: env.AGENT_DEFAULT_MODEL,
      maxTurns: this.getMaxTurns(input.phase, input.depthMode),
      maxBudgetUsd:
        input.depthMode === "deep"
          ? env.AGENT_DEEP_MAX_BUDGET_USD
          : env.AGENT_STANDARD_MAX_BUDGET_USD,
      taskBudgetTokens:
        input.depthMode === "deep"
          ? env.AGENT_DEEP_TASK_BUDGET_TOKENS
          : env.AGENT_STANDARD_TASK_BUDGET_TOKENS,
    };
  }

  getMaxResearchIterations(depthMode: AgentDepthMode): number {
    return depthMode === "deep" ? 5 : 3;
  }

  private getMaxTurns(
    phase: AgentResearchPhase,
    depthMode: AgentDepthMode,
  ): number {
    const value = phaseTurnDefaults[phase];

    if (typeof value === "number") {
      return value;
    }

    return value[depthMode];
  }
}
