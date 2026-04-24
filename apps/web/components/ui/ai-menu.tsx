"use client";

import {
  AIChatPlugin,
  AIPlugin,
  acceptAISuggestions,
  useEditorChat,
  useLastAssistantMessage,
} from "@platejs/ai/react";
import { withAIBatch } from "@platejs/ai";
import { Command as CommandPrimitive } from "cmdk";
import {
  BadgeHelp,
  Check,
  CornerUpLeft,
  ListEnd,
  ListMinus,
  ListPlus,
  Loader2Icon,
  PauseIcon,
  PenLine,
  SpellCheck,
  Wand,
  X,
} from "lucide-react";
import { isHotkey } from "platejs";
import {
  type PlateEditor,
  useEditorPlugin,
  useEditorRef,
  useFocusedLast,
  useHotkeys,
  usePluginOption,
} from "platejs/react";
import * as React from "react";
import { useIsSelecting } from "@platejs/selection/react";
import { DOMEditor } from "slate-dom";

import { AIChatEditor } from "@/components/ui/ai-chat-editor";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/ai-popover";
import { cn } from "@/lib/utils";

const GROUP_KEYS = ["primary", "secondary"] as const;

/** Popover width was tied to `anchor.offsetWidth`, which collapses on narrow blocks (e.g. ~10px). */
const AI_MENU_MIN_WIDTH_PX = 280;
const AI_MENU_VIEWPORT_GUTTER_PX = 24;

function getAiMenuPopoverWidthPx(anchor: HTMLElement): number {
  const raw = anchor.offsetWidth;
  const min = AI_MENU_MIN_WIDTH_PX;
  const max =
    typeof globalThis.window !== "undefined"
      ? Math.max(min, globalThis.window.innerWidth - AI_MENU_VIEWPORT_GUTTER_PX)
      : min;
  return Math.min(Math.max(raw, min), max);
}

const AI_MENU_CARET_ANCHOR_MIN_WIDTH_PX = 24;

function padNarrowCaretRect(r: DOMRect): DOMRect {
  if (r.width >= AI_MENU_CARET_ANCHOR_MIN_WIDTH_PX) {
    return new DOMRect(
      r.left,
      r.top,
      r.width,
      Math.max(r.height, 22),
    );
  }
  const pad = (AI_MENU_CARET_ANCHOR_MIN_WIDTH_PX - r.width) / 2;
  return new DOMRect(
    r.left - pad,
    r.top,
    AI_MENU_CARET_ANCHOR_MIN_WIDTH_PX,
    Math.max(r.height, 22),
  );
}

/** Caret rects are often (0×0) in `getBoundingClientRect` — use client rects. */
function domRangeToViewportRect(domRange: Range): DOMRect | null {
  let r = domRange.getBoundingClientRect();
  if (r.width === 0 && r.height === 0 && domRange.getClientRects().length > 0) {
    const c = domRange.getClientRects().item(0);
    if (c) {
      r = new DOMRect(c.left, c.top, c.width, c.height);
    }
  }
  if (r.width === 0 && r.height === 0) {
    return null;
  }
  return padNarrowCaretRect(r);
}

/**
 * Radix Popper anchor. Uses Slate `editor.selection` → DOM range so we still get the right
 * rect after the cmdk input steals `document` selection/focus (which broke `getSelection()`).
 */
