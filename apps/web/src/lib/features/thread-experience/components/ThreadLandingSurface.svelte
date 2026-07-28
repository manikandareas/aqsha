<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { viewerContext } from '$lib/auth';
	import { threadTranscriptColumnClass } from '$lib/components/layout/panel-surface';
	import ComposerHeroState from './ComposerHeroState.svelte';
	import { landingGreeting } from '../utils/landing-greeting';
	import type { Snippet } from 'svelte';

	let {
		compact = false,
		composer
	}: {
		compact?: boolean;
		composer: Snippet;
	} = $props();

	const viewer = viewerContext.get();
	const name = $derived(viewer.display({ name: '', email: '' }).name);
	const firstName = $derived(name.trim().split(/\s+/)[0] ?? '');
	let localHour = $state<number | null>(null);
	const greeting = $derived(
		localHour === null
			? firstName
				? `Halo, ${firstName}`
				: 'Halo'
			: landingGreeting(firstName, localHour)
	);

	onMount(() => {
		localHour = new Date().getHours();
	});
</script>

{#if compact}
	<main
		class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-background"
	>
		<div class="mx-auto flex min-h-full w-full flex-1 flex-col">
			<div class="flex min-h-0 flex-1 flex-col justify-end">
				<div class={cn(threadTranscriptColumnClass, 'flex shrink-0 flex-col gap-3 pb-4 pt-2.5')}>
					<header class="flex flex-col gap-1.5" aria-live="polite">
						<img src="/logo.svg" alt="" class="size-14 shrink-0 @2xl:size-16" />
						<h1
							class="font-heading text-balance text-xl leading-tight font-bold tracking-tight text-foreground @2xl:text-2xl"
						>
							{greeting}
						</h1>
						<p class="max-w-md text-control leading-5 text-muted-foreground">
							Ada beberapa hal yang bisa kita kerjakan di proyek ini.
						</p>
					</header>
					{@render composer()}
				</div>
			</div>
		</div>
	</main>
{:else}
	<main
		class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-background"
	>
		<div
			class="relative mx-auto flex min-h-full w-full max-w-5xl shrink-0 flex-col px-4 pt-10 pb-5 @2xl:px-8"
		>
			<div class="flex w-full flex-1 items-center justify-center">
				<div class="w-full max-w-3xl">
					<ComposerHeroState
						headerClass="mb-5 gap-2"
						logoClass="size-12 @2xl:size-22"
						titleClass="font-heading text-3xl leading-none font-bold tracking-tight text-foreground @2xl:text-4xl"
					>
						{@render composer()}
					</ComposerHeroState>
				</div>
			</div>
		</div>
	</main>
{/if}
