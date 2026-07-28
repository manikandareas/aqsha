<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	type EyebrowTone = 'neutral' | 'mint' | 'lemon';
	const EYEBROW_TONE: Record<EyebrowTone, string> = {
		neutral: 'border-border/70 bg-muted/50 text-foreground/80',
		mint: 'border-mint-soft-border bg-mint-soft text-mint-foreground',
		lemon: 'border-lemon-soft-border bg-lemon-soft text-lemon-foreground'
	};

	/** Tag eyebrow — sentence case (TIDAK uppercase, sesuai aturan brand). */
	let {
		tone = 'neutral',
		icon,
		children
	}: {
		tone?: EyebrowTone;
		icon?: Snippet;
		children: Snippet;
	} = $props();
</script>

<span
	class={cn(
		'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight',
		EYEBROW_TONE[tone]
	)}
>
	{@render icon?.()}
	{@render children()}
</span>
