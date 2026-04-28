"use client";

import * as React from "react";

import { BlockSelectionPlugin } from "@platejs/selection/react";
import type { Value } from "platejs";
import { normalizeNodeId } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, EditorContainer } from "@/components/ui/editor";
import { FixedToolbarButtons } from "@/components/ui/fixed-toolbar-buttons";
import { FixedToolbar } from "@/features/journal/editor/components/fixed-toolbar";
import { EditorKit } from "@/features/journal/editor/editor/editor-kit";
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

function getNodeText(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  if ("text" in node && typeof node.text === "string") {
    return node.text;
  }

  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map(getNodeText).join("");
  }

  return "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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

  const selectWholeDocument = React.useCallback(() => {
    const anchor = editor.api.start([]);
    const focus = editor.api.end([]);

    if (!anchor || !focus) return false;

    editor.tf.select({ anchor, focus });

    const blockIds: string[] = [];

    for (const [node] of editor.api.blocks({ mode: "highest" })) {
      const id = (node as { id?: unknown }).id;

      if (typeof id === "string") {
        blockIds.push(id);
      }
    }

    if (blockIds.length > 0) {
      editor.getApi(BlockSelectionPlugin).blockSelection.set(blockIds);
    }

    return true;
  }, [editor]);

  const copySelectedBlocks = React.useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const selectedBlocks = editor
        .getApi(BlockSelectionPlugin)
        .blockSelection.getNodes({ sort: true });

      if (selectedBlocks.length === 0) return false;

      const fragment = selectedBlocks.map(([node]) => node);
      const encodedFragment = window.btoa(
        encodeURIComponent(JSON.stringify(fragment)),
      );
      const plainText = fragment.map(getNodeText).join("\n");
      const html = `<div data-slate-fragment="${encodedFragment}">${escapeHtml(plainText).replaceAll("\n", "<br>")}</div>`;

      event.preventDefault();
      event.clipboardData.setData(
        "application/x-slate-fragment",
        encodedFragment,
      );
      event.clipboardData.setData("text/plain", plainText);
      event.clipboardData.setData("text/html", html);

      return true;
    },
    [editor],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-clip">
      <DndProvider backend={HTML5Backend}>
        <Plate editor={editor} onValueChange={onValueChange}>
          {/* <FixedToolbar>
            <FixedToolbarButtons />
          </FixedToolbar> */}
          {header}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip">
            <EditorContainer
              className={cn(
                "min-h-0 min-w-0 flex-1 overflow-x-hidden",
                containerClassName,
              )}
            >
              <Editor
                className={cn(
                  "min-h-[400px] overflow-x-hidden bg-transparent px-6 pt-8 pb-32 text-base leading-relaxed md:px-12.5 md:pb-36 lg:pb-40",
                  editorClassName,
                )}
                placeholder={placeholder}
                onCopy={copySelectedBlocks}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key.toLowerCase() === "a"
                  ) {
                    event.preventDefault();
                    return selectWholeDocument();
                  }
                }}
                variant="default"
              />
            </EditorContainer>
          </div>
        </Plate>
      </DndProvider>
    </div>
  );
}
