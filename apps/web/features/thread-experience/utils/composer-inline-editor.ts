import { promptCommands, type PromptCommand } from "@aqsha/convex/prompt-commands";

const CHIP_SELECTOR = '[data-chip="command"]';
const COMMAND_CHIP_CLASS =
  "inline-flex cursor-pointer select-none items-center rounded-[5px] bg-primary/8 px-0.5 font-semibold leading-[18px] text-primary underline decoration-primary/60 decoration-2 underline-offset-4 transition-[background-color,text-decoration-color] duration-150 hover:bg-primary/12 hover:decoration-primary";
const DEEP_COMMAND_CHIP_CLASS =
  "inline-flex cursor-pointer select-none items-center rounded-[5px] bg-lavender-soft px-0.5 font-semibold leading-[18px] text-lavender-foreground underline decoration-lavender-foreground/55 decoration-2 underline-offset-4 transition-[background-color,text-decoration-color] duration-150 hover:bg-lavender-soft hover:decoration-lavender-foreground";

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

export function serializeComposerEditor(root: HTMLElement) {
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
    if (node.tagName === "BR") {
      result += "\n";
      continue;
    }
    result += node.innerText;
  }
  return result.replace(/\u00a0/g, " ");
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
  span.dataset.mode = command.mode;
  span.className = command.mode === "deep" ? DEEP_COMMAND_CHIP_CLASS : COMMAND_CHIP_CLASS;
  span.textContent = promptCommandDisplayLabel(command);
  return span;
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
    if (previous instanceof HTMLElement && previous.dataset.chip === "command") {
      return false;
    }
    if (previous?.nodeType === Node.TEXT_NODE) {
      const textNode = previous as Text;
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
  const chip =
    previous instanceof HTMLElement && previous.dataset.chip === "command"
      ? previous
      : null;
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

export function renderComposerEditorFromVisibleContent(root: HTMLElement, visibleContent: string) {
  root.replaceChildren();
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
