<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import NewProjectDialogContent from './NewProjectDialogContent.svelte';

	/**
	 * Dialog proyek baru tanpa friksi: jenis → topik kasar; judul & tenggat opsional. Proyek lahir
	 * di tahap eksplorasi (default backend) lalu langsung dibuka. Reused by the sidebar's own
	 * "Proyek baru" entry point.
	 */
	let {
		open,
		onOpenChange
	}: { open: boolean; onOpenChange: (open: boolean) => void } = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<NewProjectDialogContent {onOpenChange} />
	{/if}
</Dialog.Root>
