import type {
  AgentEventRecord,
  AgentMessageRecord,
  AgentRunRecord,
  AgentThreadRecord,
  JsonValue,
} from "@aqsha/db";
import { env } from "../../config";
import type { AuthIdentity } from "../../plugins/auth-identity";
import type { AgentModel } from "./model";
import {
  AgentRepository,
  type AgentContext,
} from "./repository";

type ServiceError =
  | "unauthorized"
  | "workspace_not_found"
  | "agent_thread_not_found"
  | "agent_run_not_found"
  | "agent_session_busy";
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

interface InternalAgentEvent {
  type: string;
  status?: "pending" | "running" | "completed" | "failed";
  title?: string;
  visibility?: "public" | "internal";
  data?: JsonValue;
}

export class AgentService {
  constructor(private readonly repository: AgentRepository) {}

  async createThread(
    identity: AuthIdentity,
    input: AgentModel["createThreadBody"],
  ): Promise<ServiceResult<AgentModel["thread"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const thread = await this.repository.createThread({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      title: input.title?.trim() || "New chat",
      depthMode: input.depthMode ?? "standard",
    });

    return { success: true, data: this.toThread(thread) };
  }

  async listThreads(
    identity: AuthIdentity,
  ): Promise<ServiceResult<AgentModel["thread"][]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const threads = await this.repository.listThreads(context.workspace.id);
    return { success: true, data: threads.map((thread) => this.toThread(thread)) };
  }

  async getThread(
    identity: AuthIdentity,
    threadId: string,
  ): Promise<ServiceResult<AgentModel["threadDetail"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const thread = await this.repository.getThread(threadId, context.workspace.id);

    if (!thread) {
      return { success: false, error: "agent_thread_not_found" };
    }

    const [messages, latestRun, events] = await Promise.all([
      this.repository.listMessages(thread.id),
      this.repository.getLatestRun(thread.id),
      this.repository.listEventsByThread(thread.id),
    ]);

    return {
      success: true,
      data: {
        thread: this.toThread(thread),
        messages: messages.map((message) => this.toMessage(message)),
        latestRun: latestRun ? this.toRun(latestRun) : null,
        events: events.map((event) => this.toEvent(event)),
      },
    };
  }

  async archiveThread(
    identity: AuthIdentity,
    threadId: string,
  ): Promise<ServiceResult<AgentModel["thread"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const thread = await this.repository.archiveThread(threadId, context.workspace.id);

    if (!thread) {
      return { success: false, error: "agent_thread_not_found" };
    }

    return { success: true, data: this.toThread(thread) };
  }

  async createMessageRun(
    identity: AuthIdentity,
    threadId: string,
    input: AgentModel["createMessageBody"],
  ): Promise<
    ServiceResult<{
      run: AgentRunRecord;
      thread: AgentThreadRecord;
      userMessage: AgentMessageRecord;
      messageHistory: AgentMessageRecord[];
    }>
  > {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const thread = await this.repository.getThread(threadId, context.workspace.id);

    if (!thread) {
      return { success: false, error: "agent_thread_not_found" };
    }

    const result = await this.repository.createMessageRun({
      thread,
      userId: context.user.id,
      content: input.content,
      depthMode: input.depthMode ?? thread.depthMode,
    });

    if (result === "agent_session_busy") {
      return { success: false, error: result };
    }

    return { success: true, data: result };
  }

  async replayRunEvents(
    identity: AuthIdentity,
    runId: string,
  ): Promise<ServiceResult<AgentModel["event"][]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const run = await this.repository.getRun(runId, context.workspace.id);

    if (!run) {
      return { success: false, error: "agent_run_not_found" };
    }

    const events = await this.repository.listEventsByRun(run.id);
    return { success: true, data: events.map((event) => this.toEvent(event)) };
  }

  async cancelRun(
    identity: AuthIdentity,
    runId: string,
  ): Promise<ServiceResult<AgentModel["run"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const run = await this.repository.getRun(runId, context.workspace.id);

    if (!run) {
      return { success: false, error: "agent_run_not_found" };
    }

    const updated = await this.repository.updateRunStatus({
      runId,
      status: "cancel_requested",
    });

    return { success: true, data: this.toRun(updated ?? run) };
  }

  async *streamRun(input: {
    run: AgentRunRecord;
    thread: AgentThreadRecord;
    userMessage: AgentMessageRecord;
    messageHistory: AgentMessageRecord[];
  }): AsyncGenerator<string> {
    let sequence = 0;
    let assistantMessageSaved = false;

    const persistAndRender = async (event: InternalAgentEvent) => {
      sequence += 1;
      const stored = await this.repository.createEvent({
        runId: input.run.id,
        threadId: input.thread.id,
        workspaceId: input.thread.workspaceId,
        sequence,
        type: event.type,
        status: event.status ?? "running",
        title: event.title ?? event.type,
        visibility: event.visibility ?? "public",
        payload: event.data ?? null,
      });

      return this.renderSse("agent.event", this.toEvent(stored));
    };

    await this.repository.updateRunStatus({
      runId: input.run.id,
      status: "running",
    });
    yield await persistAndRender({
      type: "run.started",
      status: "running",
      title: "Run started",
      data: { depthMode: input.run.depthMode },
    });

    try {
      const response = await fetch(`${env.AGENTS_API_URL}/v1/chat/stream`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.AGENTS_API_TOKEN
            ? { authorization: `Bearer ${env.AGENTS_API_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          runId: input.run.id,
          threadId: input.thread.id,
          workspaceId: input.thread.workspaceId,
          userId: input.thread.userId,
          message: input.userMessage.content,
          depthMode: input.run.depthMode,
          messageHistory: input.messageHistory
            .filter((message) => message.id !== input.userMessage.id)
            .map((message) => ({
              role: message.role,
              content: message.content,
              timestamp: message.createdAt.toISOString(),
            })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Agents service returned ${response.status}`);
      }

      for await (const event of this.readInternalEvents(response.body)) {
        if (event.type === "run.started") {
          continue;
        }

        yield await persistAndRender(event);

        if (event.type === "assistant.message.completed" && !assistantMessageSaved) {
          const content = this.extractAssistantContent(event.data);

          if (content) {
            assistantMessageSaved = true;
            await this.repository.createAssistantMessage({
              threadId: input.thread.id,
              workspaceId: input.thread.workspaceId,
              userId: input.thread.userId,
              runId: input.run.id,
              content,
              metadata: event.data ?? undefined,
            });
          }
        }

        if (event.type === "run.completed") {
          await this.repository.updateRunStatus({
            runId: input.run.id,
            status: "completed",
          });
        }

        if (event.type === "run.failed") {
          await this.repository.updateRunStatus({
            runId: input.run.id,
            status: "failed",
            errorMessage: this.extractErrorMessage(event.data),
            errorMetadata: event.data,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent error";
      yield await persistAndRender({
        type: "run.failed",
        status: "failed",
        title: "Run failed",
        data: { message },
      });
      await this.repository.updateRunStatus({
        runId: input.run.id,
        status: "failed",
        errorMessage: message,
        errorMetadata: { message },
      });
    }
  }

  private async getContext(
    identity: AuthIdentity,
  ): Promise<AgentContext | "unauthorized" | "workspace_not_found"> {
    const result = await this.repository.getContextByAuthUserId(identity.authUserId);
    return result.success ? result.data : result.error;
  }

  private async *readInternalEvents(
    stream: ReadableStream<Uint8Array>,
  ): AsyncGenerator<InternalAgentEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (!data) {
          continue;
        }

        yield JSON.parse(data) as InternalAgentEvent;
      }
    }
  }

  private renderSse(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  private extractAssistantContent(data: JsonValue | undefined): string | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }

    const content = data.content ?? data.response ?? data.chat_response;
    return typeof content === "string" && content.trim() ? content : null;
  }

  private extractErrorMessage(data: JsonValue | undefined): string | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }

    return typeof data.message === "string" ? data.message : null;
  }

  private toThread(thread: AgentThreadRecord): AgentModel["thread"] {
    return {
      id: thread.id,
      workspaceId: thread.workspaceId,
      userId: thread.userId,
      title: thread.title,
      depthMode: thread.depthMode,
      status: thread.status,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    };
  }

  private toMessage(message: AgentMessageRecord): AgentModel["threadDetail"]["messages"][number] {
    return {
      id: message.id,
      threadId: message.threadId,
      workspaceId: message.workspaceId,
      userId: message.userId,
      runId: message.runId,
      role: message.role,
      content: message.content,
      metadata: message.metadata ?? null,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    };
  }

  private toRun(run: AgentRunRecord): AgentModel["run"] {
    return {
      id: run.id,
      threadId: run.threadId,
      workspaceId: run.workspaceId,
      userId: run.userId,
      status: run.status,
      depthMode: run.depthMode,
      errorMessage: run.errorMessage,
      errorMetadata: run.errorMetadata ?? null,
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private toEvent(event: AgentEventRecord): AgentModel["event"] {
    return {
      id: event.id,
      runId: event.runId,
      threadId: event.threadId,
      sequence: event.sequence,
      type: event.type,
      status: event.status,
      title: event.title,
      visibility: event.visibility,
      data: event.payload ?? null,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
