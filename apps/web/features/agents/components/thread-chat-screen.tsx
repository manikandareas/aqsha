"use client";

import * as React from "react";
import { SparklesIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { ThreadPromptInput } from "@/features/agents/components/thread-prompt-input";
import { getPendingPromptStorageKey } from "@/features/agents/components/thread-start-screen";
import { streamAgentMessage } from "@/features/agents/lib/api";
import type {
  AgentDepthMode,
  AgentEvent,
  AgentMessage,
  AgentThreadDetail,
} from "@/features/agents/lib/types";

type ThreadChatScreenProps = {
  initialDetail: AgentThreadDetail;
};

function isRunActive(status: AgentThreadDetail["latestRun"]): boolean {
  return status?.status === "queued" || status?.status === "running";
}

function eventDescription(event: AgentEvent): string {
  if (!event.data || typeof event.data !== "object") {
    return event.type;
  }

  const data = event.data as Record<string, unknown>;
  const message = data.message ?? data.content ?? data.query ?? data.depthMode;
  return typeof message === "string" ? message : event.type;
}

function eventKey(event: AgentEvent, index: number): string {
  return event.id || `${event.runId}-${event.sequence}-${index}`;
}

function createOptimisticMessage(input: {
  threadId: string;
  role: AgentMessage["role"];
  content: string;
}): AgentMessage {
  const now = new Date().toISOString();

  return {
    id: `local-${crypto.randomUUID()}`,
    threadId: input.threadId,
    workspaceId: "",
    userId: "",
    runId: null,
    role: input.role,
    content: input.content,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function ThreadChatScreen({ initialDetail }: ThreadChatScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = React.useState(initialDetail.messages);
  const [events, setEvents] = React.useState(initialDetail.events);
  const [isStreaming, setIsStreaming] = React.useState(
    isRunActive(initialDetail.latestRun),
  );
  const [error, setError] = React.useState<string | null>(null);
  const consumedPromptRef = React.useRef<string | null>(null);
  const thread = initialDetail.thread;

  const runEvents = React.useMemo(
    () => events.filter((event) => event.visibility === "public"),
    [events],
  );

  const submitPrompt = React.useCallback(
    async (input: { content: string; depthMode: AgentDepthMode }) => {
      setError(null);
      setIsStreaming(true);
      setMessages((current) => [
        ...current,
        createOptimisticMessage({
          threadId: thread.id,
          role: "user",
          content: input.content,
        }),
      ]);

      try {
        await streamAgentMessage({
          threadId: thread.id,
          content: input.content,
          depthMode: input.depthMode,
          onEvent: (event) => {
            setEvents((current) => {
              if (event.id && current.some((item) => item.id === event.id)) {
                return current;
              }

              return [...current, event];
            });
          },
          onAssistantMessage: (content) => {
            setMessages((current) => [
              ...current,
              createOptimisticMessage({
                threadId: thread.id,
                role: "assistant",
                content,
              }),
            ]);
          },
        });
        window.dispatchEvent(new Event("agent-threads:changed"));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to stream the agent response.",
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [thread.id],
  );

  React.useEffect(() => {
    const queryPrompt = searchParams.get("prompt");
    const queryDepthMode = searchParams.get("depthMode");

    if (queryPrompt?.trim()) {
      const promptKey = `${thread.id}:${queryPrompt}:${queryDepthMode ?? "standard"}`;

      if (consumedPromptRef.current === promptKey) {
        return;
      }

      const timeout = window.setTimeout(() => {
        consumedPromptRef.current = promptKey;
        router.replace(`/app/threads/${thread.id}`, { scroll: false });
        void submitPrompt({
          content: queryPrompt,
          depthMode: queryDepthMode === "deep" ? "deep" : "standard",
        });
      }, 0);

      return () => window.clearTimeout(timeout);
    }

    const key = getPendingPromptStorageKey(thread.id);
    const raw = sessionStorage.getItem(key);

    if (!raw) {
      return;
    }

    sessionStorage.removeItem(key);

    try {
      const input = JSON.parse(raw) as {
        content?: unknown;
        depthMode?: unknown;
      };

      if (typeof input.content === "string" && input.content.trim()) {
        window.setTimeout(() => {
          if (sessionStorage.getItem(key) !== raw) {
            return;
          }

          sessionStorage.removeItem(key);
          void submitPrompt({
            content: input.content as string,
            depthMode: input.depthMode === "deep" ? "deep" : "standard",
          });
        }, 0);
      }
    } catch {
      sessionStorage.removeItem(key);
      window.setTimeout(() => {
        setError("Unable to restore the pending prompt.");
      }, 0);
    }
  }, [router, searchParams, submitPrompt, thread.id]);

  return (
    <main className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pt-6">
      <Conversation className="pb-40">
        <ConversationContent className="px-0">
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.role === "assistant" ? (
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10">
                      <SparklesIcon className="size-3.5 text-primary" />
                    </span>
                    Aqsha
                  </div>
                ) : null}
                {message.role === "assistant" ? (
                  <MessageResponse>{message.content}</MessageResponse>
                ) : (
                  <span className="leading-relaxed">{message.content}</span>
                )}
              </MessageContent>
            </Message>
          ))}

          {runEvents.length > 0 ? (
            <Reasoning isStreaming={isStreaming} open={isStreaming}>
              <ReasoningTrigger isStreaming={isStreaming} />
              <ReasoningContent>
                <Task open>
                  <TaskTrigger title={`${runEvents.length} agent events`} />
                  <TaskContent>
                    {runEvents.slice(-12).map((event, index) => (
                      <TaskItem key={eventKey(event, index)}>
                        <span className="font-medium text-foreground">
                          {event.title}
                        </span>
                        <span className="ml-2">{eventDescription(event)}</span>
                      </TaskItem>
                    ))}
                  </TaskContent>
                </Task>
              </ReasoningContent>
            </Reasoning>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </ConversationContent>
      </Conversation>

      <div className="fixed bottom-6 left-1/2 z-20 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 md:left-[calc(50%+8rem)] md:w-[calc(100%-20rem)]">
        <ThreadPromptInput
          defaultDepthMode={thread.depthMode}
          disabled={isStreaming}
          placeholder={
            isStreaming ? "Agent is still running..." : "Ask a follow up..."
          }
          onSubmit={submitPrompt}
        />
      </div>
    </main>
  );
}
