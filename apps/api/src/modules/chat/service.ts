import { generateId, type UIMessage } from "ai";
import type { AuthIdentity } from "../../plugins/auth-identity";
import type { ChatModel } from "./model";
import type {
  AgentRun,
  AppendChatSourceInput,
  AppendAgentEventInput,
  ChatMessage,
  ChatScope,
  ChatStore,
  FinishAgentRunInput,
} from "./store";
import type { UserService } from "../users/service";
import type { CancellationBoundaries } from "./cancellation";

type ServiceError =
  | "unauthorized"
  | "chat_thread_not_found"
  | "agent_run_active"
  | "agent_run_not_found";
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

export class ChatService {
  constructor(
    private readonly store: ChatStore,
    private readonly userService: UserService,
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
        sources: await this.store.getSources(scope, threadId),
      },
    };
  }

  async requestRunCancellation(
    identity: AuthIdentity,
    threadId: string,
    runId: string,
  ): Promise<ServiceResult<AgentRun>> {
    const scope = await this.getScope(identity);

    if (!scope) {
      return { success: false, error: "unauthorized" };
    }

    const thread = await this.store.getThread(scope, threadId);

    if (!thread) {
      return { success: false, error: "chat_thread_not_found" };
    }

    const run = await this.store.requestRunCancellation(scope, threadId, runId);

    if (!run) {
      return { success: false, error: "agent_run_not_found" };
    }

    if (run.status === "cancel_requested") {
      await this.appendRunEventOnce(scope, run, "run_cancel_requested", {
        type: "run_cancel_requested",
        scope: "run",
        status: "running",
        title: "Run cancellation requested",
        summary:
          "Cancellation was requested and the run is stopping at the next safe boundary.",
        agentName: "Astra",
        payload: {
          runId: run.id,
          status: run.status,
        },
      });
    }

    return { success: true, data: run };
  }

  async completeRunCancellation(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    boundaries: CancellationBoundaries,
  ): Promise<void> {
    await this.recordRunCancellationPropagation(scope, run, boundaries);
    await this.markRunCanceled(scope, run);
  }

  async recordRunCancellationPropagation(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    boundaries: CancellationBoundaries,
  ): Promise<void> {
    await this.appendRunEventOnce(scope, run, "run_cancellation_propagated", {
      type: "run_cancellation_propagated",
      scope: "run",
      status: "completed",
      title: "Run cancellation propagated",
      summary: "Cancellation reached the active run boundaries.",
      agentName: "Astra",
      payload: {
        runId: run.id,
        boundaries,
      },
    });
  }

  async markRunCanceled(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
  ): Promise<void> {
    if (await this.hasRunEvent(scope, run, "run_canceled")) {
      return;
    }

    await this.finishRun(scope, run.id, {
      status: "canceled",
      errorMessage: null,
    });
    await this.appendRunEvent(scope, run, {
      sequence: await this.nextRunEventSequence(scope, run),
      type: "run_canceled",
      scope: "run",
      status: "completed",
      title: "Run canceled",
      summary: "The Deep Research Run was canceled.",
      agentName: "Astra",
      payload: {
        runId: run.id,
        status: "canceled",
      },
    });
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

    const latestRun = await this.store.getLatestRun(scope, threadId);

    if (latestRun && this.isActiveRun(latestRun)) {
      return { success: false, error: "agent_run_active" };
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

    const latestRun = await this.store.getLatestRun(scope, threadId);

    if (latestRun && this.isActiveRun(latestRun)) {
      return { success: false, error: "agent_run_active" };
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

  async appendRunEvents(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    events: Omit<AppendAgentEventInput, "sequence">[],
  ): Promise<void> {
    for (const event of events) {
      await this.appendRunEvent(scope, run, {
        ...event,
        sequence: await this.nextRunEventSequence(scope, run),
      });
    }
  }

  async appendRunSource(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    source: AppendChatSourceInput,
  ): Promise<void> {
    const sourceKey = this.sourceKeyForSource(source);

    if (!sourceKey) {
      return;
    }

    await this.store.upsertSource(scope, {
      ...source,
      chatThreadId: run.chatThreadId,
      runId: run.id,
      sourceKey,
    });
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
    const user = await this.userService.getByAuthUserId(identity.authUserId);

    if (!user) {
      return null;
    }

    return {
      userId: user.id,
    };
  }

  private isActiveRun(run: AgentRun): boolean {
    return run.status === "queued" || run.status === "running" || run.status === "cancel_requested";
  }

  private async nextRunEventSequence(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
  ): Promise<number> {
    const events = await this.store.getEvents(scope, run.chatThreadId);
    const maxSequence = events
      .filter((event) => event.runId === run.id)
      .reduce((max, event) => Math.max(max, event.sequence), 0);

    return maxSequence + 1;
  }

  private async appendRunEventOnce(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    type: string,
    event: Omit<AppendAgentEventInput, "sequence">,
  ): Promise<void> {
    if (await this.hasRunEvent(scope, run, type)) {
      return;
    }

    await this.appendRunEvent(scope, run, {
      ...event,
      sequence: await this.nextRunEventSequence(scope, run),
    });
  }

  private async hasRunEvent(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    type: string,
  ): Promise<boolean> {
    const events = await this.store.getEvents(scope, run.chatThreadId);

    return events.some((event) => event.runId === run.id && event.type === type);
  }

  private toUIMessage(message: ChatMessage): UIMessage {
    return {
      id: message.id,
      role: message.role,
      parts: message.parts as UIMessage["parts"],
    };
  }

  private sourceKeyForSource(source: AppendChatSourceInput): string | null {
    if (source.kind === "url") {
      const normalizedUrl = this.normalizeUrl(source.url);

      return normalizedUrl ? `url:${normalizedUrl}` : null;
    }

    const documentKey =
      source.providerSourceId?.trim() ||
      [source.filename?.trim(), source.mediaType?.trim()]
        .filter(Boolean)
        .join(":");

    return documentKey ? `document:${documentKey}` : null;
  }

  private normalizeUrl(value: string | null | undefined): string | null {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    try {
      const url = new URL(trimmed);
      url.hash = "";

      return url.toString();
    } catch {
      return trimmed;
    }
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
