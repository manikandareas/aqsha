"use client";

import * as React from "react";

import type { DropdownMenuProps } from "@radix-ui/react-dropdown-menu";
import { DropdownMenuItemIndicator } from "@radix-ui/react-dropdown-menu";

import { LineHeightPlugin } from "@platejs/basic-styles/react";
import { exportToDocx, importDocx } from "@platejs/docx-io";
import { useIndentButton, useOutdentButton } from "@platejs/indent/react";
import { ListStyleType, toggleList } from "@platejs/list";
import { MarkdownPlugin } from "@platejs/markdown";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import {
  useToggleToolbarButton,
  useToggleToolbarButtonState,
} from "@platejs/toggle/react";
import {
  ALargeSmall,
  BaselineIcon,
  CalendarIcon,
  CheckIcon,
  Code2,
  Code2Icon,
  Columns3Icon,
  EraserIcon,
  EyeIcon,
  FileCodeIcon,
  FileStack,
  FilmIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HighlighterIcon,
  IndentIcon,
  KeyboardIcon,
  LayoutTemplateIcon,
  Link2Icon,
  List,
  ListCollapseIcon,
  ListOrdered,
  ListTodoIcon,
  MessageSquareTextIcon,
  MinusIcon,
  MoreHorizontalIcon,
  OutdentIcon,
  PaintBucketIcon,
  PenIcon,
  PenToolIcon,
  PencilLineIcon,
  PilcrowIcon,
  PlusIcon,
  RadicalIcon,
  SubscriptIcon,
  SuperscriptIcon,
  TableOfContentsIcon,
  WrapText,
} from "lucide-react";

import type { SlatePlugin } from "platejs";
import { KEYS, createSlateEditor } from "platejs";
import type { TSelection } from "platejs";
import {
  useEditorReadOnly,
  useEditorRef,
  useEditorSelector,
  usePluginOption,
  useSelectionFragmentProp,
} from "platejs/react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { getEditorDOMFromHtmlString, serializeHtml } from "platejs/static";
import { useFilePicker } from "use-file-picker";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ColorDropdownMenuItems,
  DEFAULT_COLORS,
} from "@/components/ui/font-color-toolbar-button";
import { BaseEditorKit } from "@/features/journal/editor/editor/editor-base-kit";
import { commentPlugin } from "@/features/journal/editor/editor/plugins/comment-kit";
import { DocxExportKit } from "@/features/journal/editor/editor/plugins/docx-export-kit";
import {
  insertBlock,
  insertInlineElement,
} from "@/features/journal/editor/editor/transforms";

import { EditorStatic } from "./editor-static";
import { ToolbarButton } from "./toolbar";

const SITE_URL = "https://platejs.org";

type ImportType = "html" | "markdown";

function ModeIndicator() {
  return (
    <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
      <DropdownMenuItemIndicator>
        <CheckIcon />
      </DropdownMenuItemIndicator>
    </span>
  );
}

function IndentOutdentItems({
  onBeforeAction,
}: {
  onBeforeAction?: () => void;
}) {
  const { props: outdentProps } = useOutdentButton();
  const { props: indentProps } = useIndentButton();

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onBeforeAction?.();
          outdentProps.onClick();
        }}
      >
        <OutdentIcon />
        Outdent
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onBeforeAction?.();
          indentProps.onClick();
        }}
      >
        <IndentIcon />
        Indent
      </DropdownMenuItem>
    </>
  );
}

function ToggleCollapseItem({
  onBeforeAction,
}: {
  onBeforeAction?: () => void;
}) {
  const state = useToggleToolbarButtonState();
  const { props: toggleProps } = useToggleToolbarButton(state);

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onBeforeAction?.();
        toggleProps.onClick();
      }}
    >
      <ListCollapseIcon />
      Toggle section
    </DropdownMenuItem>
  );
}

