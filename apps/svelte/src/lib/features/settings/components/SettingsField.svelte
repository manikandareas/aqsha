<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	let {
		label,
		description,
		children,
		class: className
	}: {
		label: string;
		description?: string;
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<div class={cn('grid gap-2', className)}>
	<div>
		<p class="text-[13px] font-medium text-foreground">{label}</p>
		{#if description}
			<p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
		{/if}
	</div>
	{@render children?.()}
</div>
