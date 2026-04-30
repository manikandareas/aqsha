import { generateId } from "ai";
import type { ChatModel } from "./model";

export type ChatThread = ChatModel["chatThread"];
export type ChatMessage = ChatModel["chatMessage"];

export interface ChatStore {
  listThreads(userId: string): Promise<ChatThread[]>;
  createThread(input: { userId: string; model: string | null }): Promise<ChatThread>;
  getThread(userId: string, threadId: string): Promise<ChatThread | null>;
  getMessages(userId: string, threadId: string): Promise<ChatMessage[] | null>;
  appendMessage(userId: string, message: Omit<ChatMessage, "createdAt"> & { createdAt?: string }): Promise<ChatMessage | null>;
  replaceMessages(userId: string, threadId: string, messages: ChatMessage[]): Promise<ChatMessage[] | null>;
  updateThread(userId: string, threadId: string, patch: Partial<Pick<ChatThread, "title" | "updatedAt">>): Promise<ChatThread | null>;
  deleteThread(userId: string, threadId: string): Promise<boolean>;
}

export class InMemoryChatStore implements ChatStore {
  private readonly threadsById = new Map<string, ChatThread>();
  private readonly messagesByThreadId = new Map<string, ChatMessage[]>();

  async listThreads(userId: string): Promise<ChatThread[]> {
    return Array.from(this.threadsById.values())
      .filter((thread) => thread.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createThread(input: { userId: string; model: string | null }): Promise<ChatThread> {
    const now = new Date().toISOString();
    const thread: ChatThread = {
      id: generateId(),
      userId: input.userId,
      title: "New chat",
      model: input.model,
      createdAt: now,
      updatedAt: now,
    };

    this.threadsById.set(thread.id, thread);
    this.messagesByThreadId.set(thread.id, []);

    return thread;
  }

  async getThread(userId: string, threadId: string): Promise<ChatThread | null> {
    const thread = this.threadsById.get(threadId);

    if (!thread || thread.userId !== userId) {
      return null;
    }

    return thread;
  }

  async getMessages(userId: string, threadId: string): Promise<ChatMessage[] | null> {
    const thread = await this.getThread(userId, threadId);

    if (!thread) {
      return null;
    }

    return this.messagesByThreadId.get(threadId) ?? [];
  }

  async appendMessage(
    userId: string,
    message: Omit<ChatMessage, "createdAt"> & { createdAt?: string },
  ): Promise<ChatMessage | null> {
    const thread = await this.getThread(userId, message.threadId);

    if (!thread) {
      return null;
    }

    const storedMessage: ChatMessage = {
      ...message,
      createdAt: message.createdAt ?? new Date().toISOString(),
    };
    const messages = this.messagesByThreadId.get(message.threadId) ?? [];

    messages.push(storedMessage);
    this.messagesByThreadId.set(message.threadId, messages);

    return storedMessage;
  }

  async replaceMessages(
    userId: string,
    threadId: string,
    messages: ChatMessage[],
  ): Promise<ChatMessage[] | null> {
    const thread = await this.getThread(userId, threadId);

    if (!thread) {
      return null;
    }

    this.messagesByThreadId.set(threadId, messages);
    return messages;
  }

  async updateThread(
    userId: string,
    threadId: string,
    patch: Partial<Pick<ChatThread, "title" | "updatedAt">>,
  ): Promise<ChatThread | null> {
    const thread = await this.getThread(userId, threadId);

    if (!thread) {
      return null;
    }

    const nextThread = {
      ...thread,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };

    this.threadsById.set(threadId, nextThread);

    return nextThread;
  }

  async deleteThread(userId: string, threadId: string): Promise<boolean> {
    const thread = await this.getThread(userId, threadId);

    if (!thread) {
      return false;
    }

    this.threadsById.delete(threadId);
    this.messagesByThreadId.delete(threadId);

    return true;
  }
}
