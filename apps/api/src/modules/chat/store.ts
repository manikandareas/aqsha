import type { UIMessage } from "ai";
import type { ChatModel } from "./model";

export type ChatThread = ChatModel["chatThread"];
export type ChatMessage = ChatModel["chatMessage"];

export interface ChatScope {
  userId: string;
  workspaceId: string;
}

export interface CreateChatThreadInput extends ChatScope {
  model: string | null;
}

export interface ChatStore {
  getScope(authUserId: string): Promise<ChatScope | null>;
  listThreads(scope: ChatScope): Promise<ChatThread[]>;
  createThread(input: CreateChatThreadInput): Promise<ChatThread>;
  getThread(scope: ChatScope, threadId: string): Promise<ChatThread | null>;
  getMessages(scope: ChatScope, threadId: string): Promise<ChatMessage[]>;
  appendMessage(
    scope: ChatScope,
    message: Omit<ChatMessage, "createdAt"> & { createdAt?: string },
  ): Promise<ChatMessage | null>;
  upsertMessages(
    scope: ChatScope,
    threadId: string,
    messages: UIMessage[],
  ): Promise<ChatMessage[] | null>;
  updateThread(
    scope: ChatScope,
    threadId: string,
    patch: Partial<Pick<ChatThread, "title" | "updatedAt">> & {
      lastMessageAt?: string | null;
    },
  ): Promise<ChatThread | null>;
  deleteThread(scope: ChatScope, threadId: string): Promise<boolean>;
}
