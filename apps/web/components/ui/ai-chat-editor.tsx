"use client";

import { useAIChatEditor } from "@platejs/ai/react";
import { usePlateEditor } from "platejs/react";
import * as React from "react";

import { EditorPreviewKit } from "@/features/journal/editor/editor/editor-preview-kit";
import { EditorStatic } from "@/components/ui/editor-static";

export const AIChatEditor = React.memo(function AIChatEditor({
  content,
}: {
  content: string;
}) {
  const aiEditor = usePlateEditor({
    plugins: EditorPreviewKit,
  });

  useAIChatEditor(aiEditor, content);

  return <EditorStatic editor={aiEditor} variant="aiChat" />;
});
