<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { CheckIcon, Icon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { getAuthState } from '$lib/auth';
	import { useCitationSettings, useUpdateCitationSettings } from '../api';
	import { BIBLIOGRAPHY_SORT_OPTIONS, CITATION_STYLE_OPTIONS } from '../types';

	/**
	 * Pengaturan sitasi workspace: style default (re-render semua preview/copy) +
	 * urutan bibliography. Perubahan tersimpan langsung (tanpa tombol simpan).
	 */
	let {
		workspaceId,
		open,
		onOpenChange
	}: {
		workspaceId: string;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	} = $props();

	const auth = getAuthState();
	const settings = useCitationSettings(
		() => workspaceId,
		() => auth.isSignedIn
	);
	const update = useUpdateCitationSettings(() => workspaceId);
</script>

{#snippet optionRow(label: string, selected: boolean, onSelect: () => void)}
	<button
		type="button"
		disabled={update.isPending}
		onclick={onSelect}
		class={cn(
			'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors',
			selected
				? 'border-primary/40 bg-primary/5 text-foreground'
				: 'border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
		)}
	>
		{label}
		{#if selected}
			<Icon icon={CheckIcon} class="size-3.5 text-primary" />
		{/if}
	</button>
{/snippet}

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Gaya sitasi workspace</Dialog.Title>
			<Dialog.Description>
				Style default dipakai untuk aksi salin sitasi, preview, dan bibliography. Mengganti style
				me-render ulang seluruh sitasi dengan aman.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			<div class="grid gap-1.5">
				<span class="text-[12px] font-semibold text-foreground">Style</span>
				<div class="grid gap-1">
					{#each CITATION_STYLE_OPTIONS as style (style.id)}
						{@render optionRow(style.label, settings.data?.defaultStyleId === style.id, () =>
							update.mutate({ defaultStyleId: style.id })
						)}
					{/each}
				</div>
			</div>
			<div class="grid gap-1.5">
				<span class="text-[12px] font-semibold text-foreground">Urutan bibliography</span>
				<div class="grid gap-1">
					{#each BIBLIOGRAPHY_SORT_OPTIONS as sort (sort.id)}
						{@render optionRow(sort.label, settings.data?.bibliographySort === sort.id, () =>
							update.mutate({ bibliographySort: sort.id })
						)}
					{/each}
				</div>
			</div>
		</div>
		<Dialog.Footer>
			<Button type="button" variant="secondary" onclick={() => onOpenChange(false)}>Selesai</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
