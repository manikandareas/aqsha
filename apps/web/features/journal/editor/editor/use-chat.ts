"use client";

import { useChat as useBaseChat, type UseChatHelpers } from "@ai-sdk/react";
import { AIChatPlugin } from "@platejs/ai/react";
import { DefaultChatTransport } from "ai";
import * as React from "react";
import { useEditorRef } from "platejs/react";

import type { ChatMessage, ToolName } from "@/features/journal/editor/editor/chat-types";

export type { ChatMessage, ToolName } from "@/features/journal/editor/editor/chat-types";

type AIChatOptions = {
  chatOptions?: { api?: string; body?: Record<string, unknown> };
};

function chatStateSignature(chat: {
  status: string;
  error: Error | undefined;
  messages: ChatMessage[];
}): string {
  const msgParts = chat.messages.map((m, i) => {
    const text =
      m.parts
        ?.filter(
          (p): p is { type: "text"; text: string } => p.type === "text"
        )
        .map((p) => p.text)
        .join("") ?? "";
    return `${m.id ?? i}:${m.role}:${text.length}:${text.slice(-96)}`;
  });
  return [
    chat.status,
    chat.error?.message ?? "",
    String(chat.messages.length),
    ...msgParts,
  ].join("\u001f");
}

export const useChat = () => {
  const editor = useEditorRef();
  const baseChatRef = React.useRef<UseChatHelpers<ChatMessage> | null>(null);

  const baseChat = useBaseChat<ChatMessage>({
    id: "editor",
    transport: new DefaultChatTransport({
      api:
        (editor.getOptions(AIChatPlugin) as AIChatOptions).chatOptions?.api ??
        "/api/ai/command",
      fetch: async (input, init) => {
        const bodyOptions = (editor.getOptions(AIChatPlugin) as AIChatOptions)
          .chatOptions?.body;
        const initBody = JSON.parse((init?.body as string) ?? "{}");
        const body = {
          ...initBody,
          ...bodyOptions,
        };
        return fetch(input, {
          ...init,
          body: JSON.stringify(body),
        });
      },
    }),
    onData: (data: { type: string; data?: unknown }) => {
      if (data.type === "data-toolName" && data.data) {
        editor.setOption(AIChatPlugin, "toolName", data.data as ToolName);
      }
    },
    experimental_throttle: 100
  });

  baseChatRef.current = baseChat;

  const chatSyncKey = React.useMemo(
    () =>
      chatStateSignature({
        status: baseChat.status,
        error: baseChat.error,
        messages: baseChat.messages,
      }),
    [baseChat.status, baseChat.error, baseChat.messages]
  );

  React.useEffect(() => {
    editor.setOption(AIChatPlugin, "chat", baseChatRef.current as never);
  }, [editor, chatSyncKey]);

  return baseChat;
};
