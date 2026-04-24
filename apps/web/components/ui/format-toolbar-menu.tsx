'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import {
  ALargeSmall,
  BaselineIcon,
  BoldIcon,
  Code2Icon,
  EraserIcon,
  HighlighterIcon,
  ItalicIcon,
  PaintBucketIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import {
  ColorDropdownMenuItems,
  DEFAULT_COLORS,
} from '@/components/ui/font-color-toolbar-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ToolbarButton } from './toolbar';

export function FormatToolbarMenu(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const textColor = useEditorSelector(
    (ed) => ed.api.mark(KEYS.color) as string | undefined,
    []
  );
  const bgColor = useEditorSelector(
    (ed) => ed.api.mark(KEYS.backgroundColor) as string | undefined,
    []
  );

  const toggleMark = (key: string) => {
    editor.tf.toggleMark(key);
    editor.tf.collapse({ edge: 'end' });
    editor.tf.focus();
  };

  const applyColor = (nodeType: typeof KEYS.color | typeof KEYS.backgroundColor) => (value: string) => {
    if (editor.selection) {
      editor.tf.select(editor.selection);
      editor.tf.addMarks({ [nodeType]: value });
      editor.tf.focus();
    }
  };

  const clearMark = (nodeType: typeof KEYS.color | typeof KEYS.backgroundColor) => {
    if (editor.selection) {
      editor.tf.select(editor.selection);
      editor.tf.removeMarks(nodeType);
      editor.tf.focus();
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger
        render={
          <ToolbarButton pressed={open} tooltip="Text formatting" isDropdown />
        }
      >
        <ALargeSmall className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar max-h-[min(80vh,520px)] w-[min(100vw-2rem,260px)] overflow-y-auto"
      >
        <DropdownMenuItem
          onSelect={() => {
            toggleMark(KEYS.bold);
          }}
        >
          <BoldIcon />
          Bold
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            toggleMark(KEYS.italic);
          }}
        >
          <ItalicIcon />
          Italic
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            toggleMark(KEYS.underline);
          }}
        >
          <UnderlineIcon />
          Underline
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            toggleMark(KEYS.strikethrough);
          }}
        >
          <StrikethroughIcon />
          Strikethrough
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            toggleMark(KEYS.code);
          }}
        >
          <Code2Icon />
          Code
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            toggleMark(KEYS.highlight);
          }}
        >
          <HighlighterIcon />
          Highlight
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <BaselineIcon className="size-4" />
            Text color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="ignore-click-outside/toolbar w-[240px] p-2"
            sideOffset={4}
          >
            <ColorDropdownMenuItems
              color={textColor}
              colors={DEFAULT_COLORS}
              updateColor={applyColor(KEYS.color)}
            />
            {textColor ? (
              <DropdownMenuItem
                className="mt-1"
                onSelect={() => {
                  clearMark(KEYS.color);
                }}
              >
                <EraserIcon />
                Clear text color
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <PaintBucketIcon />
            Background color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="ignore-click-outside/toolbar w-[240px] p-2"
            sideOffset={4}
          >
            <ColorDropdownMenuItems
              color={bgColor}
              colors={DEFAULT_COLORS}
              updateColor={applyColor(KEYS.backgroundColor)}
            />
            {bgColor ? (
              <DropdownMenuItem
                className="mt-1"
                onSelect={() => {
                  clearMark(KEYS.backgroundColor);
                }}
              >
                <EraserIcon />
                Clear background
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
