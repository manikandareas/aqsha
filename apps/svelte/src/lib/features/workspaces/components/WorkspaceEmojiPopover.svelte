<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { readableApiErrorMessage } from '$lib/errors';
	import WorkspaceEmojiPickerContent from './WorkspaceEmojiPickerContent.svelte';

	const fallbackWorkspaceEmoji = '📚';

	/** Emoji-switcher popover in the board toolbar — from `workspace-board-toolbar.tsx`. */
	let {
		emoji,
		onUpdateEmoji
	}: {
		emoji?: string;
		onUpdateEmoji: (emoji: string) => Promise<unknown>;
	} = $props();

	let open = $state(false);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	const displayEmoji = $derived(emoji?.trim() || fallbackWorkspaceEmoji);

	function handleOpenChange(nextOpen: boolean) {
		open = nextOpen;
		if (nextOpen) {
			error = null;
		}
	}

	async function handleSelect(nextEmoji: string) {
		if (isSaving) return;
		if (nextEmoji === displayEmoji) {
			open = false;
			return;
		}
		isSaving = true;
		error = null;
		try {
			await onUpdateEmoji(nextEmoji);
			open = false;
		} catch (updateError) {
			error = readableApiErrorMessage(updateError, 'Emoji belum bisa disimpan.');
		}
		isSaving = false;
	}
</script>

<Popover.Root {open} onOpenChange={handleOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="ghost"
				class="size-8 shrink-0 self-center rounded-full text-[20px] leading-none hover:bg-muted"
				aria-label="Ubah emoji workspace"
				disabled={isSaving}
			>
				<span aria-hidden="true">{displayEmoji}</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="start" class="w-[19rem] overflow-hidden p-0">
		{#if open}
			<WorkspaceEmojiPickerContent onSelect={(selectedEmoji) => void handleSelect(selectedEmoji)} />
		{/if}
		{#if error}
			<p class="border-t border-border/70 px-3 py-2 text-[12px] font-medium text-destructive">
				{error}
			</p>
		{/if}
	</Popover.Content>
</Popover.Root>
