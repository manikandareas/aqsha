import type { JsonValue } from "@aqsha/db";
import { webSearchTool, type MCPServer, type Tool } from "@openai/agents";
import type { AgentModelManager } from "../../model-manager";
import type { AgentRepository } from "../../repository";
import type { AgentSdkRunner } from "../../sdk-runner";
import type { AgentDepthMode, AgentProgressEvent } from "../../types";
import { auditCitations } from "./citation-audit";
import {
  criticPrompt,
  criticSystemPrompt,
  followUpResearchPrompt,
  plannerPrompt,
  plannerSystemPrompt,
  researcherPrompt,
  researcherSystemPrompt,
  revisionPrompt,
  synthesizerPrompt,
  synthesizerRevisionSystemPrompt,
  synthesizerSystemPrompt,
} from "./prompts";
import { createQdrantResearchTools } from "./qdrant-tools";
import {
  citationAuditSchema,
  criticSchema,
  planSchema,
  researchSchema,
  synthesisSchema,
  type Claim,
  type CriticResult,
  type EvidenceItem,
  type ResearchResult,
  type SynthesisResult,
} from "./schemas";
import { createWebsetsMcpServer } from "./websets-tools";

export class ResearchOrchestrator {
  constructor(
    private readonly repository: AgentRepository,
    private readonly sdkRunner: AgentSdkRunner,
    private readonly modelManager: AgentModelManager,
  ) {}

