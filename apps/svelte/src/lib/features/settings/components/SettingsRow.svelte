<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	// Full-bleed label/value row. Stack several inside `divide-y divide-border/60`.
	// Port from apps/web/features/settings/components/settings-card.tsx (SettingsRow).
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

<div
	class={cn(
		'flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 sm:px-6',
		className
	)}
>
	<div class="min-w-0">
		<p class="text-[13px] font-medium text-foreground">{label}</p>
		{#if description}
			<p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if children}
		<div class="shrink-0 text-[13px]">{@render children()}</div>
	{/if}
</div>
