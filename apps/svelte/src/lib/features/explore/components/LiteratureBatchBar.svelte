<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, DownloadIcon, SaveIcon, XIcon } from '$lib/icons';
	import { useExportSearchSources } from '$lib/features/citations/api';
	import type { SearchSourceInput } from '$lib/features/citations/types';
	import BatchSaveSourcesDialog from './BatchSaveSourcesDialog.svelte';

	/** Sticky bar for batch actions on selected search results — save-to-library or export. */
	let {
		sources,
		onClear
	}: {
		sources: SearchSourceInput[];
		onClear: () => void;
	} = $props();

	let saveOpen = $state(false);
	const exportSources = useExportSearchSources();
</script>

{#if sources.length > 0}
	<div
		class="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-2 shadow-soft-card"
		role="toolbar"
		aria-label="Aksi sumber terpilih"
	>
		<span class="text-label font-medium">{sources.length} dipilih</span>
		<Button type="button" size="sm" class="gap-1.5" onclick={() => (saveOpen = true)}>
			<Icon icon={SaveIcon} class="size-3.5" />
			Simpan {sources.length} sumber
		</Button>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="outline"
						size="sm"
						class="gap-1.5"
						disabled={exportSources.isPending}
					>
						<Icon icon={DownloadIcon} class="size-3.5" /> Ekspor
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onSelect={() => exportSources.mutate({ format: 'bibtex', sources })}>
					BibTeX (.bib)
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => exportSources.mutate({ format: 'ris', sources })}>
					RIS (.ris)
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => exportSources.mutate({ format: 'csl-json', sources })}>
					CSL-JSON (.json)
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		<Button
			type="button"
			variant="ghost"
			size="icon"
			class="size-7"
			aria-label="Batal pilih"
			onclick={onClear}
		>
			<Icon icon={XIcon} class="size-4" />
		</Button>
	</div>

	<BatchSaveSourcesDialog bind:open={saveOpen} {sources} onSaved={onClear} />
{/if}
