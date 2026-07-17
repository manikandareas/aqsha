<script lang="ts">
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, LayersIcon, Trash2Icon, XIcon } from '$lib/icons';
	import CitationExportMenu from '../CitationExportMenu.svelte';

	/** Bar aksi massal saat mode pilih aktif. Merge butuh ≥2; target dipilih server (terlengkap). */
	let {
		ids,
		onTag,
		onMerge,
		onDelete,
		onClear
	}: {
		ids: string[];
		onTag: (tags: string[]) => void;
		onMerge: () => void;
		onDelete: () => void;
		onClear: () => void;
	} = $props();

	let tagOpen = $state(false);
	let tagDraft = $state('');

	function submitTags(event: SubmitEvent) {
		event.preventDefault();
		const tags = tagDraft
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (tags.length === 0) return;
		onTag(tags);
		tagDraft = '';
		tagOpen = false;
	}
</script>

<div
	class="sticky bottom-4 mx-auto flex w-fit items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-2 shadow-soft-card"
	role="toolbar"
	aria-label="Aksi referensi terpilih"
>
	<span class="text-label font-medium">{ids.length} dipilih</span>
	<Popover.Root bind:open={tagOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} type="button" variant="outline" size="sm">Beri tag</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="grid w-64 gap-2">
			<form class="grid gap-2" onsubmit={submitTags}>
				<label class="text-label font-medium" for="bulk-tags">Tag (pisahkan koma)</label>
				<Input id="bulk-tags" bind:value={tagDraft} placeholder="metodologi, bab-2" />
				<Button type="submit" size="sm">Terapkan</Button>
			</form>
		</Popover.Content>
	</Popover.Root>
	<CitationExportMenu {ids} />
	<Button
		type="button"
		variant="outline"
		size="sm"
		class="gap-1.5"
		disabled={ids.length < 2}
		onclick={onMerge}
	>
		<Icon icon={LayersIcon} class="size-3.5" /> Gabungkan
	</Button>
	<Button
		type="button"
		variant="outline"
		size="sm"
		class="gap-1.5 text-destructive"
		onclick={onDelete}
	>
		<Icon icon={Trash2Icon} class="size-3.5" /> Hapus
	</Button>
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
