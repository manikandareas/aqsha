<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Empty-thread hero — brand mark + heading over the rich composer (static `/logo.svg` mark).
	 */
	let {
		title = 'Apa yang ingin kita teliti?',
		logoClass = 'size-12 @2xl:size-14',
		titleClass = 'font-heading text-2xl leading-none font-bold tracking-tight text-foreground @2xl:text-3xl',
		headerClass,
		children,
		hint
	}: {
		title?: string;
		logoClass?: string;
		titleClass?: string;
		headerClass?: string;
		children: Snippet;
		hint?: Snippet;
	} = $props();
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 text-center">
	<header
		class={cn('mb-4 flex flex-col items-center justify-center gap-2 text-center', headerClass)}
	>
		<div class="flex items-center justify-center gap-2">
			<img src="/logo.svg" alt="" class={cn('shrink-0', logoClass)} />
			<h1 class={titleClass}>{title}</h1>
		</div>
	</header>
	<div class="w-full">{@render children()}</div>
	{#if hint}
		<p class="max-w-sm text-label leading-5 text-muted-foreground">{@render hint()}</p>
	{/if}
</div>
