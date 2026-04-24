import type { AgentsModel } from "./model";
import { AgentModelManager } from "./model-manager";
import type { AgentRepository } from "./repository";
import type { AgentContext } from "./repository";
import { AgentSdkRunner } from "./sdk-runner";
import type { AgentIdentity, AgentProgressEvent } from "./types";
import { ResearchOrchestrator } from "./workflows/research/orchestrator";

type ServiceError =
  | "unauthorized"
  | "workspace_not_found"
  | "agent_session_not_found"
  | "agent_session_busy";
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

export class AgentService {
  private readonly sdkRunner: AgentSdkRunner;
  private readonly researchOrchestrator: ResearchOrchestrator;

  constructor(
    private readonly repository: AgentRepository,
    private readonly modelManager: AgentModelManager,
  ) {
    this.sdkRunner = new AgentSdkRunner(repository);
    this.researchOrchestrator = new ResearchOrchestrator(
      repository,
      this.sdkRunner,
      modelManager,
    );
  }

  async startResearch(
    identity: AgentIdentity,
    input: AgentsModel["createResearchBody"],
  ): Promise<ServiceResult<AsyncGenerator<AgentProgressEvent>>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const depthMode = input.depthMode ?? "standard";
    const { session, userMessage } = await this.repository.createResearchSession({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      prompt: input.prompt,
      depthMode,
      maxResearchIterations:
        this.modelManager.getMaxResearchIterations(depthMode),
    });

    return {
      success: true,
      data: this.researchOrchestrator.run({
        sessionId: session.id,
        workspaceId: context.workspace.id,
        userId: context.user.id,
        prompt: input.prompt,
        depthMode,
        userMessageId: userMessage.id,
        turnNumber: userMessage.turnNumber,
      }),
    };
  }

  async followUpResearch(
    identity: AgentIdentity,
    sessionId: string,
    input: AgentsModel["followUpResearchBody"],
  ): Promise<ServiceResult<AsyncGenerator<AgentProgressEvent>>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const existing = await this.repository.getSessionForWorkspace(
      sessionId,
      context.workspace.id,
    );

    if (!existing) {
      return { success: false, error: "agent_session_not_found" };
    }

    const depthMode = input.depthMode ?? existing.depthMode;
    const started = await this.repository.startFollowUpTurn({
      sessionId,
      workspaceId: context.workspace.id,
      userId: context.user.id,
      message: input.message,
      depthMode,
      maxResearchIterations:
        this.modelManager.getMaxResearchIterations(depthMode),
    });

    if (started.status === "not_found") {
      return { success: false, error: "agent_session_not_found" };
    }

    if (started.status === "busy") {
      return { success: false, error: "agent_session_busy" };
    }

    return {
      success: true,
      data: this.researchOrchestrator.runFollowUp({
        sessionId: started.session.id,
        workspaceId: context.workspace.id,
        userId: context.user.id,
        originalPrompt: existing.prompt,
        latestFinalAnswer: existing.finalAnswer,
        message: input.message,
        depthMode,
        userMessageId: started.userMessage.id,
        turnNumber: started.userMessage.turnNumber,
      }),
    };
  }

  async getResearchSession(
    identity: AgentIdentity,
    sessionId: string,
  ): Promise<ServiceResult<AgentsModel["researchSession"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const readModel = await this.repository.getResearchReadModel(
      sessionId,
      context.workspace.id,
    );

    if (!readModel) {
      return { success: false, error: "agent_session_not_found" };
    }

    const { session, evidenceSummary, messages } = readModel;

    return {
      success: true,
      data: {
        id: session.id,
        workspaceId: session.workspaceId,
        userId: session.userId,
        prompt: session.prompt,
        depthMode: session.depthMode,
        status: session.status,
        finalAnswer: session.status === "completed" ? session.finalAnswer : null,
        auditWarnings: toStringArray(session.auditWarnings),
        auditFailures: toStringArray(session.auditFailures),
        messages: messages.map((message) => ({
          id: message.id,
          sessionId: message.sessionId,
          workspaceId: message.workspaceId,
          userId: message.userId,
          role: message.role,
          status: message.status,
          content: message.content,
          turnNumber: message.turnNumber,
          depthMode: message.depthMode,
          runId: message.runId,
          errorMessage: message.errorMessage,
          metadata: message.metadata,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
        })),
        evidenceSummary,
        errorMessage: session.errorMessage,
        startedAt: session.startedAt?.toISOString() ?? null,
        completedAt: session.completedAt?.toISOString() ?? null,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    };
  }

  async listResearchEvents(
    identity: AgentIdentity,
    sessionId: string,
  ): Promise<ServiceResult<AgentsModel["persistedEvent"][]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const session = await this.repository.getSessionForWorkspace(
      sessionId,
      context.workspace.id,
    );

    if (!session) {
      return { success: false, error: "agent_session_not_found" };
    }

    const events = await this.repository.listCuratedEvents(
      sessionId,
      context.workspace.id,
    );

    return {
      success: true,
      data: events.map((event) => ({
        id: event.id,
        sessionId: event.sessionId,
        runId: event.runId,
        phase: event.phase,
        sequence: event.sequence,
        eventType: event.eventType,
        curated: event.curated,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private async getContext(identity: AgentIdentity): Promise<
    "unauthorized" | "workspace_not_found" | AgentContext
  > {
    const context = await this.repository.getContextByIdentity(
      identity.authTokenIdentifier,
      identity.clerkUserId,
    );

    if (!context.success) {
      return context.error;
    }

    return context.data;
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
