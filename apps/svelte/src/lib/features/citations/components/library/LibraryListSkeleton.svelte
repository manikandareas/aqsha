<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Loading Perpustakaan — grid skeleton yang mencerminkan kartu index berwarna,
	 * supaya layout tidak “melompat” ke baris teks saat data datang.
	 */
	const PLACEHOLDERS = [
		'bg-[oklch(0.42_0.048_145)]',
		'bg-[oklch(0.38_0.055_305)]',
		'bg-[oklch(0.36_0.012_70)]',
		'bg-[oklch(0.4_0.04_55)]',
		'bg-[oklch(0.4_0.035_210)]',
		'bg-[oklch(0.39_0.045_25)]',
		'bg-[oklch(0.42_0.048_145)]',
		'bg-[oklch(0.38_0.055_305)]',
		'bg-[oklch(0.36_0.012_70)]',
		'bg-[oklch(0.4_0.04_55)]'
	] as const;

	const reduce = $derived(prefersReducedMotion.current);
</script>

<div
	class="grid grid-cols-1 gap-4 px-5 pt-4 pb-8 @md:grid-cols-2 @2xl:gap-5 @2xl:px-6 @3xl:grid-cols-3 @5xl:grid-cols-4 @[84rem]:grid-cols-5"
	role="status"
	aria-busy="true"
	aria-label="Memuat perpustakaan"
>
	{#each PLACEHOLDERS as tone, i (i)}
		<div
			class={cn(
				'flex aspect-[7/9] min-h-[270px] flex-col overflow-hidden rounded-[20px] border-2 border-transparent p-5 @lg:min-h-[330px]',
				tone,
				!reduce && 'library-skel__card'
			)}
			style={!reduce ? `--delay: ${i * 40}ms` : undefined}
		>
			<div class="flex items-center gap-2">
				<Skeleton class="h-5 w-11 rounded-full bg-white/20" />
				<Skeleton class="h-3 w-10 rounded-full bg-white/15" />
				<Skeleton class="h-3 w-20 rounded-full bg-white/15" />
			</div>
			<div class="mt-5 space-y-2.5">
				<Skeleton class="h-4 w-[92%] rounded-md bg-white/20" />
				<Skeleton class="h-4 w-[78%] rounded-md bg-white/18" />
				<Skeleton class="h-4 w-[64%] rounded-md bg-white/15" />
			</div>
			<div class="mt-4 space-y-2">
				<Skeleton class="h-3 w-[70%] rounded-full bg-white/12" />
				<Skeleton class="h-3 w-[48%] rounded-full bg-white/10" />
			</div>
			<div class="mt-auto flex items-center justify-between pt-8">
				<Skeleton class="h-3.5 w-10 rounded-full bg-white/15" />
				<Skeleton class="size-5 rounded-full bg-white/15" />
			</div>
		</div>
	{/each}
</div>

<style>
	.library-skel__card {
		animation: library-skel-fade 1.1s cubic-bezier(0.45, 0, 0.55, 1) infinite;
		animation-delay: var(--delay, 0ms);
	}

	@keyframes library-skel-fade {
		0%,
		100% {
			opacity: 0.72;
		}
		50% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.library-skel__card {
			animation: none;
		}
	}
</style>
