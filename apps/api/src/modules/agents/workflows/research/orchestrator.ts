import type { JsonValue } from "@aqsha/db";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { AgentModelManager } from "../../model-manager";
import type { AgentRepository } from "../../repository";
import type { AgentSdkRunner } from "../../sdk-runner";
import type { AgentDepthMode, AgentProgressEvent } from "../../types";
import { auditCitations } from "./citation-audit";
import {
  criticPrompt,
  followUpResearchPrompt,
  plannerPrompt,
  researcherPrompt,
  revisionPrompt,
  synthesizerPrompt,
} from "./prompts";
import { createQdrantResearchServer } from "./qdrant-tools";
import {
  citationAuditSchema,
  criticSchema,
  planSchema,
  researchSchema,
  synthesisSchema,
  toSdkJsonSchema,
  type ResearchResult,
  type SynthesisResult,
} from "./schemas";
import { allowedWebsetsTools, createWebsetsMcpServers } from "./websets-tools";

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

    yield* this.runResearch({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      prompt: followUpResearchPrompt({
        originalPrompt: input.originalPrompt,
        latestMessage: input.message,
        latestFinalAnswer: input.latestFinalAnswer,
        messages,
        researchContext: {
          plan: researchContext.research?.plan,
          synthesis: researchContext.research?.synthesis,
          audit: researchContext.research?.audit,
          evidenceItems: researchContext.evidenceItems as JsonValue,
          claims: researchContext.claims as JsonValue,
        },
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
        prompt: plannerPrompt(input.prompt),
        schema: planSchema,
        outputFormat: toSdkJsonSchema(planSchema),
        modelConfig: this.modelManager.getPhaseConfig({
          phase: "planner",
          depthMode: input.depthMode,
        }),
      });

      const results: ResearchResult[] = [];
      const maxIterations = this.modelManager.getMaxResearchIterations(
        input.depthMode,
      );
      const mcpServers: NonNullable<Options["mcpServers"]> = {
        qdrant: createQdrantResearchServer(),
      };
      Object.assign(mcpServers, createWebsetsMcpServers());
      const allowedTools = [
        "mcp__qdrant__check_coverage",
        "mcp__qdrant__hybrid_search",
        "mcp__qdrant__get_chunk",
        ...allowedWebsetsTools,
      ];

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
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
          prompt: researcherPrompt({
            prompt: input.prompt,
            plan,
            priorResults: results,
          }),
          schema: researchSchema,
          outputFormat: toSdkJsonSchema(researchSchema),
          modelConfig: this.modelManager.getPhaseConfig({
            phase: "researcher",
            depthMode: input.depthMode,
          }),
          mcpServers,
          allowedTools,
        });
        results.push(research);

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
          prompt: criticPrompt({ prompt: input.prompt, plan, results }),
          schema: criticSchema,
          outputFormat: toSdkJsonSchema(criticSchema),
          modelConfig: this.modelManager.getPhaseConfig({
            phase: "critic",
            depthMode: input.depthMode,
          }),
        });

        if (critique.sufficient) {
          break;
        }
      }

      let synthesis = await this.synthesize(input, results, "synthesizer");
      let audit = auditCitations(synthesis);

      await citationAuditSchema.parseAsync(audit);

      if (!audit.passed) {
        yield await emit({
          type: "phase",
          sessionId: input.sessionId,
          phase: "synthesizer_revision",
          message: "Revising unsupported citations.",
        });
        synthesis = await this.synthesize(
          input,
          results,
          "synthesizer_revision",
          synthesis,
          audit.failures,
        );
        audit = auditCitations(synthesis);
      }

      await this.repository.saveResearchArtifacts({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        plan: plan as JsonValue,
        synthesis: synthesis as JsonValue,
        audit: audit as JsonValue,
        researchIterations: results.length,
        evidenceItems: synthesis.evidenceItems.map((item) => ({
          source: item.source,
          provenance: "model_cited",
          citationKey: item.citationKey,
          title: item.title,
          url: item.url,
          quote: item.quote,
        })),
        claims: synthesis.claims,
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
    }
  }

  private synthesize(
    input: {
      sessionId: string;
      workspaceId: string;
      prompt: string;
      depthMode: AgentDepthMode;
    },
    results: ResearchResult[],
    phase: "synthesizer" | "synthesizer_revision",
    previous?: SynthesisResult,
    failures?: string[],
  ) {
    return this.sdkRunner.runStructured({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      phase,
      prompt:
        phase === "synthesizer"
          ? synthesizerPrompt({ prompt: input.prompt, results })
          : revisionPrompt({
              prompt: input.prompt,
              synthesis: previous as SynthesisResult,
              failures: failures ?? [],
            }),
      schema: synthesisSchema,
      outputFormat: toSdkJsonSchema(synthesisSchema),
      modelConfig: this.modelManager.getPhaseConfig({
        phase,
        depthMode: input.depthMode,
      }),
    });
  }
}
