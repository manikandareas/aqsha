'use client';

import * as React from 'react';

import type { Alignment } from '@platejs/basic-styles';
import { TextAlignPlugin } from '@platejs/basic-styles/react';
import { LineHeightPlugin } from '@platejs/basic-styles/react';
import { ListStyleType, toggleList } from '@platejs/list';
import {
  useIndentButton,
  useOutdentButton,
} from '@platejs/indent/react';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  CheckIcon,
  IndentIcon,
  LayoutTemplateIcon,
  List,
  ListCollapseIcon,
  ListOrdered,
  ListTodoIcon,
  OutdentIcon,
  WrapText,
} from 'lucide-react';
import { KEYS } from 'platejs';
import {
  useEditorPlugin,
  useEditorRef,
  useSelectionFragmentProp,
} from 'platejs/react';
import {
  useToggleToolbarButton,
  useToggleToolbarButtonState,
} from '@platejs/toggle/react';
import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';
import { DropdownMenuItemIndicator } from '@radix-ui/react-dropdown-menu';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ToolbarButton } from './toolbar';

const alignItems = [
  { icon: AlignLeftIcon, value: 'left' as const },
  { icon: AlignCenterIcon, value: 'center' as const },
  { icon: AlignRightIcon, value: 'right' as const },
  { icon: AlignJustifyIcon, value: 'justify' as const },
];

function IndentOutdentRow() {
  const { props: outdentProps } = useOutdentButton();
  const { props: indentProps } = useIndentButton();

  return (
    <div className="flex gap-1 px-2 py-1.5">
      <button
        className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-transparent hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          outdentProps.onClick();
        }}
        type="button"
      >
        <OutdentIcon className="size-4" />
      </button>
      <button
        className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-transparent hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          indentProps.onClick();
        }}
        type="button"
      >
        <IndentIcon className="size-4" />
      </button>
    </div>
  );
}

function ToggleCollapseMenuItem() {
  const state = useToggleToolbarButtonState();
  const { props: toggleProps } = useToggleToolbarButton(state);

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        toggleProps.onClick();
      }}
    >
      <ListCollapseIcon className="size-4" />
      Toggle section
    </DropdownMenuItem>
  );
}

export function LayoutToolbarMenu(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const { editor: alignEditor, tf: alignTf } = useEditorPlugin(TextAlignPlugin);
  const rawAlign =
    useSelectionFragmentProp({
      defaultValue: 'left',
      getProp: (node) => node.align,
    }) ?? 'left';
  const alignRadioValue = ['left', 'center', 'right', 'justify'].includes(
    rawAlign as string,
  )
    ? rawAlign
    : 'left';

  const { defaultNodeValue, validNodeValues: lineHeights = [] } =
    editor.getInjectProps(LineHeightPlugin);

  const lineHeightValue = useSelectionFragmentProp({
    defaultValue: defaultNodeValue,
    getProp: (node) => node.lineHeight,
  });

  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger
        render={
          <ToolbarButton pressed={open} tooltip="Layout & lists" isDropdown />
        }
      >
        <LayoutTemplateIcon className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar max-h-[min(80vh,520px)] min-w-[220px] overflow-y-auto"
      >
        <DropdownMenuLabel className="text-muted-foreground">
          Alignment
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={alignRadioValue}
          onValueChange={(value) => {
            alignTf.textAlign.setNodes(value as Alignment);
            alignEditor.tf.focus();
          }}
        >
          {alignItems.map(({ icon: Icon, value }) => (
            <DropdownMenuRadioItem
              key={value}
              className="pl-2 data-[state=checked]:bg-accent *:first:[span]:hidden"
              value={value}
            >
              <Icon className="size-4" />
              <span className="capitalize">{value}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-muted-foreground">
          Lists
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            toggleList(editor, { listStyleType: ListStyleType.Disc });
            editor.tf.focus();
          }}
        >
          <List className="size-4" />
          Bulleted list
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            toggleList(editor, { listStyleType: ListStyleType.Decimal });
            editor.tf.focus();
          }}
        >
          <ListOrdered className="size-4" />
          Numbered list
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            toggleList(editor, { listStyleType: KEYS.listTodo });
            editor.tf.focus();
          }}
        >
          <ListTodoIcon className="size-4" />
          To-do list
        </DropdownMenuItem>

        <ToggleCollapseMenuItem />

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-muted-foreground">
          Line height
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={lineHeightValue !== undefined ? String(lineHeightValue) : undefined}
          onValueChange={(newValue) => {
            editor
              .getTransforms(LineHeightPlugin)
              .lineHeight.setNodes(Number(newValue));
            editor.tf.focus();
          }}
        >
          {lineHeights.map((value) => (
            <DropdownMenuRadioItem
              key={value}
              className="min-w-[180px] pl-2 *:first:[span]:hidden"
              value={String(value)}
            >
              <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                <DropdownMenuItemIndicator>
                  <CheckIcon />
                </DropdownMenuItemIndicator>
              </span>
              <WrapText className="size-4 opacity-70" />
              {value}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-muted-foreground">
          Indentation
        </DropdownMenuLabel>
        <IndentOutdentRow />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
