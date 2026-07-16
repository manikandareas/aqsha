<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	const SHELL_WIDTH = {
		prose: 'max-w-[44rem]',
		news: 'max-w-4xl',
		wide: 'max-w-5xl'
	} as const;

	let {
		width = 'prose',
		children
	}: {
		width?: keyof typeof SHELL_WIDTH;
		children: Snippet;
	} = $props();
</script>

<main class={cn('mx-auto w-full px-5 pb-24 pt-8 @2xl:px-6 @2xl:pt-10', SHELL_WIDTH[width])}>
	{@render children()}
</main>
