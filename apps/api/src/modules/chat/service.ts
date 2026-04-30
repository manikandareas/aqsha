import { generateId, type UIMessage } from "ai";
import type { AuthIdentity } from "../../plugins/auth-identity";
import type { ChatModel } from "./model";
import type { ChatMessage, ChatStore } from "./store";

type ServiceError = "unauthorized" | "chat_thread_not_found";
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };


export class ChatService {
  constructor(private readonly store: ChatStore) {}

  async listThreads(
    identity: AuthIdentity,
  ): Promise<ServiceResult<ChatModel["chatThread"][]>> {
    return {
      success: true,
      data: await this.store.listThreads(identity.authUserId),
    };
  }

  async createThread(
    identity: AuthIdentity,
    input: ChatModel["createThreadBody"],
  ): Promise<ServiceResult<ChatModel["chatThread"]>> {
    return {
      success: true,
      data: await this.store.createThread({
        userId: identity.authUserId,
        model: input.model ?? null,
      }),
    };
  }

  async getThread(
    identity: AuthIdentity,
    threadId: string,
  ): Promise<ServiceResult<ChatModel["chatThreadDetail"]>> {
    const thread = await this.store.getThread(identity.authUserId, threadId);

    if (!thread) {
      return { success: false, error: "chat_thread_not_found" };
    }

    return {
      success: true,
      data: {
        thread,
        messages: (await this.store.getMessages(identity.authUserId, threadId)) ?? [],
      },
    };
  }

  async deleteThread(
    identity: AuthIdentity,
    threadId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    const deleted = await this.store.deleteThread(identity.authUserId, threadId);

    if (!deleted) {
      return { success: false, error: "chat_thread_not_found" };
    }

    return { success: true, data: { ok: true } };
  }

  async appendUserMessage(
    identity: AuthIdentity,
    threadId: string,
    message: ChatModel["sendMessageBody"]["message"],
  ): Promise<ServiceResult<UIMessage[]>> {
    const thread = await this.store.getThread(identity.authUserId, threadId);

    if (!thread) {
      return { success: false, error: "chat_thread_not_found" };
    }

    const userMessage = await this.store.appendMessage(identity.authUserId, {
      id: message.id ?? generateId(),
      threadId,
      role: "user",
      parts: message.parts,
    });

    if (!userMessage) {
      return { success: false, error: "chat_thread_not_found" };
    }

    const messages = (await this.store.getMessages(identity.authUserId, threadId)) ?? [];
    await this.store.updateThread(identity.authUserId, threadId, {
      title: this.titleForThread(thread.title, messages),
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      data: messages.map((storedMessage) => this.toUIMessage(storedMessage)),
    };
  }

  async saveFinishedMessages(
    identity: AuthIdentity,
    threadId: string,
    messages: UIMessage[],
  ): Promise<void> {
    const storedMessages: ChatMessage[] = messages
      .filter((message) =>
        message.role === "user" || message.role === "assistant" || message.role === "system",
      )
      .map((message) => ({
        id: message.id,
        threadId,
        role: message.role,
        parts: message.parts,
        createdAt: new Date().toISOString(),
      }));

    await this.store.replaceMessages(identity.authUserId, threadId, storedMessages);

    const thread = await this.store.getThread(identity.authUserId, threadId);

    if (!thread) {
      return;
    }

    await this.store.updateThread(identity.authUserId, threadId, {
      title: this.titleForThread(thread.title, storedMessages),
      updatedAt: new Date().toISOString(),
    });
  }

  getModel(thread: ChatModel["chatThread"]): string | null {
    return thread.model;
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
