<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { FlickerSpinner } from '$lib/components/ui/flicker-spinner/index.js';
	import { Icon, Quote } from '$lib/icons';

	/**
	 * Loading Perpustakaan — bukan skeleton baris (UI loaded = list teks → skeleton-nya
	 * selalu terlihat seperti bar). Di sini: momen brand di tengah panel, sejalan empty
	 * state: badge + tumpukan index-card + FlickerSpinner + hint yang berganti.
	 */
	const HINTS = [
		'Menyusun daftar sitasi',
		'Menarik judul, penulis, dan DOI',
		'Sebentar lagi siap dibaca'
	] as const;

	const CARDS = [
		{ key: 'back', rotate: 'rotate-[-4deg]', tint: 'bg-lavender-soft/40', delay: '0ms' },
		{ key: 'mid', rotate: 'rotate-[2.5deg]', tint: 'bg-mint-soft/50', delay: '90ms' },
		{ key: 'front', rotate: 'rotate-[-1deg]', tint: 'bg-card', delay: '180ms' }
	] as const;

	let index = $state(0);
	const reduce = $derived(prefersReducedMotion.current);
	const cycle = $derived(!reduce);

	$effect(() => {
		if (!cycle) return;
		const id = setInterval(() => {
			index = (index + 1) % HINTS.length;
		}, 2200);
		return () => clearInterval(id);
	});

	const activeHint = $derived(HINTS[cycle ? index : 0] ?? HINTS[0]);
</script>

<div
	class="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center"
	role="status"
	aria-busy="true"
	aria-label="Memuat perpustakaan"
>
	<div
		class="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-background/70 py-2 pr-5 pl-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-sm"
	>
		<span
			class="grid size-7 place-items-center rounded-full bg-lavender-soft text-lavender-foreground ring-1 ring-lavender-soft-border ring-inset"
		>
			<Icon icon={Quote} class="size-4" />
		</span>
		<span class="font-heading text-base font-semibold text-foreground">Perpustakaan</span>
	</div>

	<div class="relative mt-10 h-[7.5rem] w-[13.5rem]" aria-hidden="true">
		{#each CARDS as card, i (card.key)}
			<!-- Outer keeps tilt; inner floats so translateY doesn't wipe rotate. -->
			<div
				class="absolute inset-x-0 top-0 mx-auto w-[12.5rem] {card.rotate}"
				style="z-index: {i + 1}"
			>
				<div
					class="library-load__card h-[5.75rem] rounded-lg border-2 border-border {card.tint}"
					style="--delay: {card.delay}"
				>
					<div class="flex h-full flex-col gap-2.5 p-3.5">
						<div class="flex items-center gap-2">
							<span class="size-2 rounded-full bg-mint/70"></span>
							<span class="h-2 w-10 rounded-full bg-foreground/12"></span>
							<span
								class="ml-auto h-4 w-12 rounded-full border border-border/80 bg-background/60"
							></span>
						</div>
						<span class="h-2.5 w-[78%] rounded-full bg-foreground/14"></span>
						<span class="h-2 w-[52%] rounded-full bg-foreground/10"></span>
						<span class="mt-auto h-1.5 w-[34%] rounded-full bg-foreground/8"></span>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<div class="mt-8 flex flex-col items-center gap-3">
		<FlickerSpinner class="size-6 text-muted-foreground" />
		<p class="font-heading text-[15px] font-semibold text-foreground">Mengumpulkan referensi</p>
		<div class="grid h-5 overflow-hidden">
			{#key activeHint}
				<p
					class="text-[13px] font-medium text-muted-foreground [grid-area:1/1]"
					in:fly={reduce ? { duration: 0 } : { y: 6, duration: 350 }}
					out:fly={reduce ? { duration: 0 } : { y: -6, duration: 350 }}
				>
					{activeHint}
				</p>
			{/key}
		</div>
	</div>
</div>

<style>
	.library-load__card {
		box-shadow: 0 3px 0 0 var(--border);
		animation: library-load-float 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
		animation-delay: var(--delay, 0ms);
	}

	@keyframes library-load-float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-5px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.library-load__card {
			animation: none;
		}
	}
</style>
