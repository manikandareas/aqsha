"use client";

import { CopilotPlugin } from "@platejs/ai/react";
import type { AnyEditorPlugin } from "@platejs/core";
import { serializeMd, stripMarkdown } from "@platejs/markdown";
import type { TElement } from "platejs";

import { GhostText } from "@/components/ui/ghost-text";

export const CopilotKit = [
  CopilotPlugin.configure(({ api }) => ({
    options: {
      completeOptions: {
        api: "/api/ai/copilot",
        body: {
          system: `You are an advanced writing assistant. Continue the text naturally up to the next punctuation mark. Maintain tone and style. Do not repeat the given text. Do not start a new block. If there is not enough context, return an empty string.`,
        },
        onFinish: (_, completion) => {
          const trimmed = completion?.trim();
          if (!trimmed || trimmed === "0") return;

          api.copilot.setBlockSuggestion({
            text: stripMarkdown(trimmed),
          });
        },
      },
      debounceDelay: 3000,
      renderGhostText: GhostText,
      getPrompt: ({ editor }) => {
        const contextEntry = editor.api.block({ highest: true });

        if (!contextEntry) return "";

        const prompt = serializeMd(editor, {
          value: [contextEntry[0] as TElement],
        });

        return `Continue the text up to the next punctuation mark:\n"""\n${prompt}\n"""`;
      },
    },
    shortcuts: {
      accept: { keys: "tab" },
      acceptNextWord: { keys: "mod+right" },
      reject: { keys: "escape" },
      triggerSuggestion: { keys: "ctrl+space" },
    },
  })),
] as AnyEditorPlugin[];
