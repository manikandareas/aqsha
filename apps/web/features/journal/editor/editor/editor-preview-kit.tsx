"use client";

import type { AnyEditorPlugin } from "@platejs/core";

import { BasicNodesKit } from "@/features/journal/editor/editor/plugins/basic-nodes-kit";
import { MarkdownKit } from "@/features/journal/editor/editor/plugins/markdown-kit";

export const EditorPreviewKit = [
  ...BasicNodesKit,
  ...MarkdownKit,
] as AnyEditorPlugin[];
