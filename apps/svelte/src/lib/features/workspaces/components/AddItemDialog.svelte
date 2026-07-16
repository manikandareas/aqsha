<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import AddItemDialogContent from './AddItemDialogContent.svelte';

	/** Content mounted only while open so the URL draft resets each open. */
	let {
		open,
		folderName,
		onOpenChange,
		onSubmit,
		onUploadFiles
	}: {
		open: boolean;
		folderName?: string;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { url: string; title?: string }) => Promise<unknown>;
		onUploadFiles: (files: File[]) => void;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<AddItemDialogContent {folderName} {onOpenChange} {onSubmit} {onUploadFiles} />
	{/if}
</Dialog.Root>
