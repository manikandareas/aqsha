<script lang="ts">
	import {
		buildPaperMentionLabel,
		buildWorkspaceMentionLabel,
		type ContextRef,
		contextRefsSignature,
		countContextRefs,
		filterPromptCommandsBySlashQuery,
		MAX_CONTEXT_PAPERS,
		MAX_CONTEXT_WORKSPACES,
		type PromptCommand
	} from '@aqsha/chat-core';
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { cn } from '@aqsha/ui-svelte/utils';
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
		serializeComposerEditorWithMarkers
	} from '../../lib/composer-inline-editor';
	import ComposerChipTooltip from './ComposerChipTooltip.svelte';
	import ContextMentionPalette from './ContextMentionPalette.svelte';
	import SlashCommandPalette from './SlashCommandPalette.svelte';
	import type {
		ComposerPlaceholder,
		ContextItemOption,
		ContextWorkspaceOption,
		MentionItemOption,
		MentionWorkspaceOption
	} from './palette-types';

	const COLLAPSED_EDITOR_HEIGHT = 32;

	let {
		value,
		onValueChange,
		onCommandsChange,
		onSubmit,
		disabled = false,
		maxLength,
		placeholder,
		onHeightChange,
		class: className,
		isCollapsed = false,
		pinnedContextRefs = [],
		onContextRefsChange,
		onRichValueChange,
		contextWorkspaces = [],
		ambientWorkspaceId = null,
		workspaceItems,
		workspaceItemsLoading = false,
		onRequestWorkspaceItems,
		mobilePaletteAnchor = null
	}: {
		value: string;
		onValueChange: (value: string) => void;
		onCommandsChange: (commands: PromptCommand[]) => void;
		onSubmit: () => void;
		disabled?: boolean;
		maxLength: number;
		placeholder: ComposerPlaceholder;
		onHeightChange?: (height: number) => void;
		class?: string;
		isCollapsed?: boolean;
		pinnedContextRefs?: ContextRef[];
		onContextRefsChange?: (refs: ContextRef[]) => void;
		onRichValueChange?: (rich: string) => void;
		contextWorkspaces?: ContextWorkspaceOption[];
		ambientWorkspaceId?: string | null;
		workspaceItems?: ContextItemOption[];
		workspaceItemsLoading?: boolean;
		onRequestWorkspaceItems?: (workspaceId: string | null) => void;
		/** Palette anchor on mobile: the composer shell element so the popover is shell-width + centred. */
		mobilePaletteAnchor?: HTMLElement | null;
	} = $props();

	let editorEl = $state<HTMLDivElement | null>(null);
	let editorWrapperEl = $state<HTMLDivElement | null>(null);
	const isMobile = new IsMobile();
	const anchorToShell = $derived(isMobile.current && mobilePaletteAnchor != null);

	// Non-reactive dismissal + signature holders — never read reactively.
	// Starts undismissed; `setPaletteDismissed` snapshots the current `value` at dismissal time.
	let paletteDismissal: { value: string; dismissed: boolean } = { value: '', dismissed: false };
	let lastContextSignature: string | null = null;
	const isPaletteDismissed = () => paletteDismissal.value === value && paletteDismissal.dismissed;
	const setPaletteDismissed = (dismissed: boolean) => {
		paletteDismissal = { value, dismissed };
	};

	let slashFilterQuery = $state<string | null>(null);
	let mentionFilterQuery = $state<string | null>(null);
	let drillWorkspaceId = $state<string | null>(null);
	let hoveredChip = $state<HTMLElement | null>(null);

	const slashOpen = $derived(slashFilterQuery !== null);
	const mentionOpen = $derived(mentionFilterQuery !== null);
	const paletteOpen = $derived(slashOpen || mentionOpen);
	const mentionMode = $derived<'workspace' | 'item'>(drillWorkspaceId ? 'item' : 'workspace');

	const filteredCommands = $derived(
		slashOpen ? filterPromptCommandsBySlashQuery(slashFilterQuery!) : []
	);

	const counts = $derived(countContextRefs(pinnedContextRefs));
	const pinnedWorkspaceIds = $derived(
		new Set(pinnedContextRefs.flatMap((ref) => (ref.kind === 'workspace' ? [ref.workspaceId] : [])))
	);
	const pinnedArtifactIds = $derived(
		new Set(pinnedContextRefs.flatMap((ref) => (ref.kind === 'paper' ? [ref.artifactId] : [])))
	);
	const workspaceCapReached = $derived(counts.workspaces >= MAX_CONTEXT_WORKSPACES);
	// The paper budget covers every pinned source (workspace papers + ambient explore-paper/news).
	const paperCapReached = $derived(
		counts.papers + counts.explorePapers + counts.news >= MAX_CONTEXT_PAPERS
	);

	const drillWorkspace = $derived(
		drillWorkspaceId ? contextWorkspaces.find((w) => w.workspaceId === drillWorkspaceId) : undefined
	);
	const drillWorkspaceName = $derived(drillWorkspace?.name ?? '');
	const mentionQuery = $derived((mentionFilterQuery ?? '').trim().toLowerCase());

	const workspaceOptions = $derived<MentionWorkspaceOption[]>(
		!mentionOpen
			? []
			: [...contextWorkspaces]
					.filter((w) => mentionQuery === '' || w.name.toLowerCase().includes(mentionQuery))
					.sort((a, b) => {
						const aAmbient = a.workspaceId === ambientWorkspaceId ? 0 : 1;
						const bAmbient = b.workspaceId === ambientWorkspaceId ? 0 : 1;
						if (aAmbient !== bAmbient) return aAmbient - bAmbient;
						return a.name.localeCompare(b.name);
					})
					.map((w) => {
						const pinned = pinnedWorkspaceIds.has(w.workspaceId);
						return {
							type: 'workspace' as const,
							workspaceId: w.workspaceId,
							name: w.name,
							emoji: w.emoji,
							isAmbient: w.workspaceId === ambientWorkspaceId,
							disabled: pinned || workspaceCapReached,
							disabledReason: pinned
								? 'sudah jadi konteks'
								: workspaceCapReached
									? 'batas tercapai'
									: undefined
						};
					})
	);

	const itemOptions = $derived<MentionItemOption[]>(
		!mentionOpen || mentionMode !== 'item'
			? []
			: (workspaceItems ?? []).flatMap((item) => {
					if (mentionQuery !== '' && !item.title.toLowerCase().includes(mentionQuery)) return [];
					const pinned = pinnedArtifactIds.has(item.artifactId);
					return [
						{
							type: 'item' as const,
							workspaceId: item.workspaceId,
							workspaceName: drillWorkspaceName,
							artifactId: item.artifactId,
							title: item.title,
							disabled: pinned || paperCapReached,
							disabledReason: pinned
								? 'sudah ditambahkan'
								: paperCapReached
									? `batas ${MAX_CONTEXT_PAPERS} paper`
									: undefined
						}
					];
				})
	);

	const activeLength = $derived(
		slashOpen
			? filteredCommands.length
			: mentionMode === 'item'
				? itemOptions.length
				: workspaceOptions.length
	);

	const capNotice = $derived(
		mentionOpen && mentionMode === 'workspace' && workspaceCapReached
			? `Batas ${MAX_CONTEXT_WORKSPACES} workspace per percakapan.`
			: mentionOpen && mentionMode === 'item' && paperCapReached
				? `Batas ${MAX_CONTEXT_PAPERS} paper per percakapan.`
				: null
	);

	const highlightKey = $derived(
		`${slashOpen ? 'command' : mentionMode}:${slashFilterQuery ?? ''}:${mentionFilterQuery ?? ''}:${drillWorkspaceId ?? ''}:${activeLength}`
	);
	let highlightedState = $state({ key: '', index: 0 });
	const highlightedIndex = $derived(
		highlightedState.key === highlightKey
			? Math.min(highlightedState.index, Math.max(activeLength - 1, 0))
			: 0
	);
	function setHighlightedIndex(next: number | ((current: number) => number)): void {
		const baseIndex = highlightedState.key === highlightKey ? highlightedState.index : 0;
		const index = typeof next === 'function' ? next(baseIndex) : next;
		highlightedState = { key: highlightKey, index };
	}

	function computeHeight(editor: HTMLElement, serialized: string): number {
		return serialized.length === 0 &&
			!editorHasCommandChips(editor) &&
			!editorHasContextChips(editor)
			? COLLAPSED_EDITOR_HEIGHT
			: editor.scrollHeight;
	}

	function syncEditorState(): void {
		const editor = editorEl;
		if (!editor) return;
		const serialized = serializeComposerEditor(editor).replace(/\u00a0/g, ' ');
		onCommandsChange(extractCommandsFromEditor(editor));
		const contextRefs = extractContextRefsFromEditor(editor);
		const contextSignature = contextRefsSignature(contextRefs);
		if (contextSignature !== lastContextSignature) {
			lastContextSignature = contextSignature;
			onContextRefsChange?.(contextRefs);
		}
		onRichValueChange?.(serializeComposerEditorWithMarkers(editor));
		if (serialized !== value) onValueChange(serialized);
		onHeightChange?.(computeHeight(editor, serialized));
		if (!isPaletteDismissed()) {
			const before = getTextBeforeCursor(editor);
			const slash = getSlashFilterQueryBeforeCursor(before);
			slashFilterQuery = slash;
			mentionFilterQuery = slash === null ? getMentionFilterQueryBeforeCursor(before) : null;
		} else {
			slashFilterQuery = null;
			mentionFilterQuery = null;
		}
		// Reset the drill once the mention palette is closed.
		if (mentionFilterQuery === null && drillWorkspaceId !== null) {
			drillWorkspaceId = null;
			onRequestWorkspaceItems?.(null);
		}
	}

	// Seed the editor DOM from `value` + pinned pills whenever they change externally (external DOM sync
	// via {@attach}, NOT a derived reflex). Skips while focused+non-empty so the caret never jumps
	// jumps mid-type; the `serialized === value` guard makes the post-input re-run a no-op.
	function seedEditor(node: HTMLDivElement) {
		// Read reactive deps so the attachment re-runs on change.
		const v = value;
		const pinned = pinnedContextRefs;
		const serialized = serializeComposerEditor(node);
		const currentChipSignature = contextRefsSignature(extractContextRefsFromEditor(node));
		const desiredChipSignature = contextRefsSignature(pinned);
		if (serialized === v && currentChipSignature === desiredChipSignature) return;
		if (document.activeElement === node && v !== '') return;
		renderComposerEditorWithPinnedContext(node, { pinnedRefs: pinned, visibleContent: v });
		onCommandsChange(extractCommandsFromEditor(node));
		if (document.activeElement === node) moveCaretToEnd(node);
		onHeightChange?.(computeHeight(node, v));
	}

	function focusEditor(): void {
		requestAnimationFrame(() => {
			const editor = editorEl;
			if (!editor) return;
			editor.focus();
			moveCaretToEnd(editor);
		});
	}

	function handleSelectCommand(selected: PromptCommand): void {
		const editor = editorEl;
		if (!editor) return;
		removeSlashTokenBeforeCursor(editor);
		insertNodeAtSelection(createCommandChipElement(selected));
		setPaletteDismissed(false);
		syncEditorState();
		focusEditor();
	}

	function handleSelectWholeWorkspace(option: MentionWorkspaceOption): void {
		const editor = editorEl;
		if (!editor || option.disabled) return;
		removeMentionTokenBeforeCursor(editor);
		insertNodeAtSelection(
			createContextChipElement({
				kind: 'workspace',
				workspaceId: option.workspaceId,
				label: buildWorkspaceMentionLabel(option.name)
			})
		);
		drillWorkspaceId = null;
		onRequestWorkspaceItems?.(null);
		setPaletteDismissed(false);
		syncEditorState();
		focusEditor();
	}

	function handleDrillWorkspace(option: MentionWorkspaceOption): void {
		const editor = editorEl;
		if (!editor) return;
		removeMentionTokenBeforeCursor(editor);
		insertPlainTextAtSelection('@');
		drillWorkspaceId = option.workspaceId;
		onRequestWorkspaceItems?.(option.workspaceId);
		setPaletteDismissed(false);
		syncEditorState();
		focusEditor();
	}

	function handleSelectItem(option: MentionItemOption): void {
		const editor = editorEl;
		if (!editor || option.disabled) return;
		removeMentionTokenBeforeCursor(editor);
		insertNodeAtSelection(
			createContextChipElement({
				kind: 'paper',
				workspaceId: option.workspaceId,
				artifactId: option.artifactId,
				label: buildPaperMentionLabel(option.workspaceName, option.title)
			})
		);
		drillWorkspaceId = null;
		onRequestWorkspaceItems?.(null);
		setPaletteDismissed(false);
		syncEditorState();
		focusEditor();
	}

	function handleBackToWorkspaces(): void {
		drillWorkspaceId = null;
		onRequestWorkspaceItems?.(null);
		focusEditor();
	}

	function selectHighlightedOption(): void {
		if (slashOpen) {
			const command = filteredCommands[highlightedIndex];
			if (command) handleSelectCommand(command);
			return;
		}
		if (mentionMode === 'item') {
			const option = itemOptions[highlightedIndex];
			if (option) handleSelectItem(option);
			return;
		}
		const option = workspaceOptions[highlightedIndex];
		if (option) handleSelectWholeWorkspace(option);
	}

	function updateEditorFromInput(): void {
		// Typing = the chip tooltip is no longer relevant (pointer may sit on a chip by chance).
		hoveredChip = null;
		const editor = editorEl;
		if (!editor) return;
		const serialized = serializeComposerEditor(editor);
		if (serialized.length > maxLength) {
			renderComposerEditorWithPinnedContext(editor, {
				pinnedRefs: extractContextRefsFromEditor(editor),
				visibleContent: serialized.slice(0, maxLength)
			});
			moveCaretToEnd(editor);
		}
		syncEditorState();
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (event.isComposing) return; // IME composition in progress — let the composition finish
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			onSubmit();
			return;
		}

		if (paletteOpen && activeLength > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				setHighlightedIndex((index) => (index + 1) % activeLength);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				setHighlightedIndex((index) => (index - 1 + activeLength) % activeLength);
				return;
			}
			if (event.key === 'Tab' && !event.shiftKey) {
				event.preventDefault();
				selectHighlightedOption();
				return;
			}
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				selectHighlightedOption();
				return;
			}
			if (mentionOpen && mentionMode === 'workspace' && event.key === 'ArrowRight') {
				const option = workspaceOptions[highlightedIndex];
				if (option) {
					event.preventDefault();
					handleDrillWorkspace(option);
					return;
				}
			}
			if (mentionOpen && mentionMode === 'item' && event.key === 'ArrowLeft') {
				event.preventDefault();
				handleBackToWorkspaces();
				return;
			}
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			onSubmit();
			return;
		}

		if (event.key === 'Backspace') {
			const editor = editorEl;
			if (editor && removeCommandChipBeforeCursor(editor)) {
				event.preventDefault();
				syncEditorState();
				return;
			}
		}

		if (event.key === 'Escape' && paletteOpen) {
			event.preventDefault();
			setPaletteDismissed(true);
			slashFilterQuery = null;
			mentionFilterQuery = null;
			focusEditor();
		}
	}

	// Paste = plain text only (default contentEditable pastes rich HTML → broken composer look). Only
	// preventDefault when there is a caret/selection so plain text truly lands; otherwise let native
	// paste run (else the text is swallowed).
	function handlePaste(event: ClipboardEvent): void {
		const text = event.clipboardData?.getData('text/plain');
		if (!text) return;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;
		event.preventDefault();
		insertPlainTextAtSelection(text);
		updateEditorFromInput();
	}

	function handleChipClick(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const chip = target.closest<HTMLElement>('[data-chip="command"],[data-chip="context"]');
		if (!chip || !editorEl?.contains(chip)) return;
		event.preventDefault();
		hoveredChip = null;
		chip.remove();
		syncEditorState();
		focusEditor();
	}

	function handleChipHover(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const chip = target.closest<HTMLElement>('[data-chip="command"],[data-chip="context"]');
		hoveredChip = chip && editorEl?.contains(chip) ? chip : null;
	}

	const isEditorEmpty = $derived(value.trim().length === 0 && pinnedContextRefs.length === 0);
