<script lang="ts">
	import { mapRange, motionContext, reveal, revealUp, scrollProgress } from '$lib/motion';
	import { Button } from '$lib/components/ui/button';
	import MagneticButton from './MagneticButton.svelte';

	// BottomCtaSection — dark inversion finale. Kelas `dark` me-resolve ulang token ke palet charcoal
	// khusus section ini (tanpa warna hardcode). Signature "reading reveal": kata-kata headline naik
	// dari opacity 0.18 → 1 satu per satu, scroll-linked. Magnetic CTA.
	const HEADLINE = 'Nulis riset yang bisa kamu pertahanin.';
	const words = HEADLINE.split(' ');

	const motion = motionContext.get();
	const reduce = $derived(motion.reducedMotion);

	// `armed` = false sampai attach jalan (SSR/no-JS) → kata tampil penuh (tak dim sebelum JS ada).
	let armed = $state(false);
	let progress = $state(0);
	const attach = scrollProgress(['start 0.85', 'start 0.35'], (p) => {
		armed = true;
		progress = p;
	});
	const revealOnce = reveal();

	function wordOpacity(i: number): number {
		return mapRange(progress, [i / words.length, (i + 1) / words.length], [0.18, 1]);
	}
</script>

<section class="dark w-full bg-background py-32 text-foreground sm:py-40 lg:py-48">
	<div class="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
		<p
			class="{revealUp} text-[15px] leading-snug text-muted-foreground sm:text-base"
			{@attach revealOnce}
		>
			Mulai sekarang
		</p>
		<h2
			class="font-heading mx-auto mt-5 max-w-[16ch] text-balance text-5xl font-normal leading-[1.06] tracking-normal text-foreground sm:mt-6 sm:text-6xl sm:leading-[1.05] lg:text-[4.25rem] lg:leading-[1.04]"
			{@attach attach}
		>
			{#each words as word, i (i)}<span
					class="inline-block"
					style:opacity={reduce || !armed ? undefined : wordOpacity(i)}>{word}&nbsp;</span
				>{/each}
		</h2>
		<p
			class="{revealUp} mx-auto mt-6 max-w-xl text-pretty text-lg leading-snug text-foreground/85 sm:mt-8 sm:text-xl sm:leading-snug"
			{@attach revealOnce}
		>
			Daftar gratis, buka satu tempat buat semua risetmu, dan biarin tiap sumber kecek bener —
			langsung dari browser.
		</p>
		<div class="mt-10 flex flex-col items-center justify-center gap-3 sm:mt-12 sm:flex-row">
			<div class={revealUp} style:transition-delay="150ms" {@attach revealOnce}>
				<Button
					href="#cara-kerja"
					variant="outline"
					class="h-14 rounded-full px-7 text-base font-medium"
				>
					Lihat cara kerjanya
				</Button>
			</div>
			<div class={revealUp} style:transition-delay="270ms" {@attach revealOnce}>
				<MagneticButton radius={160} strength={0.45}>
					<Button href="/sign-up" class="h-14 rounded-full px-7 text-base font-medium">
						Coba gratis →
					</Button>
				</MagneticButton>
			</div>
		</div>
	</div>
</section>
