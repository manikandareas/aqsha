import { describe, expect, test } from "bun:test";

import { runMinimalDeepResearchPhasePath } from "../../agents/deep-research/phases";
import type { UserService } from "../users/service";
import { ChatService } from "./service";
import type {
  AgentEvent,
  AgentRun,
  ChatArtifact,
  ChatMessage,
  ChatScope,
  ChatSource,
  ChatStore,
  ChatThread,
} from "./store";

const createdAt = "2026-05-03T00:00:00.000Z";

describe("ChatService", () => {
  test("returns persisted artifacts in thread detail for replay and audit", async () => {
    const store = {
      async listThreads() {
        return [];
      },
      async createThread() {
        throw new Error("not used");
      },
      async getThread() {
        return {
          id: "thread_123",
          userId: "user_123",
          title: "Evidence timeline research",
          model: null,
          createdAt,
          updatedAt: createdAt,
        };
      },
      async getMessages() {
        return [];
      },
      async getLatestRun() {
        return null;
      },
      async getEvents() {
        return [];
      },
      async getSources() {
        return [];
      },
      async getArtifacts() {
        return [
          {
            id: "artifact_123",
            ownerUserId: "user_123",
            chatThreadId: "thread_123",
            runId: "run_123",
            messageId: "message_123",
            kind: "visual_png" as const,
            title: "Evidence timeline",
            caption: "Verified source-backed timeline.",
            fileKey: "ut_file_123",
            url: "https://utfs.io/f/ut_file_123.png",
            contentType: "image/png" as const,
            byteSize: 8,
            checksum: "a".repeat(64),
            sourceIds: ["S1"],
            sourceRefs: [{ sourceId: "S1", chatSourceId: "source_123" }],
            visualSpec: { visualId: "evidence-timeline" },
            auditStatus: "passed" as const,
            auditSummary: "Visual references verified ledger source IDs.",
            failureSummary: null,
            developerDetail: null,
            createdAt,
          },
        ];
      },
      async createRun() {
        throw new Error("not used");
      },
      async appendEvent() {
        throw new Error("not used");
      },
      async upsertSource() {
        throw new Error("not used");
      },
      async appendArtifact() {
        throw new Error("not used");
      },
      async finishRun() {
        return null;
      },
      async appendMessage() {
        return null;
      },
      async upsertMessages() {
        return null;
      },
      async updateThread() {
        return null;
      },
      async deleteThread() {
        return false;
      },
    } satisfies ChatStore;
    const userService = {
      async getByAuthUserId() {
        return { id: "user_123" };
      },
    } as unknown as UserService;
    const service = new ChatService(store, userService);

    const result = await service.getThread(
      {
        authUserId: "auth_user_123",
        authTokenIdentifier: "better-auth:session",
      },
      "thread_123",
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            ownerUserId: "user_123",
            messageId: "message_123",
            checksum: "a".repeat(64),
            auditStatus: "passed",
            visualSpec: { visualId: "evidence-timeline" },
          }),
        ],
      }),
    });
  });

  test("returns persisted Deep Research phase events in thread detail", async () => {
    const run: AgentRun = {
      id: "run_123",
      chatThreadId: "thread_123",
      userId: "user_123",
      status: "running",
      errorMessage: null,
      metadata: null,
      startedAt: createdAt,
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    const store = new InMemoryChatStore({
      thread: {
        id: "thread_123",
        userId: "user_123",
        title: "Deep Research",
        model: null,
        createdAt,
        updatedAt: createdAt,
      },
      run,
    });
    const userService = {
      async getByAuthUserId() {
        return { id: "user_123" };
      },
    } as unknown as UserService;
    const service = new ChatService(store, userService);
    const scope: ChatScope = { userId: "user_123" };

    await runMinimalDeepResearchPhasePath(
      {
        model: "fake-model",
        researchQuestion: "How should students use evidence-aware AI?",
        context: "Scoped user request.",
        generateCompactOutput: async ({ phase, persona }) => ({
          phaseId: phase,
          phase,
          persona,
          status: "completed",
          summary: `${persona} completed ${phase}.`,
          sourceIds: phase === "scoping" ? [] : ["S1"],
          claimIds: phase === "evidence_extraction" ? ["C1"] : [],
          artifactIds: [],
          recommendation: "proceed",
        }),
      },
      async (event) => {
        await service.appendRunEvent(scope, run, {
          ...event,
          sequence: store.nextSequence(),
        });
      },
    );

    const result = await service.getThread(
      {
        authUserId: "auth_user_123",
        authTokenIdentifier: "better-auth:session",
      },
      "thread_123",
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "deep_research_phase_started",
            agentName: "Vektor",
            payload: expect.objectContaining({
              phaseId: "source_discovery_screening",
            }),
          }),
          expect.objectContaining({
            type: "deep_research_phase_completed",
            agentName: "Sanctum",
            payload: expect.objectContaining({
              compactOutput: expect.objectContaining({
                phaseId: "citation_audit_delivery_gate",
                recommendation: "proceed",
              }),
            }),
          }),
        ]),
      }),
    });
  });
});

class InMemoryChatStore implements ChatStore {
  private readonly thread: ChatThread;
  private readonly run: AgentRun;
  private readonly events: AgentEvent[] = [];
  private sequence = 0;

  constructor(input: { thread: ChatThread; run: AgentRun }) {
    this.thread = input.thread;
    this.run = input.run;
  }

  nextSequence(): number {
    this.sequence += 1;

    return this.sequence;
  }

  async listThreads(): Promise<ChatThread[]> {
    return [this.thread];
  }

  async createThread(): Promise<ChatThread> {
    return this.thread;
  }

  async getThread(): Promise<ChatThread | null> {
    return this.thread;
  }

  async getMessages(): Promise<ChatMessage[]> {
    return [];
  }

  async getLatestRun(): Promise<AgentRun | null> {
    return this.run;
  }

  async getEvents(): Promise<AgentEvent[]> {
    return this.events;
  }

  async getSources(): Promise<ChatSource[]> {
    return [];
  }

  async getArtifacts(): Promise<ChatArtifact[]> {
    return [];
  }

  async createRun(): Promise<AgentRun> {
    return this.run;
  }

  async appendEvent(
    _scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    event: Parameters<ChatStore["appendEvent"]>[2],
  ): Promise<AgentEvent> {
    const storedEvent: AgentEvent = {
      id: `event_${event.sequence}`,
      runId: run.id,
      chatThreadId: run.chatThreadId,
      sequence: event.sequence,
      type: event.type,
      scope: event.scope,
      status: event.status,
      title: event.title,
      summary: event.summary ?? null,
      agentName: event.agentName ?? null,
      toolName: event.toolName ?? null,
      parentEventId: event.parentEventId ?? null,
      payload: event.payload,
      occurredAt: event.occurredAt ?? createdAt,
      createdAt,
    };

    this.events.push(storedEvent);

    return storedEvent;
  }

  async upsertSource(): Promise<ChatSource> {
    throw new Error("not used");
  }

  async appendArtifact(): Promise<ChatArtifact> {
    throw new Error("not used");
  }

  async finishRun(): Promise<AgentRun | null> {
    return this.run;
  }

  async appendMessage(): Promise<ChatMessage | null> {
    return null;
  }

  async upsertMessages(): Promise<ChatMessage[] | null> {
    return null;
  }

  async updateThread(): Promise<ChatThread | null> {
    return this.thread;
  }

  async deleteThread(): Promise<boolean> {
    return false;
  }
}
