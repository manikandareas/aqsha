import { describe, expect, test } from "bun:test";

import type { UserService } from "../users/service";
import { ChatService } from "./service";
import type {
  AgentEvent,
  AgentRun,
  ChatMessage,
  ChatScope,
  ChatSource,
  ChatStore,
  ChatThread,
} from "./store";

const createdAt = "2026-05-03T00:00:00.000Z";

describe("ChatService", () => {
  test("requests Run Cancellation and keeps the Research Chat blocked while cancellation is in flight", async () => {
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
    const identity = {
      authUserId: "auth_user_123",
      authTokenIdentifier: "better-auth:session",
    };

    const cancellation = await service.requestRunCancellation(
      identity,
      "thread_123",
      "run_123",
    );
    const nextRun = await service.createRun(identity, "thread_123", {
      trigger: "submit-message",
    });
    const detail = await service.getThread(identity, "thread_123");

    expect(cancellation).toEqual({
      success: true,
      data: expect.objectContaining({
        status: "cancel_requested",
      }),
    });
    expect(nextRun).toEqual({
      success: false,
      error: "agent_run_active",
    });
    expect(detail).toEqual({
      success: true,
      data: expect.objectContaining({
        latestRun: expect.objectContaining({
          status: "cancel_requested",
        }),
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "run_cancel_requested",
            scope: "run",
            status: "running",
            title: "Run cancellation requested",
          }),
        ]),
      }),
    });
  });

  test("completes Run Cancellation and allows the next Deep Research Run", async () => {
    const run: AgentRun = {
      id: "run_123",
      chatThreadId: "thread_123",
      userId: "user_123",
      status: "cancel_requested",
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

    await service.completeRunCancellation(scope, run, {
      modelStream: "propagated",
    });
    const nextRun = await service.createRun(
      {
        authUserId: "auth_user_123",
        authTokenIdentifier: "better-auth:session",
      },
      "thread_123",
      { trigger: "submit-message" },
    );
    const detail = await service.getThread(
      {
        authUserId: "auth_user_123",
        authTokenIdentifier: "better-auth:session",
      },
      "thread_123",
    );

    expect(nextRun).toEqual({
      success: true,
      data: expect.objectContaining({
        run: expect.objectContaining({
          status: "running",
        }),
      }),
    });
    expect(detail).toEqual({
      success: true,
      data: expect.objectContaining({
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "run_cancellation_propagated",
            payload: expect.objectContaining({
              boundaries: expect.objectContaining({
                modelStream: "propagated",
              }),
            }),
          }),
          expect.objectContaining({
            type: "run_canceled",
            status: "completed",
          }),
        ]),
      }),
    });
  });

  test("does not append a new user message while a Deep Research Run is active", async () => {
    const run: AgentRun = {
      id: "run_123",
      chatThreadId: "thread_123",
      userId: "user_123",
      status: "cancel_requested",
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
    const service = new ChatService(
      store,
      {
        async getByAuthUserId() {
          return { id: "user_123" };
        },
      } as unknown as UserService,
    );

    const result = await service.appendUserMessage(
      {
        authUserId: "auth_user_123",
        authTokenIdentifier: "better-auth:session",
      },
      "thread_123",
      {
        role: "user",
        parts: [{ type: "text", text: "Continue this run." }],
      },
    );

    expect(result).toEqual({
      success: false,
      error: "agent_run_active",
    });
    expect(store.appendMessageCalls).toBe(0);
  });

  test("keeps Run Cancellation idempotent across repeated requests and completions", async () => {
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
    const service = new ChatService(
      store,
      {
        async getByAuthUserId() {
          return { id: "user_123" };
        },
      } as unknown as UserService,
    );
    const identity = {
      authUserId: "auth_user_123",
      authTokenIdentifier: "better-auth:session",
    };
    const scope: ChatScope = { userId: "user_123" };

    await service.requestRunCancellation(identity, "thread_123", "run_123");
    await service.requestRunCancellation(identity, "thread_123", "run_123");
    await service.completeRunCancellation(scope, run, {
      modelStream: "propagated",
    });
    await service.completeRunCancellation(scope, run, {
      modelStream: "already_finished",
    });

    expect(store.eventsOfType("run_cancel_requested")).toHaveLength(1);
    expect(store.eventsOfType("run_cancellation_propagated")).toHaveLength(1);
    expect(store.eventsOfType("run_canceled")).toHaveLength(1);
  });

});

class InMemoryChatStore implements ChatStore {
  private readonly thread: ChatThread;
  private readonly run: AgentRun;
  private readonly messages: ChatMessage[] = [];
  readonly events: AgentEvent[] = [];
  appendMessageCalls = 0;
  private sequence = 0;

  constructor(input: { thread: ChatThread; run: AgentRun }) {
    this.thread = input.thread;
    this.run = input.run;
  }

  nextSequence(): number {
    this.sequence += 1;

    return this.sequence;
  }

  eventsOfType(type: string): AgentEvent[] {
    return this.events.filter((event) => event.type === type);
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
    return this.messages;
  }

  async getRun(): Promise<AgentRun | null> {
    return this.run;
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

  async createRun(): Promise<AgentRun> {
    if (!["queued", "running", "cancel_requested"].includes(this.run.status)) {
      this.run.id = "run_next";
      this.run.status = "running";
      this.run.errorMessage = null;
      this.run.startedAt = createdAt;
      this.run.completedAt = null;
      this.run.createdAt = createdAt;
      this.run.updatedAt = createdAt;
    }

    return this.run;
  }

  async requestRunCancellation(): Promise<AgentRun | null> {
    if (this.run.status === "cancel_requested" || this.run.status === "canceled") {
      return this.run;
    }

    if (this.run.status !== "queued" && this.run.status !== "running") {
      return null;
    }

    this.run.status = "cancel_requested";
    this.run.updatedAt = createdAt;

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

  async finishRun(
    _scope: ChatScope,
    _runId: string,
    input: Parameters<ChatStore["finishRun"]>[2],
  ): Promise<AgentRun | null> {
    this.run.status = input.status;
    this.run.errorMessage = input.errorMessage ?? null;
    this.run.completedAt = input.completedAt ?? createdAt;
    this.run.updatedAt = this.run.completedAt;

    return this.run;
  }

  async appendMessage(
    _scope: ChatScope,
    message: Omit<ChatMessage, "createdAt"> & { createdAt?: string },
  ): Promise<ChatMessage | null> {
    this.appendMessageCalls += 1;

    const storedMessage: ChatMessage = {
      ...message,
      createdAt: message.createdAt ?? createdAt,
    };

    this.messages.push(storedMessage);

    return storedMessage;
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