function createAiMenuVirtualAnchorRef() {
  const editorRef: { current: PlateEditor | null } = { current: null };
  const blockRef: { current: HTMLElement | null } = { current: null };

  const measurable = {
    getBoundingClientRect(): DOMRect {
      const ed = editorRef.current;

      if (ed?.selection) {
        try {
          const domRange = DOMEditor.toDOMRange(
            ed as unknown as Parameters<typeof DOMEditor.toDOMRange>[0],
            ed.selection,
          );
          const r = domRangeToViewportRect(domRange);
          if (r && Number.isFinite(r.left) && Number.isFinite(r.top)) {
            return r;
          }
        } catch {
          /* fall through */
        }
      }

      const block = blockRef.current;
      if (block) {
        const br = block.getBoundingClientRect();
        if (br.width > 0 && br.height > 0) {
          return br;
        }
      }

      const editable = ed ? ed.api.toDOMNode(ed) : null;
      if (editable) {
        const er = editable.getBoundingClientRect();
        if (er.width > 0 && er.height > 0) {
          const w = AI_MENU_CARET_ANCHOR_MIN_WIDTH_PX;
          return new DOMRect(er.left + er.width / 2 - w / 2, er.top + er.height - 4, w, 24);
        }
      }

      const vw =
        typeof globalThis.window !== "undefined" ? globalThis.window.innerWidth : 800;
      const vh =
        typeof globalThis.window !== "undefined" ? globalThis.window.innerHeight : 600;
      return new DOMRect(
        Math.max(16, vw / 2 - AI_MENU_MIN_WIDTH_PX / 2),
        Math.max(16, vh * 0.2),
        AI_MENU_MIN_WIDTH_PX,
        24,
      );
    },
  };

  const virtualRef: React.RefObject<typeof measurable> = { current: measurable };

  return { editorRef, blockRef, virtualRef };
}

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  onSelect: ({
    aiEditor,
    editor,
    input,
    isSelecting,
  }: {
    aiEditor: PlateEditor | null;
    editor: PlateEditor;
    input: string;
    isSelecting: boolean;
  }) => void;
  value: string;
};

/**
 * One code path for “apply AI output” — popover, bottom toolbar, and future shortcuts.
 * The menu previously called `replaceSelection` for generate+chat+aiEditor; the toolbar only
 * called the edit branch, so behavior diverged. Focus loss on toolbar mousedown can also
 * let plugins (e.g. Copilot `onBlur`) clear state before click runs — see toolbar handlers below.
 */
export function acceptAiChatProposal(
  editor: PlateEditor,
  aiEditor?: PlateEditor | null,
) {
  const { mode, toolName } = editor.getOptions(AIChatPlugin);
  const resolvedAiEditor =
    aiEditor !== undefined
      ? aiEditor
      : (editor.getOptions(AIChatPlugin).aiEditor ?? null);

  if (mode === "chat" && toolName === "generate" && resolvedAiEditor) {
    editor
      .getTransforms(AIChatPlugin)
      .aiChat.replaceSelection(resolvedAiEditor);
    return;
  }

  if (mode === "chat" && toolName === "edit") {
    withAIBatch(editor, () => {
      acceptAISuggestions(editor);
    });
    editor.getApi(AIChatPlugin).aiChat.hide({ undo: false });
    editor.tf.focus({ edge: "end" });
    return;
  }

  editor.getTransforms(AIChatPlugin).aiChat.accept();
  editor.tf.focus({ edge: "end" });
}

const shouldKeepEditSuggestions = (mode: string, toolName: string | null) =>
  mode === "chat" && toolName === "edit";

