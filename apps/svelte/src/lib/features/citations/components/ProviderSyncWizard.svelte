<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import ProviderSyncWizardContent from './ProviderSyncWizardContent.svelte';

	/**
	 * Wizard "Tarik dari Mendeley/Zotero": pilih folder → preview → commit.
	 * Reuse `CitationImportPreviewStep` (checkbox + policy + commit) dari wizard import file — satu
	 * pipeline preview→commit. Koneksi provider dikelola di Settings → Integrasi.
	 */
	let {
		open,
		onOpenChange,
		onDone,
		workspaceId = null
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onDone: () => void;
		workspaceId?: string | null;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<ProviderSyncWizardContent {onOpenChange} {onDone} {workspaceId} />
	{/if}
</Dialog.Root>
