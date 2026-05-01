import { generateId, type UIMessage } from "ai";
import type { AuthIdentity } from "../../plugins/auth-identity";
import type { ChatModel } from "./model";
import type {
  AgentRun,
  AppendAgentEventInput,
  ChatMessage,
  ChatScope,
  ChatStore,
  FinishAgentRunInput,
} from "./store";
import type { WorkspaceService } from "../workspaces/service";

type ServiceError = "unauthorized" | "chat_thread_not_found";
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };


export class ChatService {
  constructor(
    private readonly store: ChatStore,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async listThreads(
    identity: AuthIdentity,
  ): Promise<ServiceResult<ChatModel["chatThread"][]>> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return { success: false, error: "unauthorized" };
    }

    return {
      success: true,
      data: await this.store.listThreads(scope),
    };
  }

  async createThread(
    identity: AuthIdentity,
    input: ChatModel["createThreadBody"],
  ): Promise<ServiceResult<ChatModel["chatThread"]>> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return { success: false, error: "unauthorized" };
    }

    return {
      success: true,
      data: await this.store.createThread({
        ...scope,
        model: input.model ?? null,
      }),
    };
  }

  async getThread(
    identity: AuthIdentity,
    threadId: string,
  ): Promise<ServiceResult<ChatModel["chatThreadDetail"]>> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return { success: false, error: "unauthorized" };
    }

    const thread = await this.store.getThread(scope, threadId);

    if (!thread) {
      return { success: false, error: "chat_thread_not_found" };
    }

    return {
      success: true,
      data: {
        thread,
        messages: await this.store.getMessages(scope, threadId),
        latestRun: await this.store.getLatestRun(scope, threadId),
        events: await this.store.getEvents(scope, threadId),
      },
    };
  }

  async deleteThread(
    identity: AuthIdentity,
    threadId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return { success: false, error: "unauthorized" };
    }

    const deleted = await this.store.deleteThread(scope, threadId);

    if (!deleted) {
      return { success: false, error: "chat_thread_not_found" };
    }

    return { success: true, data: { ok: true } };
  }

  async appendUserMessage(
    identity: AuthIdentity,
    threadId: string,
    message: ChatModel["sendMessageBody"]["message"],
  ): Promise<ServiceResult<{ thread: ChatModel["chatThread"]; messages: UIMessage[] }>> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return { success: false, error: "unauthorized" };
    }

    const thread = await this.store.getThread(scope, threadId);

    if (!thread) {
      return { success: false, error: "chat_thread_not_found" };
    }

    const createdAt = new Date().toISOString();
    const userMessage = await this.store.appendMessage(scope, {
      id: message.id ?? generateId(),
      threadId,
      role: "user",
      parts: message.parts,
      createdAt,
    });

    if (!userMessage) {
      return { success: false, error: "chat_thread_not_found" };
    }

    const messages = await this.store.getMessages(scope, threadId);
    await this.store.updateThread(scope, threadId, {
      title: this.titleForThread(thread.title, messages),
      updatedAt: createdAt,
      lastMessageAt: createdAt,
    });

    return {
      success: true,
      data: {
        thread,
        messages: messages.map((storedMessage) => this.toUIMessage(storedMessage)),
      },
    };
  }

  async saveFinishedMessages(
    identity: AuthIdentity,
    threadId: string,
    messages: UIMessage[],
  ): Promise<void> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return;
    }

    const storedMessages = await this.store.upsertMessages(scope, threadId, messages);

    if (!storedMessages) {
      return;
    }

    const thread = await this.store.getThread(scope, threadId);

    if (!thread) {
      return;
    }

    const lastMessage = storedMessages.at(-1);
    await this.store.updateThread(scope, threadId, {
      title: this.titleForThread(thread.title, storedMessages),
      updatedAt: new Date().toISOString(),
      lastMessageAt: lastMessage?.createdAt ?? null,
    });
  }

  async createRun(
    identity: AuthIdentity,
    threadId: string,
    metadata?: unknown,
  ): Promise<ServiceResult<{ scope: ChatScope; run: AgentRun }>> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return { success: false, error: "unauthorized" };
    }

    const thread = await this.store.getThread(scope, threadId);

    if (!thread) {
      return { success: false, error: "chat_thread_not_found" };
    }

    return {
      success: true,
      data: {
        scope,
        run: await this.store.createRun({
          ...scope,
          chatThreadId: threadId,
          metadata,
        }),
      },
    };
  }

  async appendRunEvent(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    event: AppendAgentEventInput,
  ): Promise<void> {
    await this.store.appendEvent(scope, run, event);
  }

  async finishRun(
    scope: ChatScope,
    runId: string,
    input: FinishAgentRunInput,
  ): Promise<void> {
    await this.store.finishRun(scope, runId, input);
  }

  getModel(thread: ChatModel["chatThread"]): string | null {
    return thread.model;
  }

  private async getScope(identity: AuthIdentity): Promise<ChatScope | null> {
    const context = await this.workspaceService.getActiveWorkspaceContext(
      identity.authUserId,
    );

    if (!context) {
      return null;
    }

    return {
      userId: context.user.id,
      workspaceId: context.workspace.id,
    };
  }

  private toUIMessage(message: ChatMessage): UIMessage {
    return {
      id: message.id,
      role: message.role,
      parts: message.parts as UIMessage["parts"],
    };
  }

  private titleForThread(currentTitle: string, messages: Pick<ChatMessage, "role" | "parts">[]): string {
    if (currentTitle !== "New chat") {
      return currentTitle;
    }

    const firstUserText = messages
      .find((message) => message.role === "user")
      ?.parts.filter((part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part,
      )
      .map((part) => part.text)
      .join(" ")
      .trim();

    if (!firstUserText) {
      return currentTitle;
    }

    return firstUserText.length > 60 ? `${firstUserText.slice(0, 57)}...` : firstUserText;
  }
}
