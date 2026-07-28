<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reveal } from '$lib/motion';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { PLAN_CATALOG, type PublicPlanKey } from '$lib/plan/catalog';
	import {
		planFeatureRows,
		planPresentation,
		priceFootnote,
		priceLabel,
		receiptClipPath,
		type Billing
	} from '../pricing';
	import PriceOdometer from './PriceOdometer.svelte';

	// PlanReceipt — satu plan sebagai struk jujur: mono, paper-grain, dotted leaders, ekor zigzag.
	// Signature: line items "print" top-to-bottom saat masuk viewport; total flip per periode
	// (PriceOdometer). Resting tilt + hover mengangkat (lurus + naik).
	let {
		planKey,
		billing,
		tilt,
		delay
	}: { planKey: PublicPlanKey; billing: Billing; tilt: number; delay: number } = $props();

	const plan = $derived(PLAN_CATALOG[planKey]);
	const presentation = $derived(planPresentation[planKey]);
	const features = $derived(planFeatureRows(planKey));
	const highlight = $derived(presentation.badge === 'populer');

	const label = $derived(priceLabel(planKey, billing));
	const footnote = $derived(priceFootnote(planKey, billing));
	const totalLabel = $derived(billing === 'monthly' ? 'Total / bln' : 'Total / thn');

	const revealOnce = reveal();
</script>

{#snippet receiptRow(rowLabel: string, valueSnippet: Snippet, strong = false)}
	<div class="flex items-baseline gap-2 py-1.5 text-[13px]">
		<span class={strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}
			>{rowLabel}</span
		>
		<span
			aria-hidden="true"
			class="mb-[3px] min-w-3 flex-1 self-end border-b border-dotted border-border"
		></span>
		<span class={cn('text-right', strong ? 'font-semibold text-foreground' : 'text-foreground')}>
			{@render valueSnippet()}
		</span>
	</div>
{/snippet}

<div
	class={cn(
		'group/receipt relative flex flex-col border bg-background pb-8 font-mono opacity-0 [transform:rotate(var(--tilt))] transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:[transform:rotate(0deg)_translateY(-4px)] data-[inview]:opacity-100 motion-reduce:opacity-100',
		highlight ? 'border-foreground/50' : 'border-border'
	)}
	style:--tilt="{tilt}deg"
	style:clip-path={receiptClipPath}
	style:transition-delay="{delay}ms"
	{@attach revealOnce}
>
	<div class="paper-grain pointer-events-none absolute inset-0"></div>

	<!-- Receipt header -->
	<div class="px-5 pb-4 pt-6 text-center sm:px-6">
		<p class="text-base font-semibold text-foreground">
			{plan.label}
			{#if presentation.badge}
				<span class="font-normal text-muted-foreground"> · {presentation.badge}</span>
			{/if}
		</p>
		<p class="mt-1 text-xs text-muted-foreground">
			{presentation.includes ?? 'struk harga · tanpa kejutan'}
		</p>
	</div>
	<div class="mx-5 border-t border-dashed border-border sm:mx-6"></div>

	<!-- Line items — "print" in when the receipt scrolls into view -->
	<div class="px-5 pt-3 sm:px-6">
		{#each features as feature, i (feature.label)}
			<div
				class="opacity-0 -translate-y-1.5 transition-[opacity,transform] duration-200 group-data-[inview]/receipt:translate-y-0 group-data-[inview]/receipt:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100"
				style:transition-delay="{delay + i * 50}ms"
			>
				{#snippet featureValue()}{feature.value}{/snippet}
				{@render receiptRow(feature.label, featureValue)}
			</div>
		{/each}
	</div>

	<!-- Stable tail: total (odometer) + CTA pinned to the bottom -->
	<div class="mt-auto px-5 pt-3 sm:px-6">
		<div class="border-t border-dashed border-border"></div>
		<div class="flex items-baseline justify-between gap-2 pt-3">
			<span class="whitespace-nowrap text-[13px] font-semibold text-foreground">{totalLabel}</span>
			<span class="whitespace-nowrap text-base font-semibold text-foreground xl:text-lg">
				<PriceOdometer {label} />
			</span>
		</div>
		<p class="pb-1 text-right text-xs text-muted-foreground">{footnote}</p>
		<div class="pt-4">
			<Button
				href={presentation.href}
				variant={highlight ? 'default' : 'outline'}
				class="font-sans h-11 w-full rounded-full text-sm font-medium"
			>
				{presentation.cta}
			</Button>
			<p class="pt-4 text-center text-xs text-muted-foreground">· · · terima kasih · · ·</p>
		</div>
	</div>
</div>
