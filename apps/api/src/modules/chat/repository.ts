import { and, desc, eq, sql } from "drizzle-orm";
import { agentEvents, agentRuns, chatMessages, chatThreads, type JsonValue } from "@aqsha/db";
import { generateId, type UIMessage } from "ai";
import type { DatabaseClient } from "../../database/client";
import type {
  AgentEvent,
  AgentRun,
  AppendAgentEventInput,
  ChatMessage,
  ChatScope,
  ChatStore,
  ChatThread,
  CreateAgentRunInput,
  CreateChatThreadInput,
  FinishAgentRunInput,
} from "./store";

type ChatMessageRole = ChatMessage["role"];
type PersistedUIMessage = UIMessage & { createdAt?: string | Date };

export class DrizzleChatStore implements ChatStore {
  constructor(private readonly db: DatabaseClient) {}

  async listThreads(scope: ChatScope): Promise<ChatThread[]> {
    const rows = await this.db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.workspaceId, scope.workspaceId),
          eq(chatThreads.ownerUserId, scope.userId),
          eq(chatThreads.status, "active"),
        ),
      )
      .orderBy(desc(sql`coalesce(${chatThreads.lastMessageAt}, ${chatThreads.updatedAt})`));

    return rows.map((row) => this.toThread(row));
  }

  async createThread(input: CreateChatThreadInput): Promise<ChatThread> {
    const now = new Date();
    const [thread] = await this.db
      .insert(chatThreads)
      .values({
        workspaceId: input.workspaceId,
        ownerUserId: input.userId,
        title: "New chat",
        model: input.model,
        status: "active",
        updatedAt: now,
      })
      .returning();

    return this.toThread(thread);
  }

  async getThread(scope: ChatScope, threadId: string): Promise<ChatThread | null> {
    const [thread] = await this.db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.workspaceId, scope.workspaceId),
          eq(chatThreads.ownerUserId, scope.userId),
          eq(chatThreads.status, "active"),
        ),
      )
      .limit(1);

    return thread ? this.toThread(thread) : null;
  }

  async getMessages(scope: ChatScope, threadId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.threadId, threadId),
          eq(chatMessages.workspaceId, scope.workspaceId),
        ),
      )
      .orderBy(chatMessages.createdAt);

    return rows.map((row) => this.toMessage(row));
  }

  async getLatestRun(scope: ChatScope, threadId: string): Promise<AgentRun | null> {
    const [run] = await this.db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.chatThreadId, threadId),
          eq(agentRuns.workspaceId, scope.workspaceId),
          eq(agentRuns.userId, scope.userId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);

    return run ? this.toRun(run) : null;
  }

  async getEvents(scope: ChatScope, threadId: string): Promise<AgentEvent[]> {
    const rows = await this.db
      .select()
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.chatThreadId, threadId),
          eq(agentEvents.workspaceId, scope.workspaceId),
        ),
      )
      .orderBy(agentEvents.occurredAt, agentEvents.sequence);

    return rows.map((row) => this.toEvent(row));
  }

  async createRun(input: CreateAgentRunInput): Promise<AgentRun> {
    const now = new Date();
    const [run] = await this.db
      .insert(agentRuns)
      .values({
        chatThreadId: input.chatThreadId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        status: "running",
        startedAt: now,
        updatedAt: now,
        metadata: this.toJsonValue(input.metadata ?? null),
      })
      .returning();

    return this.toRun(run);
  }

  async appendEvent(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    event: AppendAgentEventInput,
  ): Promise<AgentEvent> {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
    const [storedEvent] = await this.db
      .insert(agentEvents)
      .values({
        runId: run.id,
        chatThreadId: run.chatThreadId,
        workspaceId: scope.workspaceId,
        sequence: event.sequence,
        type: event.type,
        scope: event.scope,
        status: event.status,
        title: event.title,
        summary: event.summary ?? null,
        agentName: event.agentName ?? null,
        toolName: event.toolName ?? null,
        parentEventId: event.parentEventId ?? null,
        payload: this.toJsonValue(event.payload ?? null),
        occurredAt,
      })
      .returning();

    return this.toEvent(storedEvent);
  }

  async finishRun(
    scope: ChatScope,
    runId: string,
    input: FinishAgentRunInput,
  ): Promise<AgentRun | null> {
    const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();
    const [run] = await this.db
      .update(agentRuns)
      .set({
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        completedAt,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(agentRuns.id, runId),
          eq(agentRuns.workspaceId, scope.workspaceId),
          eq(agentRuns.userId, scope.userId),
        ),
      )
      .returning();

    return run ? this.toRun(run) : null;
  }

  async appendMessage(
    scope: ChatScope,
    message: Omit<ChatMessage, "createdAt"> & { createdAt?: string },
  ): Promise<ChatMessage | null> {
    const thread = await this.getThread(scope, message.threadId);

    if (!thread) {
      return null;
    }

    const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
    const uiMessage = this.toUIMessageJson({
      id: message.id,
      role: message.role,
      parts: message.parts,
      createdAt: createdAt.toISOString(),
    } as PersistedUIMessage);

    const [storedMessage] = await this.db
      .insert(chatMessages)
      .values({
        id: message.id,
        threadId: message.threadId,
        workspaceId: scope.workspaceId,
        role: message.role,
        uiMessage,
        clientMessageId: message.id,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoUpdate({
        target: chatMessages.id,
        set: {
          role: message.role,
          uiMessage,
          clientMessageId: message.id,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.toMessage(storedMessage);
  }

  async upsertMessages(
    scope: ChatScope,
    threadId: string,
    messages: UIMessage[],
  ): Promise<ChatMessage[] | null> {
    const thread = await this.getThread(scope, threadId);

    if (!thread) {
      return null;
    }

    await this.db.transaction(async (tx) => {
      for (const [index, message] of messages.entries()) {
        if (!this.isPersistableRole(message.role)) {
          continue;
        }

        const id = message.id || generateId();
        const createdAt = this.getMessageCreatedAt(message, index);
        const uiMessage = this.toUIMessageJson({
          ...message,
          id,
          createdAt: createdAt.toISOString(),
        } as PersistedUIMessage);

        await tx
          .insert(chatMessages)
          .values({
            id,
            threadId,
            workspaceId: scope.workspaceId,
            role: message.role,
            uiMessage,
            clientMessageId: message.role === "user" ? id : null,
            createdAt,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: chatMessages.id,
            set: {
              role: message.role,
              uiMessage,
              updatedAt: new Date(),
            },
          });
      }
    });

    return this.getMessages(scope, threadId);
  }

  async updateThread(
    scope: ChatScope,
    threadId: string,
    patch: Partial<Pick<ChatThread, "title" | "updatedAt">> & {
      lastMessageAt?: string | null;
    },
  ): Promise<ChatThread | null> {
    const updatedAt = patch.updatedAt ? new Date(patch.updatedAt) : new Date();
    const [thread] = await this.db
      .update(chatThreads)
      .set({
        title: patch.title,
        updatedAt,
        lastMessageAt:
          patch.lastMessageAt === undefined
            ? undefined
            : patch.lastMessageAt
              ? new Date(patch.lastMessageAt)
              : null,
      })
      .where(
        and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.workspaceId, scope.workspaceId),
          eq(chatThreads.ownerUserId, scope.userId),
          eq(chatThreads.status, "active"),
        ),
      )
      .returning();

    return thread ? this.toThread(thread) : null;
  }

  async deleteThread(scope: ChatScope, threadId: string): Promise<boolean> {
    const [thread] = await this.db
      .delete(chatThreads)
      .where(
        and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.workspaceId, scope.workspaceId),
          eq(chatThreads.ownerUserId, scope.userId),
        ),
      )
      .returning({ id: chatThreads.id });

    return Boolean(thread);
  }

  private toThread(thread: typeof chatThreads.$inferSelect): ChatThread {
    return {
      id: thread.id,
      userId: thread.ownerUserId,
      title: thread.title,
      model: thread.model,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    };
  }

  private toMessage(message: typeof chatMessages.$inferSelect): ChatMessage {
    const uiMessage = message.uiMessage as unknown as PersistedUIMessage;

    return {
      id: uiMessage.id || message.id,
      threadId: message.threadId,
      role: this.toApiRole(message.role),
      parts: Array.isArray(uiMessage.parts) ? uiMessage.parts : [],
      createdAt: this.getStoredMessageCreatedAt(uiMessage, message.createdAt),
    };
  }

  private toRun(run: typeof agentRuns.$inferSelect): AgentRun {
    return {
      id: run.id,
      chatThreadId: run.chatThreadId,
      userId: run.userId,
      status: run.status,
      errorMessage: run.errorMessage,
      metadata: run.metadata ?? null,
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private toEvent(event: typeof agentEvents.$inferSelect): AgentEvent {
    return {
      id: event.id,
      runId: event.runId,
      chatThreadId: event.chatThreadId,
      sequence: event.sequence,
      type: event.type,
      scope: event.scope,
      status: event.status,
      title: event.title,
      summary: event.summary,
      agentName: event.agentName,
      toolName: event.toolName,
      parentEventId: event.parentEventId,
      payload: event.payload ?? null,
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
    };
  }

  private toApiRole(role: string): ChatMessageRole {
    return role === "assistant" || role === "system" ? role : "user";
  }

  private isPersistableRole(role: UIMessage["role"]): role is ChatMessageRole {
    return role === "user" || role === "assistant" || role === "system";
  }

  private getMessageCreatedAt(message: PersistedUIMessage, index: number): Date {
    if (message.createdAt) {
      return new Date(message.createdAt);
    }

    return new Date(Date.now() + index);
  }

  private getStoredMessageCreatedAt(message: PersistedUIMessage, fallback: Date): string {
    return message.createdAt ? new Date(message.createdAt).toISOString() : fallback.toISOString();
  }

  private toUIMessageJson(message: PersistedUIMessage): JsonValue {
    return JSON.parse(JSON.stringify(message)) as JsonValue;
  }

  private toJsonValue(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }
}
