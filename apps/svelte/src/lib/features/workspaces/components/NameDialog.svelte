<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import NameDialogContent from './NameDialogContent.svelte';

	/**
	 * Name dialog — port `apps/web/features/workspaces/components/workspace-dialogs.tsx` `NameDialog`.
	 * Content mounted only while `open` (+ keyed on `initialName`) so each open seeds a fresh draft
	 * (padanan web `key={initialName}` remount-on-open).
	 */
	let {
		open,
		title,
		description,
		submitLabel,
		initialName = '',
		onOpenChange,
		onSubmit
	}: {
		open: boolean;
		title: string;
		description: string;
		submitLabel: string;
		initialName?: string;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { name: string }) => Promise<unknown>;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		{#key initialName}
			<NameDialogContent
				{title}
				{description}
				{submitLabel}
				{initialName}
				{onOpenChange}
				{onSubmit}
			/>
		{/key}
	{/if}
</Dialog.Root>