const aiChatItems = {
  accept: {
    icon: <Check />,
    label: "Accept",
    onSelect: ({ aiEditor, editor }) => {
      acceptAiChatProposal(editor, aiEditor ?? null);
    },
    value: "accept",
  },
  askAI: {
    icon: <Wand />,
    label: "Ask AI",
    onSelect: ({ editor, input, isSelecting }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        toolName: isSelecting ? "edit" : "generate",
      });
    },
    value: "askAI",
  },
  continueWrite: {
    icon: <PenLine />,
    label: "Continue writing",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        mode: "insert",
        prompt:
          "Continue writing naturally after the current text. Do not repeat existing text.",
        toolName: "generate",
      });
    },
    value: "continueWrite",
  },
  discard: {
    icon: <X />,
    label: "Discard",
    onSelect: ({ editor }) => {
      editor.getTransforms(AIPlugin).ai.undo();
      editor.getApi(AIChatPlugin).aiChat.hide();
    },
    value: "discard",
  },
  explain: {
    icon: <BadgeHelp />,
    label: "Explain",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: "Explain the selected content clearly.",
        toolName: "generate",
      });
    },
    value: "explain",
  },
  fixSpelling: {
    icon: <SpellCheck />,
    label: "Fix spelling & grammar",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: "Fix spelling and grammar.",
        toolName: "edit",
      });
    },
    value: "fixSpelling",
  },
  improveWriting: {
    icon: <Wand />,
    label: "Improve writing",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: "Improve the writing while keeping the meaning.",
        toolName: "edit",
      });
    },
    value: "improveWriting",
  },
  insertBelow: {
    icon: <ListEnd />,
    label: "Insert below",
    onSelect: ({ aiEditor, editor }) => {
      if (!aiEditor) return;
      void editor.getTransforms(AIChatPlugin).aiChat.insertBelow(aiEditor, {
        format: "none",
      });
    },
    value: "insertBelow",
  },
  makeLonger: {
    icon: <ListPlus />,
    label: "Make longer",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt:
          "Make the selected content longer while preserving the meaning.",
        toolName: "edit",
      });
    },
    value: "makeLonger",
  },
  makeShorter: {
    icon: <ListMinus />,
    label: "Make shorter",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt:
          "Make the selected content shorter while preserving the meaning.",
        toolName: "edit",
      });
    },
    value: "makeShorter",
  },
  replace: {
    icon: <Check />,
    label: "Replace selection",
    onSelect: ({ aiEditor, editor }) => {
      if (!aiEditor) return;
      void editor.getTransforms(AIChatPlugin).aiChat.replaceSelection(aiEditor);
    },
    value: "replace",
  },
  simplifyLanguage: {
    icon: <Wand />,
    label: "Simplify language",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: "Simplify the language.",
        toolName: "edit",
      });
    },
    value: "simplifyLanguage",
  },
  summarize: {
    icon: <ListMinus />,
    label: "Add a summary",
    onSelect: ({ editor, input }) => {
      void editor.getApi(AIChatPlugin).aiChat.submit(input, {
        mode: "insert",
        prompt: "Summarize the relevant content.",
        toolName: "generate",
      });
    },
    value: "summarize",
  },
  tryAgain: {
    icon: <CornerUpLeft />,
    label: "Try again",
    onSelect: ({ editor }) => {
      void editor.getApi(AIChatPlugin).aiChat.reload();
    },
    value: "tryAgain",
  },
} satisfies Record<string, MenuItem>;