</script>

<PopoverPrimitive.Root open={paletteOpen} onOpenChange={() => {}}>
	<div
		bind:this={editorWrapperEl}
		class={cn(
			'relative w-full min-w-0 text-[12.5px] leading-[18px] text-foreground',
			isCollapsed && 'flex min-h-8 items-center',
			className
		)}
	>
		{#if isEditorEmpty}
			<span
				class={cn(
					'pointer-events-none absolute left-0 text-[12.5px] font-normal text-muted-foreground',
					isCollapsed ? 'inset-y-0 flex items-center' : 'top-[3px]'
				)}
			>
				{#if typeof placeholder === 'string'}
					{placeholder}
				{:else}
					<span class="@lg/composer:hidden">{placeholder.narrow}</span>
					<span class="hidden @lg/composer:inline">{placeholder.wide}</span>
				{/if}
			</span>
		{/if}
		<!-- svelte-ignore a11y_mouse_events_have_key_events -->
		<div
			bind:this={editorEl}
			{@attach seedEditor}
			contenteditable={!disabled}
			role="textbox"
			aria-label="Pesan"
			aria-multiline="true"
			aria-controls={slashOpen
				? 'composer-slash-commands'
				: mentionOpen
					? 'composer-context-mentions'
					: undefined}
			class={cn(
				'max-h-36 w-full overflow-y-auto break-words whitespace-pre-wrap text-foreground caret-primary outline-none',
				isCollapsed ? 'min-h-8 py-[7px] leading-[18px]' : 'min-h-6 py-1'
			)}
			oninput={updateEditorFromInput}
			onblur={syncEditorState}
			onkeydown={handleKeyDown}
			onpaste={handlePaste}
			onclick={handleChipClick}
			onmouseover={handleChipHover}
			onmouseleave={() => (hoveredChip = null)}
			onscroll={() => (hoveredChip = null)}
			tabindex={0}
		></div>
		{#if hoveredChip}
			<ComposerChipTooltip chip={hoveredChip} />
		{/if}
	</div>
	<PopoverPrimitive.Content
		customAnchor={anchorToShell ? mobilePaletteAnchor : editorWrapperEl}
		align={anchorToShell ? 'center' : 'start'}
		side="bottom"
		sideOffset={12}
		trapFocus={false}
		preventScroll={false}
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
		onOpenAutoFocus={(e: Event) => e.preventDefault()}
		onCloseAutoFocus={(e: Event) => {
			e.preventDefault();
			focusEditor();
		}}
		onmousedown={(e: MouseEvent) => e.preventDefault()}
		class={cn(
			'border-border lip-pop z-50 overflow-hidden rounded-md border-2 bg-popover p-0',
			anchorToShell ? 'w-(--bits-floating-anchor-width)' : 'w-[min(22.5rem,calc(100vw-2rem))]'
		)}
	>
		{#if slashOpen}
			<SlashCommandPalette
				commands={filteredCommands}
				{highlightedIndex}
				onHighlight={setHighlightedIndex}
				onSelect={handleSelectCommand}
			/>
		{:else}
			<ContextMentionPalette
				mode={mentionMode}
				{workspaceOptions}
				{itemOptions}
				itemsLoading={workspaceItemsLoading}
				{drillWorkspaceName}
				{highlightedIndex}
				{capNotice}
				onHighlight={setHighlightedIndex}
				onSelectWorkspace={handleSelectWholeWorkspace}
				onDrillWorkspace={handleDrillWorkspace}
				onSelectItem={handleSelectItem}
				onBack={handleBackToWorkspaces}
			/>
		{/if}
	</PopoverPrimitive.Content>
</PopoverPrimitive.Root>
