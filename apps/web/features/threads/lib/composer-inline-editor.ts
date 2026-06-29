import {
  type ContextRef,
  type PromptCommand,
  promptCommands,
  wrapMentionLabel,
} from "@aqsha/chat-core";
import { cn } from "@/lib/utils";

/**
 * Logika DOM murni composer tokenized (port V1 apps/web). Mengelola chip slash
 * command + chip `@mention` context di dalam satu `contentEditable`. SSOT command
 * + context ref = `@aqsha/chat-core`. /deep dibuang → tak ada lagi tone "deep".
 */

const CHIP_SELECTOR = '[data-chip="command"]';
const CONTEXT_CHIP_SELECTOR = '[data-chip="context"]';

/**
 * Bentuk dasar pill `@mention` / command — TANPA warna & interaksi. Diekspor agar bubble pesan user
 * (`message-list.tsx`) merender mention dengan treatment yang sama (rounded + underline + bobot)
 * sebagai SATU sumber kebenaran, walau tone warnanya beda (composer di atas card, bubble di atas
 * `bg-primary`).
 */
export const MENTION_PILL_SHAPE =
  "rounded-[5px] px-0.5 font-semibold underline decoration-2 underline-offset-4";

const INLINE_PILL_BASE = cn(
  "inline-flex cursor-pointer select-none items-center leading-[18px] transition-[background-color,text-decoration-color] duration-150",
  MENTION_PILL_SHAPE,
);
const INLINE_PILL_TONE = {
  default:
    "bg-primary/8 text-primary decoration-primary/60 hover:bg-primary/12 hover:decoration-primary",
  context:
    "bg-foreground/5 text-foreground decoration-foreground/30 hover:bg-foreground/10 hover:decoration-foreground/60",
} as const;

type InlinePillTone = keyof typeof INLINE_PILL_TONE;

function inlinePillClass(tone: InlinePillTone) {
  return cn(INLINE_PILL_BASE, INLINE_PILL_TONE[tone]);
}

export function promptCommandDisplayLabel(command: Pick<PromptCommand, "slug">) {
  return command.slug.startsWith("/") ? command.slug.slice(1) : command.slug;
}

export function getTextBeforeCursor(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return root.innerText;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return root.innerText;
  }
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  return beforeRange.toString().replace(/\u00a0/g, " ");
}

/** Slash query immediately before the caret (supports commands anywhere in the line). */
export function getSlashFilterQueryBeforeCursor(textBeforeCursor: string): string | null {
  const match = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) {
    return null;
  }
  return match[1] ?? "";
}

/**
 * `@mention` query immediately before the caret. Returns the text typed after
 * `@` (stops at whitespace, `@`, or `:`). Drilling into a workspace's items is
 * driven by UI state, not by typing `:`.
 */
export function getMentionFilterQueryBeforeCursor(textBeforeCursor: string): string | null {
  const match = textBeforeCursor.match(/(?:^|\s)@([^\s@:]*)$/);
  if (!match) {
    return null;
  }
  return match[1] ?? "";
}

function serializeComposerEditorInternal(root: HTMLElement, options: { markContext: boolean }) {
  let result = "";
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? "";
      continue;
    }
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.dataset.chip === "command") {
      result += node.dataset.slug ?? node.textContent ?? "";
      continue;
    }
    if (node.dataset.chip === "context") {
      if (options.markContext) {
        result += wrapMentionLabel(node.dataset.label ?? node.textContent ?? "");
      }
      continue;
    }
    if (node.tagName === "BR") {
      result += "\n";
      continue;
    }
    result += node.innerText;
  }
  return result.replace(/\u00a0/g, " ");
}

export function serializeComposerEditor(root: HTMLElement) {
  return serializeComposerEditorInternal(root, { markContext: false });
}

export function serializeComposerEditorWithMarkers(root: HTMLElement) {
  return serializeComposerEditorInternal(root, { markContext: true });
}

export function extractCommandsFromEditor(root: HTMLElement): PromptCommand[] {
  const ids = new Set<string>();
  const commands: PromptCommand[] = [];
  root.querySelectorAll<HTMLElement>(CHIP_SELECTOR).forEach((chip) => {
    const commandId = chip.dataset.commandId;
    if (!commandId || ids.has(commandId)) {
      return;
    }
    const command = promptCommands.find((item) => item.id === commandId);
    if (!command) {
      return;
    }
    ids.add(commandId);
    commands.push(command);
  });
  return commands;
}

export function editorHasCommandChips(root: HTMLElement) {
  return root.querySelector(CHIP_SELECTOR) !== null;
}

export function createCommandChipElement(command: PromptCommand) {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.chip = "command";
  span.dataset.commandId = command.id;
  span.dataset.slug = command.slug;
  span.className = inlinePillClass("default");
  span.textContent = promptCommandDisplayLabel(command);
  return span;
}

export function createContextChipElement(ref: ContextRef) {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.chip = "context";
  span.dataset.kind = ref.kind;
  span.dataset.workspaceId = ref.workspaceId;
  if (ref.kind === "paper") {
    span.dataset.artifactId = ref.artifactId;
  }
  span.dataset.label = ref.label;
  span.className = inlinePillClass("context");
  span.textContent = ref.label;
  return span;
}

