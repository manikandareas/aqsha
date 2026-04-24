import {
  BaseBasicBlocksPlugin,
  BaseBasicMarksPlugin,
} from "@platejs/basic-nodes";
import type { AnySlatePlugin } from "@platejs/core";
import { MarkdownPlugin, remarkMdx, remarkMention } from "@platejs/markdown";
import { BaseSuggestionPlugin } from "@platejs/suggestion";
import { KEYS } from "platejs";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/**
 * Plate base plugins for server-side slate editors (API routes, Mastra).
 * Kept aligned with client Markdown + suggestion behavior.
 */
export const BaseEditorKit = [
  BaseBasicBlocksPlugin,
  BaseBasicMarksPlugin,
  BaseSuggestionPlugin.configure({
    options: {
      currentUserId: "plate-ai",
    },
  }),
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion],
      remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
    },
  }),
] as AnySlatePlugin[];