  async *run(input: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    prompt: string;
    depthMode: AgentDepthMode;
    userMessageId: string;
    turnNumber: number;
  }): AsyncGenerator<AgentProgressEvent> {
    yield* this.runResearch(input);
  }

  async *runFollowUp(input: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    originalPrompt: string;
    latestFinalAnswer?: string | null;
    message: string;
    depthMode: AgentDepthMode;
    userMessageId: string;
    turnNumber: number;
  }): AsyncGenerator<AgentProgressEvent> {
    const [messages, researchContext] = await Promise.all([
      this.repository.listSessionMessages(input.sessionId, input.workspaceId),
      this.repository.getResearchContext(input.sessionId, input.workspaceId),
    ]);

    const priorEvidenceIds = researchContext.evidenceItems.map(
      (item) => item.citationKey,
    );
    const priorSupportedClaimIds = researchContext.claims
      .filter((claim) => claim.supported)
      .map((claim) => {
        const keys = claim.citationKeys;
        if (
          keys &&
          typeof keys === "object" &&
          !Array.isArray(keys) &&
          typeof (keys as { claimId?: unknown }).claimId === "string"
        ) {
          return (keys as { claimId: string }).claimId;
        }
        return null;
      })
      .filter((id): id is string => typeof id === "string");

    yield* this.runResearch({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      prompt: followUpResearchPrompt({
        originalPrompt: input.originalPrompt,
        latestMessage: input.message,
        latestFinalAnswer: input.latestFinalAnswer,
        priorEvidenceIds,
        priorSupportedClaimIds,
        recentMessages: messages,
      }),
      depthMode: input.depthMode,
      userMessageId: input.userMessageId,
      turnNumber: input.turnNumber,
    });
  }

  private async *runResearch(input: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    prompt: string;
    depthMode: AgentDepthMode;
    userMessageId: string;
    turnNumber: number;
  }): AsyncGenerator<AgentProgressEvent> {
    const emit = async (event: Omit<AgentProgressEvent, "at">) => {
      const progress = { ...event, at: new Date().toISOString() };
      await this.repository.appendEvent({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        phase: progress.phase,
        eventType: progress.type,
        curated: progress as JsonValue,
      });
      return progress;
    };

    yield await emit({
      type: "user_message",
      sessionId: input.sessionId,
      messageId: input.userMessageId,
      turnNumber: input.turnNumber,
      message: "User message saved.",
    });

    yield await emit({
      type: "session",
      sessionId: input.sessionId,
      message: "Research session started.",
    });

    const researcherMcpServers: MCPServer[] = [];

    try {
      yield await emit({
        type: "phase",
        sessionId: input.sessionId,
        phase: "planner",
        message: "Planning research.",
      });
      const plan = await this.sdkRunner.runStructured({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        phase: "planner",
        systemPrompt: plannerSystemPrompt,
        prompt: plannerPrompt(input.prompt),
        schema: planSchema,
        modelConfig: this.modelManager.getPhaseConfig({
          phase: "planner",
          depthMode: input.depthMode,
        }),
        // Planner has no tools today; AskUserQuestion is not wired yet.
        tools: [],
      });

      if (plan.status === "cancelled") {
        yield* this.failSession(
          input,
          emit,
          "planner_cancelled",
          "Planner cancelled the research request.",
        );
        return;
      }

      const maxIterations = this.modelManager.getMaxResearchIterations(
        input.depthMode,
      );

      // Researcher tool surface:
      //   - webSearchTool(): OpenAI's hosted web search (replaces Claude's
      //     WebSearch + WebFetch; returns content + citations in one call)
      //   - Qdrant function tools: local academic index
      //   - Websets MCP server: Exa-backed landscape scans (optional)
      const researcherTools: Tool<unknown>[] = [
        webSearchTool(),
        ...createQdrantResearchTools(),
      ];
      const websetsServer = createWebsetsMcpServer();
      if (websetsServer) {
        await websetsServer.connect();
        researcherMcpServers.push(websetsServer);
      }

      // Accumulated state across iterations. Sources of truth for the
      // critic (evidence pool) and the citation audit (claim pool).
      const evidencePool = new Map<string, EvidenceItem>();
      const candidatePool = new Map<string, ResearchResult["candidateSources"][number]>();
      const previousQueries = new Set<string>();
      const researchResults: ResearchResult[] = [];
      let latestCritic: CriticResult | null = null;
      let iterationsRun = 0;

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        iterationsRun = iteration + 1;
        yield await emit({
          type: "phase",
          sessionId: input.sessionId,
          phase: "researcher",
          message: `Research iteration ${iteration + 1}.`,
        });

        const research = await this.sdkRunner.runStructured({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          phase: "researcher",
          systemPrompt: researcherSystemPrompt,
          prompt: researcherPrompt({
            prompt: input.prompt,
            plan,
            iteration,
            gaps: latestCritic?.gaps ?? [],
            nextQueries: latestCritic?.nextQueries ?? [],
            previousQueries: Array.from(previousQueries),
            evidencePool: Array.from(evidencePool.values()),
          }),
          schema: researchSchema,
          modelConfig: this.modelManager.getPhaseConfig({
            phase: "researcher",
            depthMode: input.depthMode,
          }),
          tools: researcherTools,
          mcpServers: researcherMcpServers,
        });
        researchResults.push(research);

        for (const candidate of research.candidateSources) {
          candidatePool.set(candidate.candidateId, candidate);
        }
        for (const item of research.evidenceItems) {
          evidencePool.set(item.evidenceId, item);
        }
        for (const query of research.queriesUsed) {
          previousQueries.add(query);
        }

        yield await emit({
          type: "phase",
          sessionId: input.sessionId,
          phase: "critic",
          message: "Checking evidence sufficiency.",
        });

        const critique = await this.sdkRunner.runStructured({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          phase: "critic",
          systemPrompt: criticSystemPrompt,
          prompt: criticPrompt({
            prompt: input.prompt,
            plan,
            evidencePool: Array.from(evidencePool.values()),
            iteration,
          }),
          schema: criticSchema,
          modelConfig: this.modelManager.getPhaseConfig({
            phase: "critic",
            depthMode: input.depthMode,
          }),
          // Critic must not use tools; it reasons over the persisted pool.
          tools: [],
        });
        latestCritic = critique;

        // Per-iteration persistence (design v2 §6, evaluation finding 2.5/2.6).
        await this.repository.persistIterationArtifacts({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          iteration,
          candidateSources: research.candidateSources.map((c) => ({
            candidateId: c.candidateId,
            origin: c.origin,
            status: c.status,
            title: c.title || c.url || c.candidateId,
            url: c.url ?? null,
            externalId: c.externalId ?? c.candidateId,
          })),
          evidenceItems: research.evidenceItems.map((e) => ({
            evidenceId: e.evidenceId,
            source: e.source,
            provenance: e.provenance,
            title: e.title ?? null,
            url: e.url ?? null,
            quote: e.quote,
          })),
          claims: critique.claims.map((c) => ({
            claimId: c.claimId,
            statement: c.statement,
            confidence: c.confidence,
            supported: c.supported,
            citationKeys: c.evidenceIds,
          })),
        });

        if (critique.evidenceSufficient) {
          break;
        }
      }

      const claimPool: Claim[] = latestCritic?.claims ?? [];
      const supportedClaims = claimPool.filter((claim) => claim.supported);
      const unsupportedClaims = claimPool.filter((claim) => !claim.supported);
      const evidenceList = Array.from(evidencePool.values());

      if (supportedClaims.length === 0) {
        yield* this.failSession(
          input,
          emit,
          "insufficient_evidence",
          "No supported claims survived the research phase.",
        );
        await this.repository.finalizeResearchArtifacts({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          plan: plan as JsonValue,
          researchIterations: iterationsRun,
        });
        return;
      }

      let synthesis = await this.runSynthesizer({
        input,
        supportedClaims,
        unsupportedClaims,
        evidencePool: evidenceList,
      });

      let audit = auditCitations({
        claims: claimPool,
        evidencePool: evidenceList,
        synthesis,
      });
      await citationAuditSchema.parseAsync(audit);

      if (!audit.passed) {
        yield await emit({
          type: "phase",
          sessionId: input.sessionId,
          phase: "synthesizer_revision",
          message: "Revising unsupported citations.",
        });
        synthesis = await this.runSynthesizerRevision({
          input,
          priorSynthesis: synthesis,
          audit,
          supportedClaims,
          evidencePool: evidenceList,
        });
        audit = auditCitations({
          claims: claimPool,
          evidencePool: evidenceList,
          synthesis,
        });
        await citationAuditSchema.parseAsync(audit);
      }

      await this.repository.finalizeResearchArtifacts({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        plan: plan as JsonValue,
        synthesis: synthesis as JsonValue,
        audit: audit as JsonValue,
        researchIterations: iterationsRun,
      });

      if (!audit.passed) {
        await this.repository.completeSession(input.sessionId, {
          status: "failed",
          finalAnswer: null,
          auditWarnings: audit.warnings,
          auditFailures: audit.failures,
          errorMessage: "Citation audit failed.",
        });
        const assistantMessage = await this.repository.appendMessage({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          role: "assistant",
          status: "failed",
          content: "Citation audit failed.",
          turnNumber: input.turnNumber,
          depthMode: input.depthMode,
          errorMessage: "Citation audit failed.",
        });
        yield await emit({
          type: "assistant_message",
          sessionId: input.sessionId,
          phase: "final",
          messageId: assistantMessage.id,
          turnNumber: assistantMessage.turnNumber,
          message: "Assistant message failed.",
        });
        yield await emit({
          type: "failed",
          sessionId: input.sessionId,
          phase: "citation_audit",
          message: "Citation audit failed.",
        });
        return;
      }

      await this.repository.completeSession(input.sessionId, {
        status: "completed",
        finalAnswer: synthesis.answer,
        auditWarnings: audit.warnings,
        auditFailures: audit.failures,
      });
      const assistantMessage = await this.repository.appendMessage({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: "assistant",
        status: "completed",
        content: synthesis.answer,
        turnNumber: input.turnNumber,
        depthMode: input.depthMode,
        metadata: { audit } as JsonValue,
      });
      yield await emit({
        type: "assistant_message",
        sessionId: input.sessionId,
        phase: "final",
        messageId: assistantMessage.id,
        turnNumber: assistantMessage.turnNumber,
        message: synthesis.answer,
      });
      yield await emit({
        type: "completed",
        sessionId: input.sessionId,
        phase: "final",
        message: "Research completed.",
      });
    } catch (error) {
      await this.repository.completeSession(input.sessionId, {
        status: "failed",
        finalAnswer: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const assistantMessage = await this.repository.appendMessage({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: "assistant",
        status: "failed",
        content: error instanceof Error ? error.message : String(error),
        turnNumber: input.turnNumber,
        depthMode: input.depthMode,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      yield await emit({
        type: "assistant_message",
        sessionId: input.sessionId,
        messageId: assistantMessage.id,
        turnNumber: assistantMessage.turnNumber,
        message: "Assistant message failed.",
      });
      yield await emit({
        type: "failed",
        sessionId: input.sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      for (const server of researcherMcpServers) {
        await server.close().catch(() => undefined);
      }
    }
  }

  private async *failSession(
    input: {
      sessionId: string;
      workspaceId: string;
      userId: string;
      turnNumber: number;
      depthMode: AgentDepthMode;
    },
    emit: (
      event: Omit<AgentProgressEvent, "at">,
    ) => Promise<AgentProgressEvent>,
    code: string,
    message: string,
  ): AsyncGenerator<AgentProgressEvent> {
    await this.repository.completeSession(input.sessionId, {
      status: "failed",
      finalAnswer: null,
      errorMessage: message,
    });
    const assistantMessage = await this.repository.appendMessage({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: "assistant",
      status: "failed",
      content: message,
      turnNumber: input.turnNumber,
      depthMode: input.depthMode,
      errorMessage: message,
    });
    yield await emit({
      type: "assistant_message",
      sessionId: input.sessionId,
      phase: "final",
      messageId: assistantMessage.id,
      turnNumber: assistantMessage.turnNumber,
      message,
    });
    yield await emit({
      type: "failed",
      sessionId: input.sessionId,
      phase: "final",
      message: code,
    });
  }

  private runSynthesizer(args: {
    input: {
      sessionId: string;
      workspaceId: string;
      prompt: string;
      depthMode: AgentDepthMode;
    };
    supportedClaims: Claim[];
    unsupportedClaims: Claim[];
    evidencePool: EvidenceItem[];
  }): Promise<SynthesisResult> {
    return this.sdkRunner.runStructured({
      sessionId: args.input.sessionId,
      workspaceId: args.input.workspaceId,
      phase: "synthesizer",
      systemPrompt: synthesizerSystemPrompt,
      prompt: synthesizerPrompt({
        prompt: args.input.prompt,
        supportedClaims: args.supportedClaims,
        unsupportedClaims: args.unsupportedClaims,
        evidencePool: args.evidencePool,
      }),
      schema: synthesisSchema,
      modelConfig: this.modelManager.getPhaseConfig({
        phase: "synthesizer",
        depthMode: args.input.depthMode,
      }),
      tools: [],
    });
  }

  private runSynthesizerRevision(args: {
    input: {
      sessionId: string;
      workspaceId: string;
      prompt: string;
      depthMode: AgentDepthMode;
    };
    priorSynthesis: SynthesisResult;
    audit: ReturnType<typeof auditCitations>;
    supportedClaims: Claim[];
    evidencePool: EvidenceItem[];
  }): Promise<SynthesisResult> {
    return this.sdkRunner.runStructured({
      sessionId: args.input.sessionId,
      workspaceId: args.input.workspaceId,
      phase: "synthesizer_revision",
      systemPrompt: synthesizerRevisionSystemPrompt,
      prompt: revisionPrompt({
        prompt: args.input.prompt,
        priorSynthesis: args.priorSynthesis,
        audit: args.audit,
        supportedClaims: args.supportedClaims,
        evidencePool: args.evidencePool,
      }),
      schema: synthesisSchema,
      modelConfig: this.modelManager.getPhaseConfig({
        phase: "synthesizer_revision",
        depthMode: args.input.depthMode,
      }),
      tools: [],
    });
  }
}
