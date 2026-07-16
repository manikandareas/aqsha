<script lang="ts">
	import { Icon, InfoIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import * as Tooltip from '@aqsha/ui-svelte/components/tooltip';

	/**
	 * Quiet footnote pinned to the bottom of the board. Teaches the gesture (1× context, 2× open); when
	 * items are selected the right side flips to a count + clear action. `@container` (not viewport)
	 * drives which hints hide on a narrow panel; the 3rd hint + the supplementary copy are delegated to
	 * the InfoIcon tooltip.
	 */
	type Hint = { chip: string; label: string };

	let {
		contextCount = 0,
		onClearContext
	}: {
		contextCount?: number;
		onClearContext?: () => void;
	} = $props();

	// Single source for the three hints — rendered inline (wide) and inside the tooltip (narrow),
	// so the copy lives once.
	const hints: Hint[] = [
		{ chip: '1×', label: 'Jadikan konteks' },
		{ chip: '2×', label: 'Buka' },
		{ chip: 'Seret', label: 'Pilih banyak' }
	];
	const hasContext = $derived(contextCount > 0);
</script>

{#snippet hintItem(chip: string, label: string, as: 'li' | 'span', className?: string)}
	<svelte:element
		this={as}
		class={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}
	>
		<kbd
			class="inline-flex h-[18px] items-center rounded-[5px] border border-border/80 bg-muted/50 px-1.5 font-mono text-[10px] font-medium leading-none text-foreground/65"
		>
			{chip}
		</kbd>
		<span>{label}</span>
	</svelte:element>
{/snippet}

{#snippet hintDivider(className?: string)}
	<span aria-hidden="true" class={cn('text-muted-foreground/30', className)}>·</span>
{/snippet}

<footer
	aria-label="Panduan interaksi"
	class="@container flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-background/85 px-5 py-2 backdrop-blur-sm sm:px-6"
>
	<ul class="flex min-w-0 items-center gap-x-2.5 text-[11px] leading-none text-muted-foreground">
		<li class="inline-flex items-center text-muted-foreground/60">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label="Lihat panduan interaksi"
							class="inline-flex items-center rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Icon icon={InfoIcon} class="size-3.5" />
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content
					side="top"
					align="start"
					class="flex max-w-[17rem] flex-col items-start gap-2 py-2"
				>
					<p class="text-[11px] leading-snug text-background/80">
						Item konteks ikut terkirim saat kamu bertanya ke Astra.
					</p>
					<div class="flex flex-col gap-1.5">
						{#each hints as hint (hint.label)}
							{@render hintItem(hint.chip, hint.label, 'span')}
						{/each}
					</div>
				</Tooltip.Content>
			</Tooltip.Root>
		</li>
		{@render hintItem(hints[0].chip, hints[0].label, 'li')}
		{@render hintDivider()}
		{@render hintItem(hints[1].chip, hints[1].label, 'li')}
		{@render hintDivider('hidden @lg:inline')}
		{@render hintItem(hints[2].chip, hints[2].label, 'li', 'hidden @lg:inline-flex')}
	</ul>

	{#if hasContext}
		<div class="inline-flex shrink-0 items-center gap-2 text-[11px] leading-none">
			<span class="inline-flex items-center gap-1.5 font-medium text-foreground">
				<span class="size-1.5 rounded-full bg-primary"></span>
				{contextCount} konteks
			</span>
			{#if onClearContext}
				<button
					type="button"
					onclick={onClearContext}
					class="rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					Bersihkan
				</button>
			{/if}
		</div>
	{/if}
</footer>
