<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	// Port from apps/web/features/settings/components/settings-card.tsx (SettingsPanel).
	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<section class={cn('overflow-hidden rounded-xl border border-border/70 bg-card', className)}>
	{@render children()}
</section>
