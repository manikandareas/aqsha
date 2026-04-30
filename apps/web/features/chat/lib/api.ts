import { api } from "@/lib/eden";
import type { ChatThread } from "./types";

export async function createChatThread(): Promise<ChatThread> {
  const response = await api.chat.threads.post({});

  if (response.error || !response.data) {
    throw new Error("Unable to create chat thread");
  }

  return response.data;
}
