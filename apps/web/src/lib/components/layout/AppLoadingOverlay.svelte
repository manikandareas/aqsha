<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { FlickerSpinner } from '$lib/components/ui/flicker-spinner/index.js';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Full-app / region loading surface. FlickerSpinner + a label with rotating hints that cycle
	 * every 2.2s (paused under reduced motion). `variant="fixed"` covers the viewport (full-app
	 * gate); `variant="absolute"` fills the nearest positioned ancestor (a single page region).
	 * Rotating hints crossfade in place — both lines share one grid cell (`[grid-area:1/1]`) inside a
	 * fixed `h-5` clip so they overlap rather than stacking; collapses to no motion when reduced.
	 */
	type Props = {
		/** Primary line, shown larger and centered. */
		label?: string;
		/** Optional rotating hints below the label. Cycles when more than one. */
		messages?: string[];
		/** `fixed` covers the whole viewport; `absolute` fills the nearest positioned ancestor. */
		variant?: 'fixed' | 'absolute';
		class?: string;
	};

	const DEFAULT_MESSAGES = [
		'Menyiapkan ruang kerja kamu',
		'Menautkan catatan dan sumber',
		'Sebentar lagi siap'
	];

	let {
		label = 'Memuat',
		messages = DEFAULT_MESSAGES,
		variant = 'fixed',
		class: className
	}: Props = $props();

	let index = $state(0);
	const reduce = $derived(prefersReducedMotion.current);
	const cycle = $derived(messages.length > 1 && !reduce);

	$effect(() => {
		if (!cycle) return;
		const total = messages.length;
		const id = setInterval(() => {
			index = (index + 1) % total;
		}, 2200);
		return () => clearInterval(id);
	});

	const activeMessage = $derived(messages[cycle ? index : 0] ?? '');
</script>

<output
	aria-live="polite"
	aria-label={label}
	class={cn(
		'z-50 flex w-full items-center justify-center bg-background/80 backdrop-blur-md',
		variant === 'fixed' ? 'fixed inset-0' : 'absolute inset-0',
		className
	)}
>
	<div class="flex flex-col items-center gap-5 px-6 text-center">
		<FlickerSpinner class="size-7 text-muted-foreground" />

		<div class="flex flex-col items-center gap-2">
			<p class="font-heading text-lg font-semibold text-foreground">{label}</p>
			<div class="grid h-5 overflow-hidden">
				{#key activeMessage}
					<p
						class="text-sm text-muted-foreground [grid-area:1/1]"
						in:fly={reduce ? { duration: 0 } : { y: 6, duration: 350 }}
						out:fly={reduce ? { duration: 0 } : { y: -6, duration: 350 }}
					>
						{activeMessage}
					</p>
				{/key}
			</div>
		</div>
	</div>
</output>