export function extractContextRefsFromEditor(root: HTMLElement): ContextRef[] {
  const seen = new Set<string>();
  const refs: ContextRef[] = [];
  root.querySelectorAll<HTMLElement>(CONTEXT_CHIP_SELECTOR).forEach((chip) => {
    const workspaceId = chip.dataset.workspaceId;
    const kind = chip.dataset.kind;
    const label = chip.dataset.label ?? chip.textContent ?? "";
    if (!workspaceId) {
      return;
    }
    if (kind === "paper") {
      const artifactId = chip.dataset.artifactId;
      if (!artifactId) {
        return;
      }
      const key = `${workspaceId}:${artifactId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      refs.push({ kind: "paper", workspaceId, artifactId, label });
      return;
    }
    if (kind === "workspace") {
      const key = `${workspaceId}:`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      refs.push({ kind: "workspace", workspaceId, label });
    }
  });
  return refs;
}

export function editorHasContextChips(root: HTMLElement) {
  return root.querySelector(CONTEXT_CHIP_SELECTOR) !== null;
}

export function insertNodeAtSelection(node: Node) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  const space = document.createTextNode("\u00a0");
  range.setStartAfter(node);
  range.collapse(true);
  range.insertNode(space);
  range.setStartAfter(space);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function insertPlainTextAtSelection(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function removeSlashTokenBeforeCursor(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return;
  }
  const before = getTextBeforeCursor(root);
  const match = before.match(/(?:^|\s)(\/[^\s/]*)$/);
  if (!match?.[1]) {
    return;
  }
  for (let index = 0; index < match[1].length; index += 1) {
    const range = selection.getRangeAt(0);
    if (!deletePreviousCharacter(range, root)) {
      break;
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export function removeMentionTokenBeforeCursor(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return;
  }
  const before = getTextBeforeCursor(root);
  const match = before.match(/(?:^|\s)(@[^\s@:]*)$/);
  if (!match?.[1]) {
    return;
  }
  for (let index = 0; index < match[1].length; index += 1) {
    const range = selection.getRangeAt(0);
    if (!deletePreviousCharacter(range, root)) {
      break;
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function deletePreviousCharacter(range: Range, root: HTMLElement) {
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType === Node.TEXT_NODE && startOffset > 0) {
    const textNode = startContainer as Text;
    textNode.deleteData(startOffset - 1, 1);
    range.setStart(textNode, startOffset - 1);
    range.collapse(true);
    return true;
  }
  if (startContainer === root && startOffset > 0) {
    const previous = root.childNodes[startOffset - 1];
    if (previous instanceof HTMLElement && previous.dataset.chip) {
      return false;
    }
    if (previous?.nodeType === Node.TEXT_NODE) {
      const textNode = previous as Text;
      if (textNode.length === 0) {
        textNode.remove();
        range.setStart(root, startOffset - 1);
        range.collapse(true);
        return deletePreviousCharacter(range, root);
      }
      textNode.deleteData(textNode.length - 1, 1);
      range.setStart(textNode, textNode.length);
      range.collapse(true);
      return true;
    }
    previous?.remove();
    range.setStart(root, startOffset - 1);
    range.collapse(true);
    return true;
  }
  return false;
}

export function removeCommandChipBeforeCursor(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return false;
  }
  const { startContainer, startOffset } = range;
  let previous: ChildNode | null = null;
  if (startContainer === root) {
    previous = startOffset > 0 ? root.childNodes[startOffset - 1] : null;
  } else if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
    previous = startContainer.previousSibling;
  }
  const chip = previous instanceof HTMLElement && previous.dataset.chip ? previous : null;
  if (!chip) {
    return false;
  }
  chip.remove();
  return true;
}

export function moveCaretToEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function findCommandBySlug(slug: string) {
  return promptCommands.find(
    (command) => command.slug === slug || command.aliases.some((alias) => alias === slug),
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appendVisibleContentTokens(root: HTMLElement, visibleContent: string) {
  if (!visibleContent) {
    return;
  }
  const slugs = [...promptCommands]
    .flatMap((command) => [command.slug, ...command.aliases])
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  const slugPattern = new RegExp(slugs.join("|"), "g");
  let lastIndex = 0;
  for (const match of visibleContent.matchAll(slugPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      root.appendChild(document.createTextNode(visibleContent.slice(lastIndex, index)));
    }
    const slug = match[0];
    const command = findCommandBySlug(slug);
    if (command) {
      root.appendChild(createCommandChipElement(command));
    } else {
      root.appendChild(document.createTextNode(slug));
    }
    lastIndex = index + slug.length;
  }
  if (lastIndex < visibleContent.length) {
    root.appendChild(document.createTextNode(visibleContent.slice(lastIndex)));
  }
}

/**
 * Render pinned context pills at the START of the editor, followed by the
 * visible text (with slash-command chips). Context pills are not recoverable
 * from text (they serialize to empty), so they must be passed structurally.
 */
export function renderComposerEditorWithPinnedContext(
  root: HTMLElement,
  args: { pinnedRefs: ContextRef[]; visibleContent: string },
) {
  root.replaceChildren();
  for (const ref of args.pinnedRefs) {
    root.appendChild(createContextChipElement(ref));
    root.appendChild(document.createTextNode(" "));
  }
  appendVisibleContentTokens(root, args.visibleContent);
}
