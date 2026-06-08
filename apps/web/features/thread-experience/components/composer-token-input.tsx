"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { type PromptCommand } from "@aqsha/convex/prompt-commands";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  buildPaperMentionLabel,
  buildWorkspaceMentionLabel,
  contextRefsSignature,
  countContextRefs,
  MAX_CONTEXT_PAPERS,
  MAX_CONTEXT_WORKSPACES,
  type ContextRef,
} from "@/lib/context-refs";
import { cn } from "@/lib/utils";
import { filterPromptCommandsBySlashQuery } from "../utils/composer-model";
import { SlashCommandPalette } from "./slash-command-palette";
import {
  ContextMentionPalette,
  type MentionItemOption,
  type MentionWorkspaceOption,
} from "./context-mention-palette";
import {
  createCommandChipElement,
  createContextChipElement,
  editorHasCommandChips,
  editorHasContextChips,
  extractCommandsFromEditor,
  extractContextRefsFromEditor,
  getMentionFilterQueryBeforeCursor,
  getSlashFilterQueryBeforeCursor,
  getTextBeforeCursor,
  insertNodeAtSelection,
  insertPlainTextAtSelection,
  moveCaretToEnd,
  removeCommandChipBeforeCursor,
  removeMentionTokenBeforeCursor,
  removeSlashTokenBeforeCursor,
  renderComposerEditorWithPinnedContext,
  serializeComposerEditor,
  serializeComposerEditorWithMarkers,
} from "../utils/composer-inline-editor";

const COLLAPSED_EDITOR_HEIGHT = 32;

// Stable empty default so the effect dependency `pinnedContextRefs` doesn't
// change identity every render when no provider supplies refs.
const EMPTY_PINNED_REFS: ContextRef[] = [];

export type ContextWorkspaceOption = {
  workspaceId: string;
  name: string;
  emoji?: string;
};

export type ContextItemOption = {
  workspaceId: string;
  artifactId: string;
  title: string;
};

function truncateLabel(value: string, max = 22) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

