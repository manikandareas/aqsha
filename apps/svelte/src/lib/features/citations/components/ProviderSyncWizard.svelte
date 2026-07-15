<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import ProviderSyncWizardContent from './ProviderSyncWizardContent.svelte';

	/**
	 * Wizard "Tarik dari Mendeley/Zotero": pilih folder → preview → commit.
	 * Reuse `CitationImportPreviewStep` (checkbox + policy + commit) dari wizard import file — satu
	 * pipeline preview→commit. Koneksi provider dikelola di Settings → Integrasi.
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
		<ProviderSyncWizardContent {workspaceId} {onOpenChange} {onDone} />
	{/if}
</Dialog.Root>
