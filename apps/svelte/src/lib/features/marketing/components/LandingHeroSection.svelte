<script lang="ts">
	import { mapRange, motionContext, scrollProgress } from '$lib/motion';
	import { Icon, ArrowUpRightIcon } from '$lib/icons';
	import {
		Announcement,
		AnnouncementTag,
		AnnouncementTitle
	} from '$lib/components/ui/announcement';
	import { Button } from '$lib/components/ui/button';
	import FrameChrome from './FrameChrome.svelte';
	import MagneticButton from './MagneticButton.svelte';
	import type { LatestUpdate } from '../types';

	let { latestUpdate = null }: { latestUpdate?: LatestUpdate | null } = $props();

	const motion = motionContext.get();
	const reduce = $derived(motion.reducedMotion);

	// HeroImageFrame — "frame settles": scale 0.965 → 1 saat frame masuk + parallax internal + ken-burns.
	let frameProgress = $state(0);
	const frameAttach = scrollProgress(['start end', 'end start'], (p) => (frameProgress = p));
	const frameScale = $derived(mapRange(frameProgress, [0, 0.35], [0.965, 1]));
	const frameParallax = $derived(mapRange(frameProgress, [0, 1], [-8, 8]));
</script>

<section class="w-full pb-16 sm:pb-24 lg:pb-28">
	<div class="mx-auto w-full max-w-4xl px-4 pt-16 text-center sm:px-6 sm:pt-20 lg:pt-24">
		{#if latestUpdate}
			<div
				class="animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none mb-6 flex justify-center duration-500 sm:mb-8"
			>
				<Announcement
					href={latestUpdate.href}
					class="group text-muted-foreground shadow-none hover:shadow-none"
				>
					<AnnouncementTag class="bg-lavender-soft text-lavender-foreground">
						{latestUpdate.tag}
					</AnnouncementTag>
					<AnnouncementTitle class="min-w-0">
						<span class="min-w-0 truncate">{latestUpdate.title}</span>
						<Icon
							icon={ArrowUpRightIcon}
							class="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
						/>
					</AnnouncementTitle>
				</Announcement>
			</div>
		{/if}
		<h1
			class="hero-h1 font-heading mx-auto max-w-[22ch] text-balance text-5xl font-normal leading-[1.06] tracking-normal text-foreground sm:text-6xl sm:leading-[1.05] lg:text-[4.5rem] lg:leading-[1.04]"
		>
			AI buat nulis riset — yang <em class="text-foreground/80 not-italic">nggak ngarang sumber.</em
			>
		</h1>
		<p
			class="animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none mx-auto mt-6 max-w-xl text-pretty text-lg leading-snug text-foreground/85 [animation-delay:150ms] duration-600 sm:mt-8 sm:text-xl sm:leading-snug"
		>
			Tool AI lain sering ngasih referensi palsu.
			<strong class="font-medium text-foreground">Aqsha ngecek tiap sumber ke paper aslinya</strong>
			sebelum kamu pakai.
		</p>
		<div class="mt-8 flex flex-wrap justify-center gap-3 sm:mt-10">
			<div
				class="animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none [animation-delay:210ms] duration-500"
			>
				<MagneticButton radius={140} strength={0.4}>
					<Button href="/sign-up" class="h-14 rounded-full px-7 text-base">Mulai gratis →</Button>
				</MagneticButton>
			</div>
			<div
				class="animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none [animation-delay:300ms] duration-500"
			>
				<Button
					href="#bandingin"
					variant="outline"
					class="h-14 rounded-full border-border/80 bg-card px-7 text-base text-card-foreground hover:bg-muted"
				>
					Bandingin sama yang lain
				</Button>
			</div>
		</div>
		<p
			class="animate-in fade-in fill-mode-both motion-reduce:animate-none mt-6 text-sm text-muted-foreground [animation-delay:350ms] duration-500 sm:mt-8"
		>
			Buat mahasiswa S1 · pascasarjana · peneliti
		</p>
	</div>

	<!-- HeroImageFrame: near-full-bleed editorial image. -->
	<div
		class="mx-auto mt-12 w-full max-w-[88rem] px-3 sm:mt-14 sm:px-5 lg:mt-16"
		style="perspective: 1400px; perspective-origin: 50% 0%;"
	>
		<div class="hero-frame-in" style="transform-style: preserve-3d;">
			<div
				class="relative w-full overflow-hidden rounded-2xl border border-border"
				style:transform={reduce ? undefined : `scale(${frameScale})`}
				{@attach frameAttach}
			>
				<div class="relative aspect-[4/3] w-full sm:aspect-[16/10] lg:aspect-[21/10]">
					<div
						class="absolute inset-[-12%]"
						style:transform={reduce ? undefined : `translateY(${frameParallax}%)`}
					>
						<img
							src="/landing/hero-frame.png"
							alt="Hand-drawn panoramic landscape with woven research journal elements"
							fetchpriority="high"
							sizes="(min-width: 1408px) 1408px, 100vw"
							class="ken-burns absolute inset-0 h-full w-full object-cover"
						/>
					</div>
					<FrameChrome />
				</div>
			</div>
		</div>

		<!-- Caption: editorial note + handwritten accent -->
		<div
			class="animate-in fade-in fill-mode-both motion-reduce:animate-none mt-5 flex items-end justify-between gap-6 [animation-delay:600ms] duration-500 sm:mt-6"
		>
			<p
				class="max-w-md text-pretty text-sm leading-snug text-muted-foreground sm:text-base sm:leading-snug"
			>
				Setiap sumber dicek ke aslinya. Setiap klaim punya jejak. Setiap kata berasal dari baca,
				bukan karang.
			</p>
			<p
				class="font-hand shrink-0 text-lg leading-none text-foreground/70 sm:text-2xl sm:leading-none"
			>
				field notes
			</p>
		</div>
	</div>
</section>

<style>
	/* Hero headline clipPath sweep reveal (padanan framer clipPath inset). */
	@keyframes hero-clip {
		from {
			clip-path: inset(0 100% 0 0);
			opacity: 0.2;
		}
		to {
			clip-path: inset(0 0% 0 0);
			opacity: 1;
		}
	}
	.hero-h1 {
		animation: hero-clip 0.95s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	/* Hero frame 3D drop-in (padanan framer rotateX + y spring). */
	@keyframes hero-frame-in {
		from {
			opacity: 0;
			transform: translateY(64px) rotateX(6deg);
		}
		to {
			opacity: 1;
			transform: translateY(0) rotateX(0deg);
		}
	}
	.hero-frame-in {
		transform-origin: 50% 0%;
		animation: hero-frame-in 1s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both;
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-h1,
		.hero-frame-in {
			animation: none;
		}
	}
</style>