export function TokenizedPromptInput({
  value,
  onValueChange,
  onCommandsChange,
  onSubmit,
  disabled,
  maxLength,
  placeholder,
  onHeightChange,
  className,
  isCollapsed = false,
  pinnedContextRefs = EMPTY_PINNED_REFS,
  onContextRefsChange,
  onRichValueChange,
  contextWorkspaces = [],
  ambientWorkspaceId = null,
  workspaceItems,
  workspaceItemsLoading = false,
  onRequestWorkspaceItems,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onCommandsChange: (commands: PromptCommand[]) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
  onHeightChange?: (height: number) => void;
  className?: string;
  isCollapsed?: boolean;
  pinnedContextRefs?: ContextRef[];
  onContextRefsChange?: (refs: ContextRef[]) => void;
  onRichValueChange?: (rich: string) => void;
  contextWorkspaces?: ContextWorkspaceOption[];
  ambientWorkspaceId?: string | null;
  workspaceItems?: ContextItemOption[];
  workspaceItemsLoading?: boolean;
  onRequestWorkspaceItems?: (workspaceId: string | null) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const paletteDismissalRef = useRef({
    value,
    dismissed: false,
  });
  // Only push context refs up to the provider when they actually change, so a
  // plain keystroke doesn't re-set provider state (and re-render consumers).
  const lastContextSignatureRef = useRef<string | null>(null);
  const isPaletteDismissed = () =>
    paletteDismissalRef.current.value === value &&
    paletteDismissalRef.current.dismissed;
  const setPaletteDismissed = (dismissed: boolean) => {
    paletteDismissalRef.current = { value, dismissed };
  };
  const [slashFilterQuery, setSlashFilterQuery] = useState<string | null>(null);
  const [mentionFilterQuery, setMentionFilterQuery] = useState<string | null>(null);
  const [drillWorkspaceId, setDrillWorkspaceId] = useState<string | null>(null);
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);

  const slashOpen = slashFilterQuery !== null;
  const mentionOpen = mentionFilterQuery !== null;
  const paletteOpen = slashOpen || mentionOpen;
  const mentionMode: "workspace" | "item" = drillWorkspaceId ? "item" : "workspace";

  // Guarded render-phase reset: when the mention trigger goes away, drop the
  // drill state on the next render (avoids a cascading set-state-in-effect).
  if (!mentionOpen && drillWorkspaceId !== null) {
    setDrillWorkspaceId(null);
  }

  const filteredCommands = slashOpen ? filterPromptCommandsBySlashQuery(slashFilterQuery) : [];

  const counts = countContextRefs(pinnedContextRefs);
  const pinnedWorkspaceIds = new Set(
    pinnedContextRefs.flatMap((ref) => (ref.kind === "workspace" ? [ref.workspaceId] : [])),
  );
  const pinnedArtifactIds = new Set(
    pinnedContextRefs.flatMap((ref) => (ref.kind === "paper" ? [ref.artifactId] : [])),
  );
  const workspaceCapReached = counts.workspaces >= MAX_CONTEXT_WORKSPACES;
  const paperCapReached = counts.papers >= MAX_CONTEXT_PAPERS;

  const drillWorkspace = drillWorkspaceId
    ? contextWorkspaces.find((workspace) => workspace.workspaceId === drillWorkspaceId)
    : undefined;
  const drillWorkspaceName = drillWorkspace?.name ?? "";

  const mentionQuery = (mentionFilterQuery ?? "").trim().toLowerCase();

  const workspaceOptions: MentionWorkspaceOption[] = !mentionOpen
    ? []
    : [...contextWorkspaces]
        .filter(
          (workspace) =>
            mentionQuery === "" || workspace.name.toLowerCase().includes(mentionQuery),
        )
        .sort((a, b) => {
          const aAmbient = a.workspaceId === ambientWorkspaceId ? 0 : 1;
          const bAmbient = b.workspaceId === ambientWorkspaceId ? 0 : 1;
          if (aAmbient !== bAmbient) {
            return aAmbient - bAmbient;
          }
          return a.name.localeCompare(b.name);
        })
        .map((workspace) => {
          const pinned = pinnedWorkspaceIds.has(workspace.workspaceId);
          return {
            type: "workspace" as const,
            workspaceId: workspace.workspaceId,
            name: workspace.name,
            emoji: workspace.emoji,
            isAmbient: workspace.workspaceId === ambientWorkspaceId,
            disabled: pinned || workspaceCapReached,
            disabledReason: pinned
              ? "sudah jadi konteks"
              : workspaceCapReached
                ? "batas tercapai"
                : undefined,
          };
        });

  const itemOptions: MentionItemOption[] =
    !mentionOpen || mentionMode !== "item"
      ? []
      : (workspaceItems ?? [])
          .filter(
            (item) => mentionQuery === "" || item.title.toLowerCase().includes(mentionQuery),
          )
          .map((item) => {
            const pinned = pinnedArtifactIds.has(item.artifactId);
            return {
              type: "item" as const,
              workspaceId: item.workspaceId,
              workspaceName: drillWorkspaceName,
              artifactId: item.artifactId,
              title: item.title,
              disabled: pinned || paperCapReached,
              disabledReason: pinned
                ? "sudah ditambahkan"
                : paperCapReached
                  ? "batas 12 paper"
                  : undefined,
            };
          });

  const activeLength = slashOpen
    ? filteredCommands.length
    : mentionMode === "item"
      ? itemOptions.length
      : workspaceOptions.length;

  const capNotice =
    mentionOpen && mentionMode === "workspace" && workspaceCapReached
      ? `Batas ${MAX_CONTEXT_WORKSPACES} workspace per percakapan.`
      : mentionOpen && mentionMode === "item" && paperCapReached
        ? `Batas ${MAX_CONTEXT_PAPERS} paper per percakapan.`
        : null;

  const highlightKey = `${slashOpen ? "command" : mentionMode}:${slashFilterQuery ?? ""}:${mentionFilterQuery ?? ""}:${drillWorkspaceId ?? ""}:${activeLength}`;
  const [highlightedState, setHighlightedState] = useState({
    key: highlightKey,
    index: 0,
  });
  const highlightedIndex =
    highlightedState.key === highlightKey
      ? Math.min(highlightedState.index, Math.max(activeLength - 1, 0))
      : 0;
  const setHighlightedIndex = (nextIndex: number | ((currentIndex: number) => number)) => {
    setHighlightedState((current) => {
      const baseIndex = current.key === highlightKey ? current.index : 0;
      const index = typeof nextIndex === "function" ? nextIndex(baseIndex) : nextIndex;
      return { key: highlightKey, index };
    });
  };

  const syncEditorState = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const serialized = serializeComposerEditor(editor).replace(/ /g, " ");
    onCommandsChange(extractCommandsFromEditor(editor));
    const contextRefs = extractContextRefsFromEditor(editor);
    const contextSignature = contextRefsSignature(contextRefs);
    if (contextSignature !== lastContextSignatureRef.current) {
      lastContextSignatureRef.current = contextSignature;
      onContextRefsChange?.(contextRefs);
    }
    onRichValueChange?.(serializeComposerEditorWithMarkers(editor));
    if (serialized !== value) {
      onValueChange(serialized);
    }
    if (onHeightChange) {
      onHeightChange(
        serialized.length === 0 &&
          !editorHasCommandChips(editor) &&
          !editorHasContextChips(editor)
          ? COLLAPSED_EDITOR_HEIGHT
          : editor.scrollHeight,
      );
    }
    setIsEditorEmpty(
      serialized.trim().length === 0 &&
        !editorHasCommandChips(editor) &&
        !editorHasContextChips(editor),
    );
    if (!isPaletteDismissed()) {
      const before = getTextBeforeCursor(editor);
      const slash = getSlashFilterQueryBeforeCursor(before);
      setSlashFilterQuery(slash);
      setMentionFilterQuery(slash === null ? getMentionFilterQueryBeforeCursor(before) : null);
    } else {
      setSlashFilterQuery(null);
      setMentionFilterQuery(null);
    }
  };

  // Seed / re-seed the editor from `value` + pinned context pills. Pinned pills
  // are not recoverable from text (they serialize to empty), so they are
  // rendered structurally and "settle" at the start of the input each new turn.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const serialized = serializeComposerEditor(editor);
    const currentChipSignature = contextRefsSignature(extractContextRefsFromEditor(editor));
    const desiredChipSignature = contextRefsSignature(pinnedContextRefs);
    if (serialized === value && currentChipSignature === desiredChipSignature) {
      return;
    }
    // Don't stomp the caret while the user is actively typing text. A
    // programmatic clear (value === "") after submit still re-seeds pills.
    if (document.activeElement === editor && value !== "") {
      return;
    }
    renderComposerEditorWithPinnedContext(editor, {
      pinnedRefs: pinnedContextRefs,
      visibleContent: value,
    });
    onCommandsChange(extractCommandsFromEditor(editor));
    // NOTE: do NOT call onContextRefsChange here. The mention provider is the
    // source of truth for pinnedContextRefs; this effect only mirrors them into
    // the DOM. Pushing the extracted refs back would re-set provider state with
    // a fresh array each run, changing `pinnedContextRefs`' identity and
    // re-triggering this effect — an infinite render loop.
    if (document.activeElement === editor) {
      moveCaretToEnd(editor);
    }
    if (onHeightChange) {
      onHeightChange(
        value.length === 0 &&
          !editorHasCommandChips(editor) &&
          !editorHasContextChips(editor)
          ? COLLAPSED_EDITOR_HEIGHT
          : editor.scrollHeight,
      );
    }
  }, [onCommandsChange, onHeightChange, value, pinnedContextRefs]);

  useEffect(() => {
    if (!paletteOpen) {
      return;
    }
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) {
      return;
    }
    editor.focus();
  }, [paletteOpen]);

  const focusEditor = () => {
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      moveCaretToEnd(editor);
    });
  };

  const handleSelectCommand = (selected: PromptCommand) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    removeSlashTokenBeforeCursor(editor);
    insertNodeAtSelection(createCommandChipElement(selected));
    setPaletteDismissed(false);
    syncEditorState();
    focusEditor();
  };

  const handleSelectWholeWorkspace = (option: MentionWorkspaceOption) => {
    const editor = editorRef.current;
    if (!editor || option.disabled) {
      return;
    }
    removeMentionTokenBeforeCursor(editor);
    insertNodeAtSelection(
      createContextChipElement({
        kind: "workspace",
        workspaceId: option.workspaceId,
        label: buildWorkspaceMentionLabel(option.name),
      }),
    );
    setDrillWorkspaceId(null);
    onRequestWorkspaceItems?.(null);
    setPaletteDismissed(false);
    syncEditorState();
    focusEditor();
  };

  const handleDrillWorkspace = (option: MentionWorkspaceOption) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    // Collapse the typed query back to a bare "@" so the item filter starts
    // fresh while keeping the mention trigger active.
    removeMentionTokenBeforeCursor(editor);
    insertPlainTextAtSelection("@");
    setDrillWorkspaceId(option.workspaceId);
    onRequestWorkspaceItems?.(option.workspaceId);
    setPaletteDismissed(false);
    syncEditorState();
    focusEditor();
  };

  const handleSelectItem = (option: MentionItemOption) => {
    const editor = editorRef.current;
    if (!editor || option.disabled) {
      return;
    }
    removeMentionTokenBeforeCursor(editor);
    insertNodeAtSelection(
      createContextChipElement({
        kind: "paper",
        workspaceId: option.workspaceId,
        artifactId: option.artifactId,
        label: buildPaperMentionLabel(
          truncateLabel(option.workspaceName, 16),
          truncateLabel(option.title, 20),
        ),
      }),
    );
    setDrillWorkspaceId(null);
    onRequestWorkspaceItems?.(null);
    setPaletteDismissed(false);
    syncEditorState();
    focusEditor();
  };

  const handleBackToWorkspaces = () => {
    setDrillWorkspaceId(null);
    onRequestWorkspaceItems?.(null);
    focusEditor();
  };

  const selectHighlightedOption = () => {
    if (slashOpen) {
      const command = filteredCommands[highlightedIndex];
      if (command) {
        handleSelectCommand(command);
      }
      return;
    }
    if (mentionMode === "item") {
      const option = itemOptions[highlightedIndex];
      if (option) {
        handleSelectItem(option);
      }
      return;
    }
    const option = workspaceOptions[highlightedIndex];
    if (option) {
      handleSelectWholeWorkspace(option);
    }
  };

  const updateEditorFromInput = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const serialized = serializeComposerEditor(editor);
    if (serialized.length > maxLength) {
      renderComposerEditorWithPinnedContext(editor, {
        pinnedRefs: extractContextRefsFromEditor(editor),
        visibleContent: serialized.slice(0, maxLength),
      });
      moveCaretToEnd(editor);
    }
    syncEditorState();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
      return;
    }

    if (paletteOpen && activeLength > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((index) => (index + 1) % activeLength);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((index) => (index - 1 + activeLength) % activeLength);
        return;
      }
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        selectHighlightedOption();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        selectHighlightedOption();
        return;
      }
      if (mentionOpen && mentionMode === "workspace" && event.key === "ArrowRight") {
        const option = workspaceOptions[highlightedIndex];
        if (option) {
          event.preventDefault();
          handleDrillWorkspace(option);
          return;
        }
      }
      if (mentionOpen && mentionMode === "item" && event.key === "ArrowLeft") {
        event.preventDefault();
        handleBackToWorkspaces();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
      return;
    }

    if (event.key === "Backspace") {
      const editor = editorRef.current;
      if (editor && removeCommandChipBeforeCursor(editor)) {
        event.preventDefault();
        syncEditorState();
        return;
      }
    }

    if (event.key === "Escape" && paletteOpen) {
      event.preventDefault();
      setPaletteDismissed(true);
      setSlashFilterQuery(null);
      setMentionFilterQuery(null);
      focusEditor();
    }
  };

  const handleChipClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const chip = target.closest<HTMLElement>('[data-chip="command"],[data-chip="context"]');
    if (!chip || !editorRef.current?.contains(chip)) {
      return;
    }
    event.preventDefault();
    chip.remove();
    syncEditorState();
    focusEditor();
  };

  const showPlaceholder = isEditorEmpty;

  return (
    <Popover open={paletteOpen} modal={false}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "relative min-w-0 w-full text-[12.5px] leading-[18px] text-foreground",
            isCollapsed && "flex min-h-8 items-center",
            disabled && "opacity-100",
            className,
          )}
        >
          {showPlaceholder ? (
            <span
              className={cn(
                "pointer-events-none absolute left-0 text-[12.5px] font-normal text-muted-foreground",
                isCollapsed ? "inset-y-0 flex items-center" : "top-[3px]",
              )}
            >
              {placeholder}
            </span>
          ) : null}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            role="textbox"
            aria-label="Pesan"
            aria-multiline="true"
            aria-controls={
              slashOpen
                ? "composer-slash-commands"
                : mentionOpen
                  ? "composer-context-mentions"
                  : undefined
            }
            data-slot="input-group-control"
            className={cn(
              "max-h-36 w-full overflow-y-auto whitespace-pre-wrap break-words text-foreground caret-primary outline-none disabled:opacity-100",
              isCollapsed ? "min-h-8 py-[7px] leading-[18px]" : "min-h-6 py-1",
            )}
            onInput={updateEditorFromInput}
            onBlur={syncEditorState}
            onKeyDown={handleKeyDown}
            onClick={handleChipClick}
            tabIndex={0}
            suppressContentEditableWarning
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[min(22.5rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusEditor();
        }}
      >
        {slashOpen ? (
          <SlashCommandPalette
            commands={filteredCommands}
            highlightedIndex={highlightedIndex}
            onHighlight={setHighlightedIndex}
            onSelect={handleSelectCommand}
          />
        ) : (
          <ContextMentionPalette
            mode={mentionMode}
            workspaceOptions={workspaceOptions}
            itemOptions={itemOptions}
            itemsLoading={workspaceItemsLoading}
            drillWorkspaceName={drillWorkspaceName}
            highlightedIndex={highlightedIndex}
            capNotice={capNotice}
            onHighlight={setHighlightedIndex}
            onSelectWorkspace={handleSelectWholeWorkspace}
            onDrillWorkspace={handleDrillWorkspace}
            onSelectItem={handleSelectItem}
            onBack={handleBackToWorkspaces}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
