<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import type { CitationDetail, ManualCitationFields } from '../types';
	import CitationFormContent from './CitationFormContent.svelte';

	/**
	 * Form referensi manual — dipakai "Tambah manual" (citation=null) dan "Edit"
	 * (citation terisi). Pola dialog konsisten `NameDialog` (submit async + error readable).
	 */
	let {
		open,
		citation,
		onOpenChange,
		onSubmit
	}: {
		open: boolean;
		citation: CitationDetail | null;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { fields: ManualCitationFields; tags: string[] }) => Promise<unknown>;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		{#key citation?.id ?? 'new'}
			<CitationFormContent {citation} {onOpenChange} {onSubmit} />
		{/key}
	{/if}
</Dialog.Root>