export function MoreToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const savedSelectionRef = React.useRef<TSelection>(null);

  const readOnly = useEditorReadOnly();
  const isSuggesting = usePluginOption(SuggestionPlugin, "isSuggesting");

  const textColor = useEditorSelector(
    (ed) => ed.api.mark(KEYS.color) as string | undefined,
    [],
  );
  const bgColor = useEditorSelector(
    (ed) => ed.api.mark(KEYS.backgroundColor) as string | undefined,
    [],
  );

  const { defaultNodeValue, validNodeValues: lineHeights = [] } =
    editor.getInjectProps(LineHeightPlugin);
  const lineHeightValue = useSelectionFragmentProp({
    defaultValue: defaultNodeValue,
    getProp: (node) => node.lineHeight,
  });

  let modeValue: "editing" | "suggestion" | "viewing" = "editing";
  if (readOnly) modeValue = "viewing";
  if (isSuggesting) modeValue = "suggestion";

  const getCanvas = async () => {
    const { default: html2canvas } = await import("html2canvas-pro");
    const style = document.createElement("style");
    document.head.append(style);
    const canvas = await html2canvas(editor.api.toDOMNode(editor)!, {
      onclone: (doc: Document) => {
        const el = doc.querySelector('[contenteditable="true"]');
        if (el) {
          Array.from(el.querySelectorAll("*")).forEach((node) => {
            const existing = node.getAttribute("style") || "";
            node.setAttribute(
              "style",
              `${existing}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important`,
            );
          });
        }
      },
    });
    style.remove();
    return canvas;
  };

  const downloadFile = async (url: string, filename: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const exportToPdf = async () => {
    const canvas = await getCanvas();
    const PDFLib = await import("pdf-lib");
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage([canvas.width, canvas.height]);
    const imageEmbed = await pdfDoc.embedPng(canvas.toDataURL("PNG"));
    const { height, width } = imageEmbed.scale(1);
    page.drawImage(imageEmbed, { height, width, x: 0, y: 0 });
    const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
    await downloadFile(pdfBase64, "plate.pdf");
  };

  const exportToImage = async () => {
    const canvas = await getCanvas();
    await downloadFile(canvas.toDataURL("image/png"), "plate.png");
  };

  const exportToHtml = async () => {
    const editorStatic = createSlateEditor({
      plugins: BaseEditorKit,
      value: editor.children,
    });
    const editorHtml = await serializeHtml(editorStatic, {
      editorComponent: EditorStatic,
      props: { style: { padding: "0 calc(50% - 350px)", paddingBottom: "" } },
    });
    const tailwindCss = `<link rel="stylesheet" href="${SITE_URL}/tailwind.css">`;
    const katexCss = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.18/dist/katex.css" integrity="sha384-9PvLvaiSKCPkFKB1ZsEoTjgnJn+O3KvEwtsz37/XrkYft3DTk2gHdYvd9oWgW3tV" crossorigin="anonymous">`;
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&display=swap" rel="stylesheet" />
    ${tailwindCss}
    ${katexCss}
    <style>:root { --font-sans: 'Inter', 'Inter Fallback'; --font-mono: 'JetBrains Mono', 'JetBrains Mono Fallback'; }</style>
  </head>
  <body>${editorHtml}</body>
</html>`;
    await downloadFile(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      "plate.html",
    );
  };

  const exportToMarkdown = async () => {
    const md = editor.getApi(MarkdownPlugin).markdown.serialize();
    await downloadFile(
      `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`,
      "plate.md",
    );
  };

  const exportToWord = async () => {
    const blob = await exportToDocx(editor.children, {
      editorPlugins: [...BaseEditorKit, ...DocxExportKit] as SlatePlugin[],
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plate.docx";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getFileNodes = (text: string, type: ImportType) => {
    if (type === "html") {
      const editorNode = getEditorDOMFromHtmlString(text);
      return editor.api.html.deserialize({ element: editorNode });
    }
    if (type === "markdown") {
      return editor.getApi(MarkdownPlugin).markdown.deserialize(text);
    }
    return [];
  };

  const { openFilePicker: openMdFilePicker } = useFilePicker({
    accept: [".md", ".mdx"],
    multiple: false,
    onFilesSelected: async ({ plainFiles }) => {
      const text = await plainFiles[0].text();
      editor.tf.insertNodes(getFileNodes(text, "markdown"));
      editor.tf.focus();
    },
  });

  const { openFilePicker: openHtmlFilePicker } = useFilePicker({
    accept: ["text/html"],
    multiple: false,
    onFilesSelected: async ({ plainFiles }) => {
      const text = await plainFiles[0].text();
      editor.tf.insertNodes(getFileNodes(text, "html"));
      editor.tf.focus();
    },
  });

  const { openFilePicker: openDocxFilePicker } = useFilePicker({
    accept: [".docx"],
    multiple: false,
    onFilesSelected: async ({ plainFiles }) => {
      const arrayBuffer = await plainFiles[0].arrayBuffer();
      const result = await importDocx(editor, arrayBuffer);
      editor.tf.insertNodes(result.nodes as typeof editor.children);
      editor.tf.focus();
    },
  });

  const getBlockSelectionRange = React.useCallback((): TSelection => {
    const blockSelection = editor
      .getApi(BlockSelectionPlugin)
      .blockSelection.getNodes({ sort: true });

    if (blockSelection.length === 0) return null;

    const firstPath = blockSelection[0][1];
    const lastPath = blockSelection[blockSelection.length - 1][1];
    const anchor = editor.api.start(firstPath);
    const focus = editor.api.end(lastPath);

    if (!anchor || !focus) return null;

    return { anchor, focus };
  }, [editor]);

  const restoreSelection = React.useCallback((): TSelection => {
    const selection =
      editor.selection ?? savedSelectionRef.current ?? getBlockSelectionRange();

    if (selection) {
      editor.tf.select(selection);
      savedSelectionRef.current = selection;
    }

    return selection;
  }, [editor, getBlockSelectionRange]);

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      if (value) {
        savedSelectionRef.current = editor.selection ?? getBlockSelectionRange();
      } else if (savedSelectionRef.current) {
        window.setTimeout(() => {
          editor.tf.select(savedSelectionRef.current!);
          editor.tf.focus();
        }, 0);
      }

      setOpen(value);
    },
    [editor, getBlockSelectionRange],
  );

  const toggleMark = (key: string) => {
    restoreSelection();
    editor.tf.toggleMark(key);
    editor.tf.collapse({ edge: "end" });
    editor.tf.focus();
  };

  const applyColor =
    (nodeType: typeof KEYS.color | typeof KEYS.backgroundColor) =>
    (value: string) => {
      const selection = restoreSelection();

      if (selection) {
        editor.tf.addMarks({ [nodeType]: value });
        editor.tf.focus();
      }
    };

  const clearMark = (
    nodeType: typeof KEYS.color | typeof KEYS.backgroundColor,
  ) => {
    const selection = restoreSelection();

    if (selection) {
      editor.tf.removeMarks(nodeType);
      editor.tf.focus();
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false} {...props}>
      <DropdownMenuTrigger
        render={<ToolbarButton pressed={open} tooltip="More" data-plate-prevent-deselect />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar flex max-h-[80vh] min-w-[220px] flex-col overflow-y-auto"
        align="start"
      >
        {/* ── Mode (always visible) ── */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            {modeValue === "editing" ? (
              <PenIcon className="size-4" />
            ) : modeValue === "viewing" ? (
              <EyeIcon className="size-4" />
            ) : (
              <PencilLineIcon className="size-4" />
            )}
            Mode
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[180px]">
            <DropdownMenuRadioGroup
              value={modeValue}
              onValueChange={(newValue) => {
                if (newValue === "viewing") {
                  editor.store.setReadOnly(true);
                  return;
                }
                editor.store.setReadOnly(false);
                if (newValue === "suggestion") {
                  editor.setOption(SuggestionPlugin, "isSuggesting", true);
                  return;
                }
                editor.setOption(SuggestionPlugin, "isSuggesting", false);
                if (newValue === "editing") editor.tf.focus();
              }}
            >
              <DropdownMenuRadioItem
                className="pl-2 *:first:[span]:hidden *:[svg]:text-muted-foreground"
                value="editing"
              >
                <ModeIndicator />
                <PenIcon />
                Editing
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                className="pl-2 *:first:[span]:hidden *:[svg]:text-muted-foreground"
                value="viewing"
              >
                <ModeIndicator />
                <EyeIcon />
                Viewing
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                className="pl-2 *:first:[span]:hidden *:[svg]:text-muted-foreground"
                value="suggestion"
              >
                <ModeIndicator />
                <PencilLineIcon />
                Suggestion
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {!readOnly && (
          <>
            <DropdownMenuSeparator />

            {/* ── Comment ── */}
            <DropdownMenuItem
              onSelect={() => {
                restoreSelection();
                editor.getTransforms(commentPlugin).comment.setDraft();
              }}
            >
              <MessageSquareTextIcon />
              Comment
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* ── Format ── */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <ALargeSmall className="size-4" />
                Format
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="ignore-click-outside/toolbar w-[min(100vw-2rem,260px)]">
                <DropdownMenuItem onSelect={() => toggleMark(KEYS.code)}>
                  <Code2Icon />
                  Code
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleMark(KEYS.highlight)}>
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
                    className="ignore-click-outside/toolbar w-[min(calc(100vw-2rem),300px)] p-2"
                    sideOffset={4}
                  >
                    <ColorDropdownMenuItems
                      color={textColor}
                      colors={DEFAULT_COLORS}
                      updateColor={applyColor(KEYS.color)}
                    />
                    {textColor && (
                      <DropdownMenuItem
                        className="mt-1"
                        onSelect={() => clearMark(KEYS.color)}
                      >
                        <EraserIcon />
                        Clear text color
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <PaintBucketIcon className="size-4" />
                    Background color
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="ignore-click-outside/toolbar w-[min(calc(100vw-2rem),300px)] p-2"
                    sideOffset={4}
                  >
                    <ColorDropdownMenuItems
                      color={bgColor}
                      colors={DEFAULT_COLORS}
                      updateColor={applyColor(KEYS.backgroundColor)}
                    />
                    {bgColor && (
                      <DropdownMenuItem
                        className="mt-1"
                        onSelect={() => clearMark(KEYS.backgroundColor)}
                      >
                        <EraserIcon />
                        Clear background
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* ── Typography ── */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <SuperscriptIcon className="size-4" />
                Typography
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onSelect={() => {
                    restoreSelection();
                    editor.tf.toggleMark(KEYS.sup, { remove: KEYS.sub });
                    editor.tf.focus();
                  }}
                >
                  <SuperscriptIcon />
                  Superscript
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    restoreSelection();
                    editor.tf.toggleMark(KEYS.sub, { remove: KEYS.sup });
                    editor.tf.focus();
                  }}
                >
                  <SubscriptIcon />
                  Subscript
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    toggleMark(KEYS.kbd);
                  }}
                >
                  <KeyboardIcon />
                  Keyboard input
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* ── Layout ── */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <LayoutTemplateIcon className="size-4" />
                Layout
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="ignore-click-outside/toolbar min-w-[220px]">
                <DropdownMenuLabel className="text-muted-foreground">
                  Lists
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    restoreSelection();
                    toggleList(editor, { listStyleType: ListStyleType.Disc });
                    editor.tf.focus();
                  }}
                >
                  <List className="size-4" />
                  Bulleted list
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    restoreSelection();
                    toggleList(editor, {
                      listStyleType: ListStyleType.Decimal,
                    });
                    editor.tf.focus();
                  }}
                >
                  <ListOrdered className="size-4" />
                  Numbered list
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    restoreSelection();
                    toggleList(editor, { listStyleType: KEYS.listTodo });
                    editor.tf.focus();
                  }}
                >
                  <ListTodoIcon className="size-4" />
                  To-do list
                </DropdownMenuItem>
                <ToggleCollapseItem onBeforeAction={restoreSelection} />

                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <WrapText className="size-4" />
                    Line height
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="ignore-click-outside/toolbar"
                    sideOffset={4}
                  >
                    <DropdownMenuRadioGroup
                      value={
                        lineHeightValue !== undefined
                          ? String(lineHeightValue)
                          : undefined
                      }
                      onValueChange={(newValue) => {
                        restoreSelection();
                        editor
                          .getTransforms(LineHeightPlugin)
                          .lineHeight.setNodes(Number(newValue));
                        editor.tf.focus();
                      }}
                    >
                      {lineHeights.map((value) => (
                        <DropdownMenuRadioItem
                          key={value}
                          className="min-w-[120px] pl-2 *:first:[span]:hidden"
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
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-muted-foreground">
                  Indentation
                </DropdownMenuLabel>
                <IndentOutdentItems onBeforeAction={restoreSelection} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* ── Insert ── */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <PlusIcon className="size-4" />
                Insert
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="ignore-click-outside/toolbar flex max-h-[500px] min-w-0 flex-col overflow-y-auto">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground">
                    Basic blocks
                  </DropdownMenuLabel>
                  {[
                    {
                      icon: <PilcrowIcon />,
                      label: "Paragraph",
                      value: KEYS.p,
                    },
                    {
                      icon: <Heading1Icon />,
                      label: "Heading 1",
                      value: "h1",
                    },
                    {
                      icon: <Heading2Icon />,
                      label: "Heading 2",
                      value: "h2",
                    },
                    {
                      icon: <Heading3Icon />,
                      label: "Heading 3",
                      value: "h3",
                    },
                    {
                      icon: <FileCodeIcon />,
                      label: "Code block",
                      value: KEYS.codeBlock,
                    },
                    { icon: <MinusIcon />, label: "Divider", value: KEYS.hr },
                  ].map(({ icon, label, value }) => (
                    <DropdownMenuItem
                      key={value}
                      className="min-w-[180px]"
                      onSelect={() => {
                        restoreSelection();
                        insertBlock(editor, value);
                        editor.tf.focus();
                      }}
                    >
                      {icon}
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>

                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground">
                    Advanced
                  </DropdownMenuLabel>
                  {[
                    {
                      icon: <TableOfContentsIcon />,
                      label: "Table of contents",
                      value: KEYS.toc,
                      focusEditor: true,
                    },
                    {
                      icon: <Columns3Icon />,
                      label: "3 columns",
                      value: "action_three_columns",
                      focusEditor: true,
                    },
                    {
                      icon: <RadicalIcon />,
                      label: "Block equation",
                      value: KEYS.equation,
                      focusEditor: false,
                    },
                    {
                      icon: <PenToolIcon />,
                      label: "Excalidraw",
                      value: KEYS.excalidraw,
                      focusEditor: true,
                    },
                    {
                      icon: <Code2 />,
                      label: "Code drawing",
                      value: KEYS.codeDrawing,
                      focusEditor: true,
                    },
                    {
                      icon: <FilmIcon />,
                      label: "Embed",
                      value: KEYS.mediaEmbed,
                      focusEditor: true,
                    },
                  ].map(({ icon, label, value, focusEditor }) => (
                    <DropdownMenuItem
                      key={value}
                      className="min-w-[180px]"
                      onSelect={() => {
                        restoreSelection();
                        insertBlock(editor, value);
                        if (focusEditor) editor.tf.focus();
                      }}
                    >
                      {icon}
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>

                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground">
                    Inline
                  </DropdownMenuLabel>
                  {[
                    { icon: <Link2Icon />, label: "Link", value: KEYS.link },
                    {
                      icon: <CalendarIcon />,
                      label: "Date",
                      value: KEYS.date,
                    },
                  ].map(({ icon, label, value }) => (
                    <DropdownMenuItem
                      key={value}
                      className="min-w-[180px]"
                      onSelect={() => {
                        restoreSelection();
                        insertInlineElement(editor, value);
                        editor.tf.focus();
                      }}
                    >
                      {icon}
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* ── File ── */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <FileStack className="size-4" />
                File
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="ignore-click-outside/toolbar min-w-[200px]">
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={exportToHtml}>
                    Export as HTML
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={exportToPdf}>
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={exportToImage}>
                    Export as Image
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={exportToMarkdown}>
                    Export as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={exportToWord}>
                    Export as Word
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Import</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => openHtmlFilePicker()}>
                    Import from HTML
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openMdFilePicker()}>
                    Import from Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openDocxFilePicker()}>
                    Import from Word
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
