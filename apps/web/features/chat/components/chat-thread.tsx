"use client";

import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon } from "lucide-react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";

import { MessageInput } from "@/features/chat/components/message-input";
import { MessageList } from "@/features/chat/components/message-list";
import type { AgentEvent, AgentRun } from "@/features/chat/lib/types";
import { pendingPromptKey } from "@/features/chat/lib/pending-prompt";
import { useChatScroll } from "@/features/chat/components/use-chat-scroll";
import { getApiBaseUrl } from "@/lib/api-url";
import { queryKeys } from "@/lib/react-query/keys";
import { toast } from "@/lib/toast";

function describeChatError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

const CHAT_UPDATE_THROTTLE_MS = 50;

function messagesSignature(messages: UIMessage[]) {
  return messages
    .map((message) => `${message.id}:${message.role}:${message.parts.length}`)
    .join("|");
}

export function ChatThread({
  id,
  initialEvents,
  initialLatestRun,
  initialMessages,
  onMessagesChange,
}: {
  id: string;
  initialEvents: AgentEvent[];
  initialLatestRun: AgentRun | null;
  initialMessages: UIMessage[];
  onMessagesChange?: (messages: UIMessage[]) => void;
}) {
  const queryClient = useQueryClient();
  const sentPendingPromptRef = useRef(false);
  const emittedMessagesSignatureRef = useRef("");
  const toastedErrorRef = useRef<unknown>(null);
  const { containerRef, isAtBottom, scrollToBottom } = useChatScroll(id);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${getApiBaseUrl()}/chat/threads/${id}/messages`,
        credentials: "include",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: messages[messages.length - 1],
          },
        }),
      }),
    [id],
  );
  const { messages, sendMessage, status, stop, error } = useChat({
    id,
    messages: initialMessages,
    transport,
    experimental_throttle: CHAT_UPDATE_THROTTLE_MS,
    onFinish: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.threads(),
      });
    },
  });

  useEffect(() => {
    if (!error || toastedErrorRef.current === error) {
      return;
    }

    toastedErrorRef.current = error;
    toast.error({
      title: "Could not send message",
      description: describeChatError(error),
    });
  }, [error]);

  useEffect(() => {
    if (sentPendingPromptRef.current || status !== "ready") {
      return;
    }

    const key = pendingPromptKey(id);
    const pendingPrompt = sessionStorage.getItem(key);

    if (!pendingPrompt) {
      return;
    }

    sentPendingPromptRef.current = true;
    sessionStorage.removeItem(key);
    void sendMessage({ text: pendingPrompt });
  }, [id, sendMessage, status]);

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    const signature = messagesSignature(messages);

    if (emittedMessagesSignatureRef.current === signature) {
      return;
    }

    emittedMessagesSignatureRef.current = signature;
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div
        ref={containerRef}
        className="absolute inset-0 touch-pan-y overflow-y-auto scroll-smooth bg-background"
      >
        <MessageList
          events={initialEvents}
          isStreaming={isStreaming}
          latestRun={initialLatestRun}
          messages={messages}
        />
      </div>

      <button
        type="button"
        aria-label="Scroll to bottom"
        onClick={() => scrollToBottom("smooth")}
        className={
          "absolute bottom-52 left-1/2 z-30 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-foreground text-background shadow-lg transition-all duration-200 hover:scale-105 hover:bg-foreground/90 " +
          (isAtBottom
            ? "pointer-events-none scale-90 opacity-0"
            : "pointer-events-auto scale-100 opacity-100")
        }
      >
        <ArrowDownIcon className="size-3" />
      </button>

      <div className="absolute inset-x-0 bottom-0 z-20 bg-background px-4 pb-6 pt-3 sm:px-6">
        {error ? (
          <div className="mx-auto mb-3 w-full max-w-[820px] rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {describeChatError(error)}
          </div>
        ) : null}
        <MessageInput
          disabled={status !== "ready"}
          isStreaming={isStreaming}
          onSend={(text) => void sendMessage({ text })}
          onStop={stop}
        />
      </div>
    </div>
  );
}
