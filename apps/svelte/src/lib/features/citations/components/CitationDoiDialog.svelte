<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import CitationDoiContent from './CitationDoiContent.svelte';

	/**
	 * Tambah referensi dari DOI — resolver metadata berjalan di API. Duplikat (409)
	 * ditawarkan "tambah tetap" (allowDuplicate) alih-alih buntu.
	 */
	let {
		open,
		onOpenChange,
		onSubmit,
		prefill = null
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { doi: string; allowDuplicate?: boolean }) => Promise<unknown>;
		/** DOI hasil "Tempel DOI"; isi awal input, bukan nilai terkunci. */
		prefill?: string | null;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<CitationDoiContent {onOpenChange} {onSubmit} {prefill} />
	{/if}
</Dialog.Root>
