"use client";

import * as React from "react";

import { normalizeNodeId } from "platejs";
import type { Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

import { EditorKit } from "@/features/journal/editor/editor/editor-kit";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { cn } from "@/lib/utils";

const defaultPlaygroundValue: Value = normalizeNodeId([
  {
    children: [{ text: "Plate AI editor" }],
    type: "h1",
  },
  {
    children: [
      {
        text: "Press ",
      },
      { kbd: true, text: "Cmd+J" },
      {
        text: " for AI commands, or ",
      },
      { kbd: true, text: "Ctrl+Space" },
      {
        text: " for inline copilot suggestions.",
      },
    ],
    type: "p",
  },
  {
    children: [
      {
        text: "Select this sentence and ask AI to improve, shorten, or simplify it.",
      },
    ],
    type: "p",
  },
  {
    children: [{ text: "" }],
    type: "p",
  },
]);

export type PlateAiEditorProps = {
  /** When omitted, uses the built-in playground demo content. */
  initialValue?: Value;
  /** Remount editor when switching documents; defaults to `plate-ai`. */
  editorId?: string;
  containerClassName?: string;
  editorClassName?: string;
  placeholder?: string;
  /** Renders above the scroll area (e.g. workspace document title). */
  header?: React.ReactNode;
  onValueChange?: (payload: {
    editor: NonNullable<ReturnType<typeof usePlateEditor>>;
    value: Value;
  }) => void;
};

export function PlateAiEditor({
  initialValue,
  editorId = "plate-ai",
  containerClassName,
  editorClassName,
  placeholder = "Start writing...",
  header,
  onValueChange,
}: PlateAiEditorProps) {
  const value = initialValue ?? defaultPlaygroundValue;

  const editor = usePlateEditor(
    {
      id: editorId,
      plugins: EditorKit,
      value,
    },
    [editorId],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      {header}
      <Plate editor={editor} onValueChange={onValueChange}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <EditorContainer
            className={cn("min-h-0 min-w-0 flex-1 overflow-x-hidden", containerClassName)}
          >
            <Editor
              className={cn(
                "min-h-[400px] overflow-x-hidden bg-transparent px-6 pt-8 pb-32 text-base leading-relaxed md:px-12 md:pb-36 lg:px-24 lg:pb-40",
                editorClassName,
              )}
              placeholder={placeholder}
              variant="default"
            />
          </EditorContainer>
        </div>
      </Plate>
    </div>
  );
}
