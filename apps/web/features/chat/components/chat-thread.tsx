"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { MessageInput } from "@/features/chat/components/message-input";
import { MessageList } from "@/features/chat/components/message-list";
import { pendingPromptKey } from "@/features/chat/lib/pending-prompt";
import { getApiBaseUrl } from "@/lib/api-url";

export function ChatThread({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const sentPendingPromptRef = useRef(false);
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
    onFinish: () => router.refresh(),
  });

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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f6f5f4]/35">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        <MessageList messages={messages} />
      </div>
      <div className="border-t border-border/70 bg-background/95 pt-4 shadow-[0_-12px_32px_rgba(0,0,0,0.03)] backdrop-blur">
        {error ? (
          <div className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive sm:px-6">
            Something went wrong. Please try again.
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
