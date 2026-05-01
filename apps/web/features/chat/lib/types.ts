import type { UIMessage } from "ai";

export type ChatThread = {
  id: string;
  userId: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = UIMessage & {
  threadId?: string;
  createdAt?: string;
};

export type ChatThreadDetail = {
  thread: ChatThread;
  messages: ChatMessage[];
};
