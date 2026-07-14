<script lang="ts">
	import { mapRange, motionContext, scrollProgress } from '$lib/motion';
	import { cn } from '$lib/utils';
	import FrameChrome from './FrameChrome.svelte';

	// FeatureFrame — frame gambar editorial besar di bawah copy tiap fitur. Signature: "foto diluruskan
	// di meja" — masuk sedikit miring lalu scroll-linked lurus (rotate→0, y 32→0) + parallax internal +
	// hover zoom. Port `feature-frame.tsx` (`useScroll`/`useTransform` → scrollProgress + mapRange).
	let {
		image,
		alt,
		aspectClassName,
		sizes,
		initialRotate = 0,
		priority = false,
		class: className
	}: {
		image: string;
		alt: string;
		/** Utility aspect, mis. "aspect-[16/10]". */
		aspectClassName: string;
		/** `sizes` per placement. */
		sizes: string;
		/** Tilt awal (derajat); frame lurus ke 0 saat scroll masuk. */
		initialRotate?: number;
		priority?: boolean;
		class?: string;
	} = $props();

	const motion = motionContext.get();
	const reduce = $derived(motion.reducedMotion);

	// Lurus + naik saat frame bergerak dari bawah viewport ke 40%.
	let settle = $state(0);
	// Parallax internal lambat sepanjang perjalanan frame.
	let journey = $state(0);

	const settleAttach = scrollProgress(['start end', 'start 0.4'], (p) => (settle = p));
	const journeyAttach = scrollProgress(['start end', 'end start'], (p) => (journey = p));

	const rotate = $derived(mapRange(settle, [0, 1], [initialRotate, 0]));
	const y = $derived(mapRange(settle, [0, 1], [32, 0]));
	const parallax = $derived(mapRange(journey, [0, 1], [-6, 6]));
</script>

<div
	class={cn(
		'group relative w-full overflow-hidden rounded-2xl border border-border',
		aspectClassName,
		className
	)}
	style:transform={reduce ? undefined : `translateY(${y}px) rotate(${rotate}deg)`}
	{@attach settleAttach}
	{@attach journeyAttach}
>
	<div
		class="absolute inset-[-8%]"
		style:transform={reduce ? undefined : `translateY(${parallax}%)`}
	>
		<img
			src={image}
			{alt}
			{sizes}
			loading={priority ? 'eager' : 'lazy'}
			class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
		/>
	</div>
	<FrameChrome />
</div>
