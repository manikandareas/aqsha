"use client";

import type { AnyEditorPlugin } from "@platejs/core";
import { TrailingBlockPlugin, type Value } from "platejs";
import { type TPlateEditor, useEditorRef } from "platejs/react";

import { AIKit } from "@/features/journal/editor/editor/plugins/ai-kit";
import { AlignKit } from "@/features/journal/editor/editor/plugins/align-kit";
import { AutoformatKit } from "@/features/journal/editor/editor/plugins/autoformat-kit";
import { BasicNodesKit } from "@/features/journal/editor/editor/plugins/basic-nodes-kit";
import { BlockMenuKit } from "@/features/journal/editor/editor/plugins/block-menu-kit";
import { BlockPlaceholderKit } from "@/features/journal/editor/editor/plugins/block-placeholder-kit";
import { CalloutKit } from "@/features/journal/editor/editor/plugins/callout-kit";
import { CodeBlockKit } from "@/features/journal/editor/editor/plugins/code-block-kit";
import { CodeDrawingKit } from "@/features/journal/editor/editor/plugins/code-drawing-kit";
import { ColumnKit } from "@/features/journal/editor/editor/plugins/column-kit";
import { CommentKit } from "@/features/journal/editor/editor/plugins/comment-kit";
import { CopilotKit } from "@/features/journal/editor/editor/plugins/copilot-kit";
import { CursorOverlayKit } from "@/features/journal/editor/editor/plugins/cursor-overlay-kit";
import { DateKit } from "@/features/journal/editor/editor/plugins/date-kit";
import { DiscussionKit } from "@/features/journal/editor/editor/plugins/discussion-kit";
import { DndKit } from "@/features/journal/editor/editor/plugins/dnd-kit";
import { DocxExportKit } from "@/features/journal/editor/editor/plugins/docx-export-kit";
import { DocxKit } from "@/features/journal/editor/editor/plugins/docx-kit";
import { EmojiKit } from "@/features/journal/editor/editor/plugins/emoji-kit";
import { ExitBreakKit } from "@/features/journal/editor/editor/plugins/exit-break-kit";
import { ExcalidrawKit } from "@/features/journal/editor/editor/plugins/excalidraw-kit";
import { FindReplaceKit } from "@/features/journal/editor/editor/plugins/find-replace-kit";
import { FixedToolbarKit } from "@/features/journal/editor/editor/plugins/fixed-toolbar-kit";
import { FloatingToolbarKit } from "@/features/journal/editor/editor/plugins/floating-toolbar-kit";
import { FontKit } from "@/features/journal/editor/editor/plugins/font-kit";
import { LineHeightKit } from "@/features/journal/editor/editor/plugins/line-height-kit";
import { LinkKit } from "@/features/journal/editor/editor/plugins/link-kit";
import { ListKit } from "@/features/journal/editor/editor/plugins/list-kit";
import { MarkdownKit } from "@/features/journal/editor/editor/plugins/markdown-kit";
import { MathKit } from "@/features/journal/editor/editor/plugins/math-kit";
import { MediaKit } from "@/features/journal/editor/editor/plugins/media-kit";
import { MentionKit } from "@/features/journal/editor/editor/plugins/mention-kit";
import { SlashKit } from "@/features/journal/editor/editor/plugins/slash-kit";
import { SuggestionKit } from "@/features/journal/editor/editor/plugins/suggestion-kit";
import { TableKit } from "@/features/journal/editor/editor/plugins/table-kit";
import { TocKit } from "@/features/journal/editor/editor/plugins/toc-kit";
import { ToggleKit } from "@/features/journal/editor/editor/plugins/toggle-kit";

export const EditorKit = [
  ...BasicNodesKit,
  ...CodeBlockKit,
  ...TableKit,
  ...ToggleKit,
  ...TocKit,
  ...MediaKit,
  ...CalloutKit,
  ...ColumnKit,
  ...MathKit,
  ...DateKit,
  ...LinkKit,
  ...MentionKit,
  ...EmojiKit,
  ...ListKit,
  ...AlignKit,
  ...FontKit,
  ...LineHeightKit,
  ...MarkdownKit,
  ...CommentKit,
  ...SuggestionKit,
  ...DiscussionKit,
  ...CopilotKit,
  ...AIKit,
  ...BlockPlaceholderKit,
  ...CursorOverlayKit,
  ...SlashKit,
  ...CodeDrawingKit,
  ...ExcalidrawKit,
  ...AutoformatKit,
  ...ExitBreakKit,
  ...DocxKit,
  ...DocxExportKit,
  ...DndKit,
  TrailingBlockPlugin,
  ...FindReplaceKit,
  ...BlockMenuKit,
  ...FloatingToolbarKit,
  ...FixedToolbarKit,
] as AnyEditorPlugin[];

export type MyEditor = TPlateEditor<Value>;

export const useEditor = (): MyEditor => useEditorRef<MyEditor>();
