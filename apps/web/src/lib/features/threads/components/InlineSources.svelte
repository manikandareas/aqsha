<script lang="ts">
	import { Icon, ChevronDownIcon, ChevronRightIcon, Link2Icon } from '$lib/icons';
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import { cn } from '@aqsha/ui-svelte/utils';
	import type { SourceCardData } from '../lib/timeline-types';
	import SourcesPanel from './SourcesPanel.svelte';

	/**
	 * Sumber per-turn di bawah jawaban. Bila ada slot panel (`onOpen`) → tampil sebagai TRIGGER
	 * tunggal "N sumber" yang membuka panel daftar sumber (tiap item → URL aslinya). Tanpa slot
	 * (panel chat compact) → fallback collapsible inline lama (`SourcesPanel`). Pemanggil menyiapkan
	 * kartu; kosong → tak render.
	 */
	let {
		sources,
		onOpen,
		class: className
	}: {
		sources: SourceCardData[];
		onOpen?: () => void;
		class?: string;
	} = $props();

	// Jumlah tak bergantung urutan sitasi; `SourcesPanel` yang menyortir untuk tampilan.
	const count = $derived(sources.length);
</script>

{#if count > 0}
	{#if onOpen}
		<button
			type="button"
			onclick={onOpen}
			class={cn(
				'group -mx-1.5 flex items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-left text-muted-foreground text-xs transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				className
			)}
		>
			<Icon icon={Link2Icon} class="size-3.5 shrink-0" />
			<span class="font-medium">{count} sumber</span>
			<Icon
				icon={ChevronRightIcon}
				class="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
			/>
		</button>
	{:else}
		<Collapsible.Root class={cn('min-w-0', className)}>
			<Collapsible.Trigger
				class="group flex items-center gap-1.5 text-left text-muted-foreground text-xs transition-colors hover:text-foreground"
			>
				<Icon icon={Link2Icon} class="size-3.5 shrink-0" />
				<span class="font-medium">{count} sumber</span>
				<Icon
					icon={ChevronDownIcon}
					class="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
				/>
			</Collapsible.Trigger>
			<Collapsible.Content>
				<SourcesPanel {sources} class="mt-2" />
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
{/if}
