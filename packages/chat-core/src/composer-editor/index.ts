import { type ContextRef, contextRefKey, wrapMentionLabel } from '../context';
import {
	getPromptCommand,
	getPromptCommandBySlug,
	type PromptCommand,
	promptCommandSlugPattern
} from '../prompt-commands';
import {
	splitTokenLabel,
	TOKEN_PILL_LABEL_CLASS,
	TOKEN_PILL_PREFIX_CLASS,
	tokenPillClass
} from './token-pill';

export * from './token-pill';

/**
 * Pure composer DOM logic for the tokenized composer. Manages the slash-command chip + `@mention`
 * context chip inside a single `contentEditable`. Command definitions + context refs come from
 * `@aqsha/chat-core`; chip visual classes are shared with the user message bubble via `token-pill.ts`.
 * Framework-agnostic browser DOM — no runes (Svelte contenteditable wiring lives in the composer).
 */

const CHIP_SELECTOR = '[data-chip="command"]';
const CONTEXT_CHIP_SELECTOR = '[data-chip="context"]';

/**
 * Chip visual content: dimmed prefix glyph (`/`, `@`, `❝`) + CSS-truncated label. `dataset.*` still
 * carries the FULL label/slug — serialization & extraction never depend on textContent.
 */
function appendChipContent(chip: HTMLElement, label: string) {
	const { prefix, text } = splitTokenLabel(label);
	if (prefix) {
		const prefixSpan = document.createElement('span');
		prefixSpan.className = TOKEN_PILL_PREFIX_CLASS;
		prefixSpan.textContent = prefix;
		chip.appendChild(prefixSpan);
	}
	const labelSpan = document.createElement('span');
	labelSpan.className = TOKEN_PILL_LABEL_CLASS;
	labelSpan.textContent = text;
	chip.appendChild(labelSpan);
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
	return beforeRange.toString().replace(/\u00a0/g, ' ');
}

/** Slash query immediately before the caret (supports commands anywhere in the line). */
export function getSlashFilterQueryBeforeCursor(textBeforeCursor: string): string | null {
	const match = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
	if (!match) {
		return null;
	}
	return match[1] ?? '';
}

/**
 * `@mention` query immediately before the caret. Returns the text typed after `@` (stops at
 * whitespace, `@`, or `:`). Drilling into a workspace's items is driven by UI state, not by typing `:`.
 */
export function getMentionFilterQueryBeforeCursor(textBeforeCursor: string): string | null {
	const match = textBeforeCursor.match(/(?:^|\s)@([^\s@:]*)$/);
	if (!match) {
		return null;
	}
	return match[1] ?? '';
}

function serializeComposerEditorInternal(root: HTMLElement, options: { markContext: boolean }) {
	let result = '';
	for (const node of root.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			result += node.textContent ?? '';
			continue;
		}
		if (!(node instanceof HTMLElement)) {
			continue;
		}
		if (node.dataset.chip === 'command') {
			result += node.dataset.slug ?? node.textContent ?? '';
			continue;
		}
		if (node.dataset.chip === 'context') {
			if (options.markContext) {
				result += wrapMentionLabel(node.dataset.label ?? node.textContent ?? '');
			}
			continue;
		}
		if (node.tagName === 'BR') {
			result += '\n';
			continue;
		}
		result += node.innerText;
	}
	return result.replace(/\u00a0/g, ' ');
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
		const command = getPromptCommand(commandId);
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
	const span = document.createElement('span');
	span.contentEditable = 'false';
	span.dataset.chip = 'command';
	span.dataset.commandId = command.id;
	span.dataset.slug = command.slug;
	span.className = tokenPillClass('composer', 'command');
	appendChipContent(span, command.slug);
	return span;
}

export function createContextChipElement(ref: ContextRef) {
	const span = document.createElement('span');
	span.contentEditable = 'false';
	span.dataset.chip = 'context';
	span.dataset.kind = ref.kind;
	switch (ref.kind) {
		case 'workspace':
			span.dataset.workspaceId = ref.workspaceId;
			break;
		case 'paper':
			span.dataset.workspaceId = ref.workspaceId;
			span.dataset.artifactId = ref.artifactId;
			break;
		case 'explore-paper':
			span.dataset.paperKey = ref.paperKey;
			break;
		case 'news':
			span.dataset.feedItemId = ref.feedItemId;
			break;
		case 'workspace-citation':
			span.dataset.workspaceId = ref.workspaceId;
			span.dataset.citationId = ref.citationId;
			break;
		case 'artifact-selection':
			// selected editor blocks (join blockIds with commas; keep the full excerpt).
			span.dataset.artifactId = ref.artifactId;
			span.dataset.blockIds = ref.blockIds.join(',');
			span.dataset.excerpt = ref.excerpt;
			break;
		case 'document-annotation':
			span.dataset.workspaceId = ref.workspaceId;
			span.dataset.annotationId = ref.annotationId;
			span.dataset.page = String(ref.page);
			span.dataset.selectedText = ref.selectedText;
			span.dataset.note = ref.note;
			span.dataset.elementLabel = ref.elementLabel;
			break;
		default: {
			// Exhaustiveness: a new ContextRef kind becomes a compile error here.
			const _exhaustive: never = ref;
			void _exhaustive;
		}
	}
	span.dataset.label = ref.label;
	span.className = tokenPillClass('composer', 'mention');
	appendChipContent(span, ref.label);
	return span;
}

