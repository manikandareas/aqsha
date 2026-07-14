<script lang="ts" module>
	export type ErrorStateAction = { label: string } & (
		| { href: string; onClick?: never; behavior?: never }
		| { href?: never; onClick: () => void; behavior?: never }
		| { href?: never; onClick?: never; behavior: 'back' }
	);
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, type ButtonVariant } from '$lib/components/ui/button';

	// Port `apps/web/components/error-state-page.tsx`. Layout + CSS (`.aqsha-error-state-*` golden CSS)
	// dipertahankan. Dipakai root `+error.svelte` (404 + generic). `<img>` menggantikan next/image.
	let {
		eyebrow,
		title,
		description,
		imageSrc,
		imageAlt,
		primaryAction,
		secondaryAction,
		referenceCode
	}: {
		eyebrow: string;
		title: string;
		description: string;
		imageSrc: string;
		imageAlt: string;
		primaryAction: ErrorStateAction;
		secondaryAction: ErrorStateAction;
		referenceCode?: string;
	} = $props();

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) {
			history.back();
			return;
		}
		void goto(resolve('/app'));
	}
</script>

{#snippet actionButton(action: ErrorStateAction, variant: ButtonVariant = 'default')}
	{#if action.href}
		<Button
			{variant}
			class="aqsha-error-state-action h-10 px-4 active:scale-[0.98]"
			href={action.href}
		>
			{action.label}
		</Button>
	{:else if action.behavior === 'back'}
		<Button
			{variant}
			class="aqsha-error-state-action h-10 px-4 active:scale-[0.98]"
			onclick={goBack}
		>
			{action.label}
		</Button>
	{:else}
		<Button
			{variant}
			class="aqsha-error-state-action h-10 px-4 active:scale-[0.98]"
			onclick={action.onClick}
		>
			{action.label}
		</Button>
	{/if}
{/snippet}

<main
	class="aqsha-error-state-page h-svh overflow-hidden bg-background px-5 py-6 text-foreground sm:px-8 sm:py-8 lg:px-12 lg:py-10"
>
	<section
		class="mx-auto grid h-full min-h-0 w-full max-w-6xl grid-rows-[minmax(0,0.9fr)_auto] items-center gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-16"
	>
		<div
			class="order-1 mx-auto flex min-h-0 w-full max-w-[min(58vw,230px)] items-center justify-center sm:max-w-[280px] lg:order-2 lg:max-w-[min(42vw,520px)]"
		>
			<img
				alt={imageAlt}
				class="h-auto max-h-[36svh] w-full select-none object-contain lg:max-h-[calc(100svh-5rem)]"
				sizes="(min-width: 1024px) 520px, (min-width: 640px) 420px, calc(100vw - 48px)"
				src={imageSrc}
			/>
		</div>

		<div
			class="order-2 flex min-h-0 max-w-2xl flex-col items-start gap-5 self-start lg:order-1 lg:self-center"
		>
			<div class="space-y-3">
				<p class="text-sm font-medium text-muted-foreground">{eyebrow}</p>
				<h1
					class="max-w-xl text-balance text-3xl font-semibold leading-tight tracking-normal sm:text-4xl lg:text-5xl"
				>
					{title}
				</h1>
				<p
					class="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7 lg:text-lg"
				>
					{description}
				</p>
			</div>

			{#if referenceCode}
				<p
					class="font-mono rounded-md border border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground"
				>
					Kode bantuan: {referenceCode}
				</p>
			{/if}

			<div class="flex flex-wrap gap-3">
				{@render actionButton(primaryAction)}
				{@render actionButton(secondaryAction, 'outline')}
			</div>
		</div>
	</section>
</main>
