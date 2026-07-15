<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import CitationDoiContent from './CitationDoiContent.svelte';

	/**
	 * Tambah referensi dari DOI — resolver metadata berjalan di API. Duplikat (409)
	 * ditawarkan "tambah tetap" (allowDuplicate) alih-alih buntu.
	 */
	let {
		open,
		onOpenChange,
		onSubmit
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { doi: string; allowDuplicate?: boolean }) => Promise<unknown>;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<CitationDoiContent {onOpenChange} {onSubmit} />
	{/if}
</Dialog.Root>
