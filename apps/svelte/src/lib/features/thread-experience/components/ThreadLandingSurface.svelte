<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import ComposerHeroState from './ComposerHeroState.svelte';
	import type { Snippet } from 'svelte';

	let {
		compact = false,
		composer
	}: {
		compact?: boolean;
		composer: Snippet;
	} = $props();
</script>

<main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-background">
	<div
		class={cn(
			'relative mx-auto flex w-full flex-col',
			compact
				? 'max-w-none flex-1 px-5 pt-3 pb-8 @2xl:px-6'
				: 'min-h-full max-w-5xl shrink-0 px-4 pt-10 pb-5 @2xl:px-8'
		)}
	>
		<div class="flex w-full flex-1 items-center justify-center">
			<div class={cn('w-full', compact ? 'max-w-none' : 'max-w-3xl')}>
				<ComposerHeroState
					headerClass="mb-5 gap-2"
					logoClass={compact ? 'size-12 @2xl:size-18' : 'size-12 @2xl:size-22'}
					titleClass={cn(
						'font-heading leading-none font-bold tracking-tight text-foreground',
						compact ? 'text-xl' : 'text-3xl @2xl:text-4xl'
					)}
				>
					{@render composer()}
				</ComposerHeroState>
			</div>
		</div>
	</div>
</main>
