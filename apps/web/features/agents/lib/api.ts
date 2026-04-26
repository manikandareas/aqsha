"use client";

import { getApiBaseUrl } from "@/lib/api-url";
import {
  extractAssistantContent,
  getAgentErrorMessage,
  normalizeAgentEvent,
  normalizeAgentThread,
  normalizeAgentThreadDetail,
} from "@/features/agents/lib/normalizers";
import { readAgentEventStream } from "@/features/agents/lib/sse";
import type {
  AgentDepthMode,
  AgentEvent,
  AgentThread,
  AgentThreadDetail,
} from "@/features/agents/lib/types";

const baseUrl = () => getApiBaseUrl().replace(/\/$/, "");

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function listAgentThreads(): Promise<AgentThread[]> {
  const response = await fetch(`${baseUrl()}/agents/threads`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(getAgentErrorMessage(payload, "Unable to load threads."));
  }

  return Array.isArray(payload) ? payload.map(normalizeAgentThread) : [];
}

export async function createAgentThread(input: {
  title: string;
  depthMode?: AgentDepthMode;
}): Promise<AgentThread> {
  const response = await fetch(`${baseUrl()}/agents/threads`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(getAgentErrorMessage(payload, "Unable to create thread."));
  }

  return normalizeAgentThread(payload);
}

export async function deleteAgentThread(threadId: string): Promise<void> {
  const response = await fetch(`${baseUrl()}/agents/threads/${threadId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(getAgentErrorMessage(payload, "Unable to delete thread."));
  }
}

export async function getAgentThreadDetail(
  threadId: string,
): Promise<AgentThreadDetail> {
  const response = await fetch(`${baseUrl()}/agents/threads/${threadId}`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(getAgentErrorMessage(payload, "Unable to load thread."));
  }

  return normalizeAgentThreadDetail(payload);
}

export async function streamAgentMessage(input: {
  threadId: string;
  content: string;
  depthMode: AgentDepthMode;
  onEvent: (event: AgentEvent) => void;
  onAssistantMessage: (content: string) => void;
}): Promise<void> {
  const response = await fetch(
    `${baseUrl()}/agents/threads/${input.threadId}/messages`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: input.content,
        depthMode: input.depthMode,
      }),
    },
  );

  if (!response.ok || !response.body) {
    const payload = await readJson(response);
    const message =
      response.status === 409
        ? "An agent run is already active for this thread."
        : getAgentErrorMessage(payload, "Unable to stream agent response.");
    const error = new Error(message);
    error.name = response.status === 409 ? "AgentSessionBusyError" : "AgentApiError";
    throw error;
  }

  for await (const frame of readAgentEventStream(response.body)) {
    if (frame.event !== "agent.event") {
      continue;
    }

    const event = normalizeAgentEvent(frame.data);
    input.onEvent(event);

    if (event.type === "assistant.message.completed") {
      const content = extractAssistantContent(event.data);

      if (content) {
        input.onAssistantMessage(content);
      }
    }
  }
}
