import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel, ToolSet } from "ai";
import type { MemoryService } from "../../modules/memory/service";
import {
  buildCriticAgent,
  buildPlannerAgent,
  buildReaderAgent,
  buildSearcherAgent,
  buildSynthesizerAgent,
} from "../subagents";
import type { AgentRuntimeContext } from "../types";
import { createMemoryRecallTool } from "./memory-recall";
import { createResearchCriticTool } from "./research-critic";
import { createResearchPlannerTool } from "./research-planner";
import { createResearchReaderTool } from "./research-reader";
import { createResearchSearcherTool } from "./research-searcher";
import { createResearchSynthesizerTool } from "./research-synthesizer";

export type SubAgentToolsOptions = {
  context: AgentRuntimeContext;
  exaTools: ToolSet;
  /**
   * Phase 2: arxiv_search, crossref_search, pubmed_search, rerank_sources,
   * fetch_url, pdf_extract. Searcher and Reader pick the subset they need.
   * Phase 3 augments this with `memory_recall` when memoryService is provided.
   */
  researchTools: ToolSet;
  defaultModel: LanguageModel;
  defaultProviderOptions?: ProviderOptions;
  plannerModel?: LanguageModel;
  plannerProviderOptions?: ProviderOptions;
  criticModel?: LanguageModel;
  criticProviderOptions?: ProviderOptions;
  memoryService?: MemoryService;
};

export type SubAgentTools = {
  research_planner: ReturnType<typeof createResearchPlannerTool>;
  research_searcher: ReturnType<typeof createResearchSearcherTool>;
  research_reader: ReturnType<typeof createResearchReaderTool>;
  research_synthesizer: ReturnType<typeof createResearchSynthesizerTool>;
  research_critic: ReturnType<typeof createResearchCriticTool>;
};

export function createSubAgentTools(opts: SubAgentToolsOptions): SubAgentTools {
  const augmentedResearchTools: ToolSet = opts.memoryService
    ? {
        ...opts.researchTools,
        memory_recall: createMemoryRecallTool({
          memoryService: opts.memoryService,
          ownerUserId: opts.context.deps.userId,
        }),
      }
    : opts.researchTools;

  const planner = buildPlannerAgent({
    model: opts.plannerModel ?? opts.defaultModel,
    providerOptions: opts.plannerProviderOptions ?? opts.defaultProviderOptions,
    context: opts.context,
  });

  const searcher = buildSearcherAgent({
    model: opts.defaultModel,
    providerOptions: opts.defaultProviderOptions,
    context: opts.context,
    exaTools: opts.exaTools,
    researchTools: augmentedResearchTools,
  });

  const reader = buildReaderAgent({
    model: opts.defaultModel,
    providerOptions: opts.defaultProviderOptions,
    context: opts.context,
    exaTools: opts.exaTools,
    researchTools: augmentedResearchTools,
  });

  const synthesizer = buildSynthesizerAgent({
    model: opts.defaultModel,
    providerOptions: opts.defaultProviderOptions,
    context: opts.context,
  });

  const critic = buildCriticAgent({
    model: opts.criticModel ?? opts.defaultModel,
    providerOptions: opts.criticProviderOptions ?? opts.defaultProviderOptions,
    context: opts.context,
  });

  const ownerUserId = opts.context.deps.userId;
  const scope = {
    ownerUserId,
    chatThreadId: opts.context.deps.conversationId ?? null,
    runId: opts.context.deps.runId ?? null,
  };

  return {
    research_planner: createResearchPlannerTool({ agent: planner }),
    research_searcher: createResearchSearcherTool({ agent: searcher }),
    research_reader: createResearchReaderTool({
      agent: reader,
      memoryService: opts.memoryService,
      scope,
    }),
    research_synthesizer: createResearchSynthesizerTool({ agent: synthesizer }),
    research_critic: createResearchCriticTool({ agent: critic }),
  };
}

export {
  createResearchPlannerTool,
  createResearchSearcherTool,
  createResearchReaderTool,
  createResearchSynthesizerTool,
  createResearchCriticTool,
};
