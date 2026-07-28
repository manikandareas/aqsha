<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon } from '$lib/icons';
	import { CATEGORY_META } from '../lib/categories';
	import type { ChangelogCategory } from '../types';

	let { category }: { category: ChangelogCategory } = $props();

	const meta = $derived(CATEGORY_META[category]);
</script>

{#if meta}
	<span
		class={cn(
			'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none',
			meta.className
		)}
	>
		<Icon icon={meta.icon} class="size-3" aria-hidden="true" />
		{meta.label}
	</span>
{/if}
