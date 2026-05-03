import { and, desc, eq, sql } from "drizzle-orm";
import {
  agentEvents,
  agentRuns,
  chatArtifacts,
  chatMessages,
  chatSources,
  chatThreads,
  type JsonValue,
} from "@aqsha/db";
import { generateId, type UIMessage } from "ai";
import type { DatabaseClient } from "../../database/client";
import type {
  AgentEvent,
  AgentRun,
  AppendChatArtifactInput,
  AppendAgentEventInput,
  ChatMessage,
  ChatScope,
  ChatArtifact,
  ChatSource,
  ChatStore,
  ChatThread,
  CreateAgentRunInput,
  CreateChatThreadInput,
  FinishAgentRunInput,
  UpsertChatSourceInput,
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
          eq(chatThreads.ownerUserId, scope.userId),
          eq(chatThreads.status, "active"),
        ),
      )
      .limit(1);

    return thread ? this.toThread(thread) : null;
  }

  async getMessages(_scope: ChatScope, threadId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
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
          eq(agentRuns.userId, scope.userId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);

    return run ? this.toRun(run) : null;
  }

  async getEvents(_scope: ChatScope, threadId: string): Promise<AgentEvent[]> {
    const rows = await this.db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.chatThreadId, threadId))
      .orderBy(agentEvents.occurredAt, agentEvents.sequence);

    return rows.map((row) => this.toEvent(row));
  }

  async getSources(_scope: ChatScope, threadId: string): Promise<ChatSource[]> {
    const rows = await this.db
      .select()
      .from(chatSources)
      .where(eq(chatSources.chatThreadId, threadId))
      .orderBy(chatSources.firstSeenAt, chatSources.createdAt);

    return rows.map((row) => this.toSource(row));
  }

  async getArtifacts(_scope: ChatScope, threadId: string): Promise<ChatArtifact[]> {
    const rows = await this.db
      .select()
      .from(chatArtifacts)
      .where(eq(chatArtifacts.chatThreadId, threadId))
      .orderBy(chatArtifacts.createdAt);

    return rows.map((row) => this.toArtifact(row));
  }

  async createRun(input: CreateAgentRunInput): Promise<AgentRun> {
    const now = new Date();
    const [run] = await this.db
      .insert(agentRuns)
      .values({
        chatThreadId: input.chatThreadId,
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
    _scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    event: AppendAgentEventInput,
  ): Promise<AgentEvent> {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
    const [storedEvent] = await this.db
      .insert(agentEvents)
      .values({
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
        payload: this.toJsonValue(event.payload ?? null),
        occurredAt,
      })
      .returning();

    return this.toEvent(storedEvent);
  }

  async upsertSource(
    _scope: ChatScope,
    source: UpsertChatSourceInput,
  ): Promise<ChatSource> {
    const seenAt = source.seenAt ? new Date(source.seenAt) : new Date();
    const now = new Date();
    const [storedSource] = await this.db
      .insert(chatSources)
      .values({
        chatThreadId: source.chatThreadId,
        runId: source.runId,
        sourceKey: source.sourceKey,
        kind: source.kind,
        title: source.title ?? null,
        url: source.url ?? null,
        filename: source.filename ?? null,
        mediaType: source.mediaType ?? null,
        providerSourceId: source.providerSourceId ?? null,
        metadata: this.toJsonValue(source.metadata ?? null),
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [chatSources.chatThreadId, chatSources.sourceKey],
        set: {
          runId: source.runId,
          kind: source.kind,
          title: source.title ?? null,
          url: source.url ?? null,
          filename: source.filename ?? null,
          mediaType: source.mediaType ?? null,
          providerSourceId: source.providerSourceId ?? null,
          metadata: this.toJsonValue(source.metadata ?? null),
          lastSeenAt: seenAt,
          updatedAt: now,
        },
      })
      .returning();

    return this.toSource(storedSource);
  }

  async appendArtifact(
    _scope: ChatScope,
    artifact: AppendChatArtifactInput,
  ): Promise<ChatArtifact> {
    const [storedArtifact] = await this.db
      .insert(chatArtifacts)
      .values({
        ownerUserId: artifact.ownerUserId,
        chatThreadId: artifact.chatThreadId,
        runId: artifact.runId,
        messageId: artifact.messageId ?? null,
        kind: artifact.kind,
        title: artifact.title,
        caption: artifact.caption ?? null,
        fileKey: artifact.fileKey ?? null,
        url: artifact.url ?? null,
        contentType: artifact.contentType,
        byteSize: artifact.byteSize ?? null,
        checksum: artifact.checksum ?? null,
        sourceIds: artifact.sourceIds ?? [],
        sourceRefs: this.toJsonValue(artifact.sourceRefs ?? []),
        visualSpec: this.toJsonValue(artifact.visualSpec ?? null),
        auditStatus: artifact.auditStatus,
        auditSummary: artifact.auditSummary ?? null,
        failureSummary: artifact.failureSummary ?? null,
        developerDetail: this.toJsonValue(artifact.developerDetail ?? null),
      })
      .returning();

    return this.toArtifact(storedArtifact);
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

  private toSource(source: typeof chatSources.$inferSelect): ChatSource {
    return {
      id: source.id,
      chatThreadId: source.chatThreadId,
      runId: source.runId,
      kind: source.kind,
      title: source.title,
      url: source.url,
      filename: source.filename,
      mediaType: source.mediaType,
      providerSourceId: source.providerSourceId,
      metadata: source.metadata ?? null,
      firstSeenAt: source.firstSeenAt.toISOString(),
      lastSeenAt: source.lastSeenAt.toISOString(),
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    };
  }

  private toArtifact(artifact: typeof chatArtifacts.$inferSelect): ChatArtifact {
    return {
      id: artifact.id,
      ownerUserId: artifact.ownerUserId,
      chatThreadId: artifact.chatThreadId,
      runId: artifact.runId,
      messageId: artifact.messageId,
      kind: artifact.kind,
      title: artifact.title,
      caption: artifact.caption,
      fileKey: artifact.fileKey,
      url: artifact.url,
      contentType: artifact.contentType === "image/png" ? "image/png" : null,
      byteSize: artifact.byteSize,
      checksum: artifact.checksum,
      sourceIds: artifact.sourceIds ?? [],
      sourceRefs: artifact.sourceRefs ?? [],
      visualSpec: artifact.visualSpec ?? null,
      auditStatus: artifact.auditStatus,
      auditSummary: artifact.auditSummary,
      failureSummary: artifact.failureSummary,
      developerDetail: artifact.developerDetail ?? null,
      createdAt: artifact.createdAt.toISOString(),
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
