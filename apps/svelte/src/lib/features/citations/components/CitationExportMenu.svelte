<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { DownloadIcon, Icon } from '$lib/icons';
	import { useExportCitations } from '../api';

	/**
	 * Export perpustakaan akun ke BibTeX / RIS / CSL-JSON (unduh file). Tanpa `ids` = seluruh
	 * perpustakaan (toolbar); dengan `ids` = hanya yang terpilih (bulk bar seleksi).
	 */
	let {
		disabled,
		ids
	}: {
		disabled?: boolean;
		ids?: string[];
	} = $props();

	const exportCitations = useExportCitations();
	const scoped = $derived(ids?.length ? { ids } : {});
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="ghost"
				class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label={ids ? 'Export referensi terpilih' : 'Export referensi'}
				disabled={disabled || exportCitations.isPending}
			>
				<Icon icon={DownloadIcon} class="size-3.5" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onSelect={() => exportCitations.mutate({ format: 'bibtex', ...scoped })}>
			BibTeX (.bib)
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => exportCitations.mutate({ format: 'ris', ...scoped })}>
			RIS (.ris)
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => exportCitations.mutate({ format: 'csl-json', ...scoped })}>
			CSL-JSON (.json)
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
