"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { ThreadPromptInput } from "@/features/agents/components/thread-prompt-input";
import { createAgentThread } from "@/features/agents/lib/api";
import type { AgentDepthMode } from "@/features/agents/lib/types";

const pendingPromptKey = (threadId: string) => `aqsha:agent-thread:${threadId}:prompt`;

export function getPendingPromptStorageKey(threadId: string): string {
  return pendingPromptKey(threadId);
}

function titleFromPrompt(prompt: string): string {
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, 80);
  return title || "New chat";
}

export function ThreadStartScreen() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(input: {
    content: string;
    depthMode: AgentDepthMode;
  }): Promise<void> {
    setError(null);

    try {
      const thread = await createAgentThread({
        title: titleFromPrompt(input.content),
        depthMode: input.depthMode,
      });

      sessionStorage.setItem(
        getPendingPromptStorageKey(thread.id),
        JSON.stringify(input),
      );
      window.dispatchEvent(new Event("agent-threads:changed"));
      const params = new URLSearchParams({
        prompt: input.content,
        depthMode: input.depthMode,
      });
      router.replace(`/app/threads/${thread.id}?${params.toString()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start thread.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pb-24">
      <div className="mb-8 space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Start a research thread
        </h1>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
          Ask one clear question. Aqsha will create a thread and stream the agent
          progress into the conversation.
        </p>
      </div>
      <ThreadPromptInput onSubmit={handleSubmit} />
      {error ? (
        <p className="mt-3 text-center text-sm text-destructive">{error}</p>
      ) : null}
    </main>
  );
}