export function AIMenu() {
  const { api, editor } = useEditorPlugin(AIChatPlugin);
  const aiChatOpen = usePluginOption(AIChatPlugin, "open");
  const mode = usePluginOption(AIChatPlugin, "mode");
  const toolName = usePluginOption(AIChatPlugin, "toolName");
  const streaming = usePluginOption(AIChatPlugin, "streaming");
  const chat = usePluginOption(AIChatPlugin, "chat");
  const aiEditor = usePluginOption(AIChatPlugin, "aiEditor");
  const isSelecting = useIsSelecting();
  const isFocusedLast = useFocusedLast();
  const open = aiChatOpen && isFocusedLast;
  const messages = chat?.messages ?? [];
  const status = chat?.status ?? "ready";
  const content = useLastAssistantMessage()?.parts.find(
    (part) => part.type === "text",
  )?.text;

  const [value, setValue] = React.useState("");
  const [input, setInput] = React.useState("");
  const [anchorElement, setAnchorElement] = React.useState<HTMLElement | null>(
    null,
  );

  const virtualAnchorRef = React.useRef<ReturnType<
    typeof createAiMenuVirtualAnchorRef
  > | null>(null);
  if (virtualAnchorRef.current === null) {
    virtualAnchorRef.current = createAiMenuVirtualAnchorRef();
  }
  virtualAnchorRef.current.editorRef.current = editor;
  virtualAnchorRef.current.blockRef.current = anchorElement;

  const isLoading = status === "streaming" || status === "submitted";

  const getCurrentAnchorElement = React.useCallback(() => {
    if (editor.api.isExpanded()) {
      const selectedBlocks = editor.api.blocks({
        at: editor.selection ?? undefined,
      });
      const lastSelectedBlock = selectedBlocks.at(-1);

      if (lastSelectedBlock) {
        return editor.api.toDOMNode(lastSelectedBlock[0]) ?? null;
      }
    }

    const currentBlock = editor.api.block({ highest: true });

    if (!currentBlock) return null;

    return editor.api.toDOMNode(currentBlock[0]) ?? null;
  }, [editor]);

  React.useEffect(() => {
    if (!streaming) return;

    const anchor = api.aiChat.node({ anchor: true });
    if (!anchor) return;

    setTimeout(() => {
      const anchorDom = editor.api.toDOMNode(anchor[0]);
      setAnchorElement(anchorDom ?? null);
    }, 0);
  }, [api.aiChat, editor, streaming]);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen === aiChatOpen) return;

      if (nextOpen) {
        api.aiChat.show();
      } else {
        api.aiChat.hide({
          undo: !shouldKeepEditSuggestions(mode, toolName),
        });
      }
    },
    [aiChatOpen, api, mode, toolName],
  );

  const show = React.useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      setAnchorElement(element);
      setOpen(true);
    },
    [setOpen],
  );

  React.useEffect(() => {
    if (!open) return;
    if (anchorElement) return;

    const domNode = getCurrentAnchorElement();
    if (domNode) setAnchorElement(domNode);
  }, [anchorElement, getCurrentAnchorElement, open]);

  useEditorChat({
    onOpenChange: (nextOpen) => {
      if (!nextOpen) {
        setAnchorElement(null);
        setInput("");
      }
    },
    onOpenCursor: () => {
      show(getCurrentAnchorElement());
    },
    onOpenSelection: () => {
      show(getCurrentAnchorElement());
    },
  });

  useHotkeys("esc", () => {
    api.aiChat.stop();
  });

  if (isLoading && mode === "insert") return null;
  if (toolName === "edit" && mode === "chat" && isLoading) return null;

  if (!anchorElement) return null;

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverAnchor virtualRef={virtualAnchorRef.current.virtualRef} />

      <PopoverContent
        align="center"
        className="border-none bg-transparent p-0 shadow-none"
        collisionPadding={16}
        updatePositionStrategy="always"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          api.aiChat.hide({
            undo: !shouldKeepEditSuggestions(mode, toolName),
          });
        }}
        side="bottom"
        sideOffset={8}
        style={{
          width: getAiMenuPopoverWidthPx(anchorElement),
          maxWidth: `calc(100vw - ${AI_MENU_VIEWPORT_GUTTER_PX}px)`,
        }}
      >
        <Command
          className="w-full rounded-lg border shadow-md"
          onValueChange={setValue}
          value={value}
        >
          {mode === "chat" &&
            isSelecting &&
            content &&
            toolName === "generate" && <AIChatEditor content={content} />}

          {isLoading ? (
            <div className="flex grow select-none items-center gap-2 p-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {messages.length > 1 ? "Editing..." : "Thinking..."}
            </div>
          ) : (
            <CommandPrimitive.Input
              autoFocus
              className={cn(
                "flex h-9 w-full min-w-0 border-b border-input bg-transparent px-3 py-1 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground md:text-sm",
              )}
              data-plate-focus
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (isHotkey("backspace")(event) && input.length === 0) {
                  event.preventDefault();
                  api.aiChat.hide();
                }

                if (isHotkey("enter")(event) && !event.shiftKey && !value) {
                  event.preventDefault();
                  void api.aiChat.submit(input, {
                    toolName: isSelecting ? "edit" : "generate",
                  });
                  setInput("");
                }
              }}
              onValueChange={setInput}
              placeholder="Ask AI anything..."
              value={input}
            />
          )}

          {!isLoading && (
            <CommandList>
              <AIMenuItems
                aiEditor={aiEditor ?? null}
                input={input}
                setInput={setInput}
                setValue={setValue}
              />
            </CommandList>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const AIMenuItems = ({
  aiEditor,
  input,
  setInput,
  setValue,
}: {
  aiEditor: PlateEditor | null;
  input: string;
  setInput: (value: string) => void;
  setValue: (value: string) => void;
}) => {
  const editor = useEditorRef();
  const chat = usePluginOption(AIChatPlugin, "chat");
  const toolName = usePluginOption(AIChatPlugin, "toolName");
  const isSelecting = useIsSelecting();
  const messages = chat?.messages ?? [];

  const menuGroups = React.useMemo(() => {
    if (messages.length > 0) {
      if (toolName === "generate" && isSelecting) {
        return [
          [
            aiChatItems.replace,
            aiChatItems.insertBelow,
            aiChatItems.discard,
            aiChatItems.tryAgain,
          ],
        ];
      }

      return [[aiChatItems.accept, aiChatItems.discard, aiChatItems.tryAgain]];
    }

    if (isSelecting) {
      return [
        [
          aiChatItems.askAI,
          aiChatItems.improveWriting,
          aiChatItems.fixSpelling,
        ],
        [
          aiChatItems.simplifyLanguage,
          aiChatItems.makeShorter,
          aiChatItems.makeLonger,
          aiChatItems.explain,
        ],
      ];
    }

    return [
      [
        aiChatItems.askAI,
        aiChatItems.continueWrite,
        aiChatItems.summarize,
        aiChatItems.explain,
      ],
    ];
  }, [isSelecting, messages.length, toolName]);

  const defaultCommandValue = menuGroups[0]?.[0]?.value ?? "";

  React.useEffect(() => {
    if (defaultCommandValue) setValue(defaultCommandValue);
  }, [defaultCommandValue, setValue]);

  return (
    <>
      {menuGroups.map((group, index) => (
        <CommandGroup
          key={GROUP_KEYS[index] ?? `group-${group[0]?.value ?? index}`}
        >
          {group.map((menuItem) => (
            <CommandItem
              className="[&_svg]:text-muted-foreground"
              key={menuItem.value}
              onSelect={() => {
                menuItem.onSelect({
                  aiEditor,
                  editor,
                  input,
                  isSelecting,
                });
                setInput("");
              }}
              value={menuItem.value}
            >
              {menuItem.icon}
              <span>{menuItem.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
};

const aiChatToolbarPointerSafetyProps = {
  onPointerDownCapture: (e: React.PointerEvent) => {
    e.stopPropagation();
  },
} as const;

/** Streaming progress only; Accept/Discard live in {@link AIMenu} popover for a single review surface. */
export function AILoadingBar() {
  const toolName = usePluginOption(AIChatPlugin, "toolName");
  const mode = usePluginOption(AIChatPlugin, "mode");
  const { api } = useEditorPlugin(AIChatPlugin);
  const chat = usePluginOption(AIChatPlugin, "chat");
  const status = chat?.status ?? "ready";
  const isLoading = status === "streaming" || status === "submitted";

  useHotkeys("esc", () => {
    api.aiChat.stop();
  });

  if (
    isLoading &&
    (mode === "insert" || (toolName === "edit" && mode === "chat"))
  ) {
    return (
      <div
        className="pointer-events-auto absolute bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground shadow-md transition-all duration-300 sm:bottom-28"
        {...aiChatToolbarPointerSafetyProps}
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <span>{status === "submitted" ? "Thinking..." : "Writing..."}</span>
        <Button
          className="flex items-center gap-1 text-xs"
          onClick={() => api.aiChat.stop()}
          onMouseDown={(e) => e.preventDefault()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <PauseIcon className="h-4 w-4" />
          Stop
        </Button>
      </div>
    );
  }

  return null;
}
