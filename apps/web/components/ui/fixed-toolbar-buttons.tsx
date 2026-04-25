"use client";

import {
  BoldIcon,
  ItalicIcon,
  QuoteIcon,
  StrikethroughIcon,
  UnderlineIcon,
  WandSparklesIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorReadOnly, useEditorRef } from "platejs/react";

import { insertBlock } from "@/features/journal/editor/editor/transforms";

import { AIToolbarButton } from "./ai-toolbar-button";
import { AlignToolbarButton } from "./align-toolbar-button";
import { InlineEquationToolbarButton } from "./equation-toolbar-button";
import { RedoToolbarButton, UndoToolbarButton } from "./history-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { MediaToolbarButton } from "./media-toolbar-button";
import { MoreToolbarButton } from "./more-toolbar-button";
import { TableToolbarButton } from "./table-toolbar-button";
import { ToolbarButton, ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

function QuoteToolbarButton() {
  const editor = useEditorRef();
  return (
    <ToolbarButton
      tooltip="Quote"
      onClick={() => {
        insertBlock(editor, KEYS.blockquote);
        editor.tf.focus();
      }}
    >
      <QuoteIcon />
    </ToolbarButton>
  );
}

export function FixedToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center">
      {!readOnly && (
        <>
          <ToolbarGroup>
            <UndoToolbarButton />
            <RedoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <AIToolbarButton tooltip="AI commands">
              <WandSparklesIcon />
            </AIToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <TurnIntoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold">
              <BoldIcon />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic">
              <ItalicIcon />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline">
              <UnderlineIcon />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip="Strikethrough"
            >
              <StrikethroughIcon />
            </MarkToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <QuoteToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <AlignToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <TableToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <InlineEquationToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MediaToolbarButton nodeType={KEYS.img} />
          </ToolbarGroup>
        </>
      )}

      <ToolbarGroup>
        <MoreToolbarButton />
      </ToolbarGroup>
    </div>
  );
}
