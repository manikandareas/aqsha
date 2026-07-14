<script lang="ts">
	import type { Snippet } from 'svelte';
	import { magnetic } from '$lib/motion';
	import { cn } from '$lib/utils';

	// MagneticButton — membungkus child (biasanya `<Button>`) dalam div yang bergeser ke arah kursor
	// dalam `radius`, lalu balik. Reduced-motion di-hormati di attach `magnetic`. Port `magnetic-button.tsx`.
	let {
		children,
		class: className,
		radius,
		strength
	}: { children: Snippet; class?: string; radius?: number; strength?: number } = $props();

	const attach = $derived(magnetic({ radius, strength }));
</script>

<div {@attach attach} class={cn('inline-block', className)}>
	{@render children()}
</div>
