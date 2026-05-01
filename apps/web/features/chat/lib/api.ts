import { api } from "@/lib/eden";
import type { ChatThread } from "./types";

export async function listChatThreads(): Promise<ChatThread[]> {
  const response = await api.chat.threads.get();

  if (response.error || !response.data) {
    throw new Error("Unable to load chat threads");
  }

  return response.data;
}

export async function createChatThread(): Promise<ChatThread> {
  const response = await api.chat.threads.post({});

  if (response.error || !response.data) {
    throw new Error("Unable to create chat thread");
  }

  return response.data;
}

export async function deleteChatThread(id: string): Promise<void> {
  const response = await api.chat.threads({ id }).delete();

  if (response.error) {
    throw new Error("Unable to delete chat thread");
  }
}
