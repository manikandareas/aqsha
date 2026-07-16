<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import CitationImportWizardContent from './CitationImportWizardContent.svelte';

	/**
	 * Wizard import `.bib`/`.ris` (upload → preview → commit + summary) — Dialog
	 * multi-step di luar panel karena butuh lebar/fokus. Preview tidak menulis library;
	 * commit mengikuti checkbox + policy duplikat.
	 */
	let {
		workspaceId,
		open,
		onOpenChange,
		onDone
	}: {
		workspaceId: string;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onDone: () => void;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<CitationImportWizardContent {workspaceId} {onOpenChange} {onDone} />
	{/if}
</Dialog.Root>