export function extractContextRefsFromEditor(root: HTMLElement): ContextRef[] {
	const seen = new Set<string>();
	const refs: ContextRef[] = [];
	const push = (ref: ContextRef) => {
		const key = contextRefKey(ref);
		if (seen.has(key)) return;
		seen.add(key);
		refs.push(ref);
	};
	root.querySelectorAll<HTMLElement>(CONTEXT_CHIP_SELECTOR).forEach((chip) => {
		const kind = chip.dataset.kind;
		const label = chip.dataset.label ?? chip.textContent ?? '';
		if (kind === 'paper') {
			const workspaceId = chip.dataset.workspaceId;
			const artifactId = chip.dataset.artifactId;
			if (!workspaceId || !artifactId) return;
			push({ kind: 'paper', workspaceId, artifactId, label });
			return;
		}
		if (kind === 'workspace') {
			const workspaceId = chip.dataset.workspaceId;
			if (!workspaceId) return;
			push({ kind: 'workspace', workspaceId, label });
			return;
		}
		if (kind === 'explore-paper') {
			const paperKey = chip.dataset.paperKey;
			if (!paperKey) return;
			push({ kind: 'explore-paper', paperKey, label });
			return;
		}
		if (kind === 'news') {
			const feedItemId = chip.dataset.feedItemId;
			if (!feedItemId) return;
			push({ kind: 'news', feedItemId, label });
			return;
		}
		if (kind === 'workspace-citation') {
			const workspaceId = chip.dataset.workspaceId;
			const citationId = chip.dataset.citationId;
			if (!workspaceId || !citationId) return;
			push({ kind: 'workspace-citation', workspaceId, citationId, label });
			return;
		}
		if (kind === 'artifact-selection') {
			const artifactId = chip.dataset.artifactId;
			if (!artifactId) return;
			const blockIds = (chip.dataset.blockIds ?? '').split(',').filter(Boolean);
			push({
				kind: 'artifact-selection',
				artifactId,
				blockIds,
				excerpt: chip.dataset.excerpt ?? '',
				label
			});
			return;
		}
		if (kind === 'document-annotation') {
			const workspaceId = chip.dataset.workspaceId;
			const annotationId = chip.dataset.annotationId;
			if (!workspaceId || !annotationId) return;
			push({
				kind: 'document-annotation',
				workspaceId,
				annotationId,
				page: Number(chip.dataset.page) || 1,
				selectedText: chip.dataset.selectedText ?? '',
				note: chip.dataset.note ?? '',
				elementLabel: chip.dataset.elementLabel ?? 'paragraf',
				label
			});
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
	const space = document.createTextNode('\u00a0');
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

function appendVisibleContentTokens(root: HTMLElement, visibleContent: string) {
	if (!visibleContent) {
		return;
	}
	// Shared slug matcher from chat-core (word-boundary aware) — a URL/infix that happens to contain a
	// slug is no longer wrongly turned into a chip.
	let lastIndex = 0;
	for (const match of visibleContent.matchAll(promptCommandSlugPattern())) {
		// The boundary (group 1) is consumed too → shift the index to the slug start (group 2).
		const boundary = match[1] ?? '';
		const index = (match.index ?? 0) + boundary.length;
		if (index > lastIndex) {
			root.appendChild(document.createTextNode(visibleContent.slice(lastIndex, index)));
		}
		const slug = match[2] ?? '';
		const command = getPromptCommandBySlug(slug);
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
 * Render pinned context pills at the START of the editor, followed by the visible text (with
 * slash-command chips). Context pills are not recoverable from text (they serialize to empty), so they
 * must be passed structurally.
 */
export function renderComposerEditorWithPinnedContext(
	root: HTMLElement,
	args: { pinnedRefs: ContextRef[]; visibleContent: string }
) {
	root.replaceChildren();
	for (const ref of args.pinnedRefs) {
		root.appendChild(createContextChipElement(ref));
		root.appendChild(document.createTextNode(' '));
	}
	appendVisibleContentTokens(root, args.visibleContent);
}
