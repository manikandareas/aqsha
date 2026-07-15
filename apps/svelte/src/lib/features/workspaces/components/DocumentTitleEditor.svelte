<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	/**
	 * Notion-style document title — Svelte port of
	 * `apps/web/features/workspaces/components/document-title-editor.tsx`. A large, flush, editable
	 * heading above the document body. Seeds its value once (via `untrack`) and stays the local source
	 * of truth so autosave round-trips never yank the cursor. Autosaves the trimmed title via
	 * `onRename`, debounced 700ms, and flushes on blur / Enter. Wiring is event-handler-driven (no
	 * `$effect` mutating state) per the Phase 7/8 runes conventions; autosize + debounce ride the
	 * input/blur/keydown handlers plus a one-shot `{@attach}` for the initial measure.
	 */
	let {
		initialTitle,
		onRename
	}: { initialTitle: string; onRename: (title: string) => Promise<unknown> } = $props();

	let value = $state(untrack(() => initialTitle));
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	// Non-reactive bookkeeping: the last title we persisted + the debounce timer.
	let lastSaved: string = untrack(() => initialTitle.trim());
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function autosize() {
		const el = textareaEl;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	}

	// One-shot measure once the textarea mounts (seeded value can wrap to multiple lines).
	const measureOnMount: Attachment<HTMLTextAreaElement> = () => {
		autosize();
	};

	function save(next: string) {
		const trimmed = next.trim();
		if (!trimmed || trimmed === lastSaved) return;
		lastSaved = trimmed;
		void onRename(trimmed);
	}

	function clearSaveTimer() {
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
		}
	}

	function handleInput(event: Event) {
		value = (event.currentTarget as HTMLTextAreaElement).value;
		autosize();
		clearSaveTimer();
		const trimmed = value.trim();
		if (!trimmed || trimmed === lastSaved) return;
		saveTimer = setTimeout(() => {
			saveTimer = null;
			save(value);
		}, 700);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			clearSaveTimer();
			save(value);
			(event.currentTarget as HTMLTextAreaElement).blur();
		}
	}

	$effect(() => () => clearSaveTimer());
</script>

<textarea
	bind:this={textareaEl}
	{@attach measureOnMount}
	rows={1}
	{value}
	aria-label="Document title"
	placeholder="Untitled"
	spellcheck="false"
	oninput={handleInput}
	onblur={() => {
		clearSaveTimer();
		save(value);
	}}
	onkeydown={handleKeydown}
	class="w-full resize-none overflow-hidden border-0 bg-transparent px-5 pt-2 pb-1 text-[2rem] leading-[1.15] font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35 sm:text-[2.25rem]"
></textarea>
