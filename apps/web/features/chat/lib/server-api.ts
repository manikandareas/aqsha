import "server-only";

import { createServerApiClient } from "@/lib/server-eden";
import type { ChatThread, ChatThreadDetail } from "./types";

export async function listChatThreads(): Promise<ChatThread[]> {
  const client = await createServerApiClient();
  const response = await client.chat.threads.get();

  if (response.error || !response.data) {
    return [];
  }

  return response.data;
}

export async function getChatThread(id: string): Promise<ChatThreadDetail | null> {
  const client = await createServerApiClient();
  const response = await client.chat.threads({ id }).get();

  if (response.error || !response.data) {
    return null;
  }

  return response.data as ChatThreadDetail;
}
