'use client';

import { WandSparklesIcon } from 'lucide-react';
import { useEditorReadOnly } from 'platejs/react';

import { AIToolbarButton } from './ai-toolbar-button';
import { CommentToolbarButton } from './comment-toolbar-button';
import { FileToolbarMenu } from './file-toolbar-menu';
import { FontSizeToolbarButton } from './font-size-toolbar-button';
import { FormatToolbarMenu } from './format-toolbar-menu';
import { InsertToolbarButton } from './insert-toolbar-button';
import { LayoutToolbarMenu } from './layout-toolbar-menu';
import { ModeToolbarButton } from './mode-toolbar-button';
import { MoreToolbarButton } from './more-toolbar-button';
import { RedoToolbarButton, UndoToolbarButton } from './history-toolbar-button';
import { TableToolbarButton } from './table-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

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
            <FileToolbarMenu />
          </ToolbarGroup>

          <ToolbarGroup>
            <InsertToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <TurnIntoToolbarButton />
            <FontSizeToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <FormatToolbarMenu />
          </ToolbarGroup>

          <ToolbarGroup>
            <LayoutToolbarMenu />
          </ToolbarGroup>

          <ToolbarGroup>
            <TableToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MoreToolbarButton />
          </ToolbarGroup>
        </>
      )}

      <ToolbarGroup>
        <CommentToolbarButton />
      </ToolbarGroup>

      <ToolbarGroup>
        <ModeToolbarButton />
      </ToolbarGroup>
    </div>
  );
}
