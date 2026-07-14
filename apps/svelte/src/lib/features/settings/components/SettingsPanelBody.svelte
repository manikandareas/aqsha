<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	// Port from apps/web/features/settings/components/settings-card.tsx (SettingsPanelBody).
	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<div class={cn('px-5 py-5 sm:px-6', className)}>
	{@render children()}
</div>
