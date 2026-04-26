import {
  agentEvents,
  agentMessages,
  agentRuns,
  agentThreads,
  users,
  workspaces,
  type AgentEventRecord,
  type AgentMessageRecord,
  type AgentRunRecord,
  type AgentThreadRecord,
  type JsonValue,
  type UserRecord,
  type WorkspaceRecord,
} from "@aqsha/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseClient } from "../../database/client";

export interface AgentContext {
  user: UserRecord;
  workspace: WorkspaceRecord;
}

export type AgentContextLookup =
  | { success: true; data: AgentContext }
  | { success: false; error: "unauthorized" | "workspace_not_found" };

export interface CreateThreadInput {
  workspaceId: string;
  userId: string;
  title: string;
  depthMode: "standard" | "deep";
}

export interface CreateMessageRunInput {
  thread: AgentThreadRecord;
  userId: string;
  content: string;
  depthMode: "standard" | "deep";
}

export interface MessageRunResult {
  thread: AgentThreadRecord;
  userMessage: AgentMessageRecord;
  run: AgentRunRecord;
  messageHistory: AgentMessageRecord[];
}

export interface CreateEventInput {
  runId: string;
  threadId: string;
  workspaceId: string;
  sequence: number;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  title: string;
  visibility: "public" | "internal";
  payload: JsonValue | null;
}

export class AgentRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getContextByAuthUserId(authUserId: string): Promise<AgentContextLookup> {
    const [row] = await this.db
      .select({
        user: users,
        workspace: workspaces,
      })
      .from(users)
      .leftJoin(workspaces, eq(workspaces.ownerUserId, users.id))
      .where(eq(users.id, authUserId))
      .limit(1);

    if (!row) {
      return { success: false, error: "unauthorized" };
    }

    if (!row.workspace) {
      return { success: false, error: "workspace_not_found" };
    }

    return { success: true, data: { user: row.user, workspace: row.workspace } };
  }

  async createThread(input: CreateThreadInput): Promise<AgentThreadRecord> {
    const [thread] = await this.db
      .insert(agentThreads)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        title: input.title,
        depthMode: input.depthMode,
      })
      .returning();

    return thread;
  }

  async listThreads(workspaceId: string): Promise<AgentThreadRecord[]> {
    return this.db
      .select()
      .from(agentThreads)
      .where(
        and(
          eq(agentThreads.workspaceId, workspaceId),
          eq(agentThreads.status, "active"),
        ),
      )
      .orderBy(desc(agentThreads.updatedAt));
  }

  async getThread(
    threadId: string,
    workspaceId: string,
  ): Promise<AgentThreadRecord | null> {
    const [thread] = await this.db
      .select()
      .from(agentThreads)
      .where(
        and(eq(agentThreads.id, threadId), eq(agentThreads.workspaceId, workspaceId)),
      )
      .limit(1);

    return thread ?? null;
  }

  async archiveThread(
    threadId: string,
    workspaceId: string,
  ): Promise<AgentThreadRecord | null> {
    const [thread] = await this.db
      .update(agentThreads)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(
        and(eq(agentThreads.id, threadId), eq(agentThreads.workspaceId, workspaceId)),
      )
      .returning();

    return thread ?? null;
  }

  async getLatestRun(threadId: string): Promise<AgentRunRecord | null> {
    const [run] = await this.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.threadId, threadId))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);

    return run ?? null;
  }

  async getRun(
    runId: string,
    workspaceId: string,
  ): Promise<AgentRunRecord | null> {
    const [run] = await this.db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspaceId)))
      .limit(1);

    return run ?? null;
  }

  async listMessages(threadId: string): Promise<AgentMessageRecord[]> {
    return this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.threadId, threadId))
      .orderBy(agentMessages.createdAt);
  }

  async listEventsByThread(threadId: string): Promise<AgentEventRecord[]> {
    return this.db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.threadId, threadId))
      .orderBy(agentEvents.sequence);
  }

  async listEventsByRun(runId: string): Promise<AgentEventRecord[]> {
    return this.db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.runId, runId))
      .orderBy(agentEvents.sequence);
  }

  async createMessageRun(
    input: CreateMessageRunInput,
  ): Promise<MessageRunResult | "agent_session_busy"> {
    return this.db.transaction(async (tx) => {
      const [activeRun] = await tx
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.threadId, input.thread.id),
            inArray(agentRuns.status, ["queued", "running"]),
          ),
        )
        .limit(1);

      if (activeRun) {
        return "agent_session_busy";
      }

      const now = new Date();
      const [run] = await tx
        .insert(agentRuns)
        .values({
          threadId: input.thread.id,
          workspaceId: input.thread.workspaceId,
          userId: input.userId,
          status: "queued",
          depthMode: input.depthMode,
        })
        .returning();

      const [userMessage] = await tx
        .insert(agentMessages)
        .values({
          threadId: input.thread.id,
          workspaceId: input.thread.workspaceId,
          userId: input.userId,
          runId: run.id,
          role: "user",
          content: input.content,
          metadata: { depthMode: input.depthMode },
        })
        .returning();

      const messageHistory = await tx
        .select()
        .from(agentMessages)
        .where(eq(agentMessages.threadId, input.thread.id))
        .orderBy(agentMessages.createdAt);

      const [thread] = await tx
        .update(agentThreads)
        .set({
          depthMode: input.depthMode,
          updatedAt: now,
        })
        .where(eq(agentThreads.id, input.thread.id))
        .returning();

      return { thread, userMessage, run, messageHistory };
    });
  }

  async createEvent(input: CreateEventInput): Promise<AgentEventRecord> {
    const [event] = await this.db
      .insert(agentEvents)
      .values(input)
      .returning();

    return event;
  }

  async createAssistantMessage(input: {
    threadId: string;
    workspaceId: string;
    userId: string;
    runId: string;
    content: string;
    metadata?: JsonValue;
  }): Promise<AgentMessageRecord> {
    const [message] = await this.db
      .insert(agentMessages)
      .values({
        threadId: input.threadId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        runId: input.runId,
        role: "assistant",
        content: input.content,
        metadata: input.metadata,
      })
      .returning();

    await this.db
      .update(agentThreads)
      .set({ updatedAt: new Date() })
      .where(eq(agentThreads.id, input.threadId));

    return message;
  }

  async updateRunStatus(input: {
    runId: string;
    status: "queued" | "running" | "completed" | "failed" | "cancel_requested";
    errorMessage?: string | null;
    errorMetadata?: JsonValue | null;
  }): Promise<AgentRunRecord | null> {
    const now = new Date();
    const [run] = await this.db
      .update(agentRuns)
      .set({
        status: input.status,
        errorMessage: input.errorMessage,
        errorMetadata: input.errorMetadata,
        startedAt: input.status === "running" ? now : undefined,
        completedAt:
          input.status === "completed" ||
          input.status === "failed" ||
          input.status === "cancel_requested"
            ? now
            : undefined,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, input.runId))
      .returning();

    return run ?? null;
  }
}
