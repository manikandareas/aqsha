<script lang="ts">
	import { mapRange, motionContext, scrollProgress } from '$lib/motion';

	// LedgerRow — satu baris ledger perbandingan. Signature "masalah dicoret": garis rambut menyeret
	// melewati keluhan (scaleX 0→1, scroll-linked) sambil jawaban Aqsha menyala ke opacity penuh.
	// Port `LedgerRow` di `why-aqsha-section.tsx`.
	let { row, index }: { row: { problem: string; others: string; aqsha: string }; index: number } =
		$props();

	const motion = motionContext.get();
	const reduce = $derived(motion.reducedMotion);

	let progress = $state(0);
	const attach = scrollProgress(['start 0.75', 'start 0.45'], (p) => (progress = p));
	const strike = $derived(mapRange(progress, [0, 1], [0, 1]));
	const answerOpacity = $derived(mapRange(progress, [0, 1], [0.5, 1]));
</script>

<div
	class="grid gap-2 border-b border-border/70 py-5 sm:grid-cols-[3rem_1fr_1fr] sm:gap-x-8 sm:py-6"
	{@attach attach}
>
	<span
		aria-hidden="true"
		class="hidden font-mono text-xs leading-6 text-muted-foreground/60 sm:block"
	>
		{String(index + 1).padStart(2, '0')}
	</span>
	<div>
		<p class="text-sm font-medium leading-snug text-foreground sm:text-[15px]">
			<span class="relative inline">
				{row.problem}
				{#if !reduce}
					<span
						aria-hidden="true"
						class="absolute left-0 top-[0.6em] h-px w-full origin-left bg-foreground/60"
						style:transform="scaleX({strike})"
					></span>
				{/if}
			</span>
		</p>
		<p class="mt-1.5 text-xs leading-snug text-muted-foreground sm:text-[13px]">{row.others}</p>
	</div>
	<p
		class="text-sm font-medium leading-snug text-foreground sm:text-[15px]"
		style:opacity={reduce ? undefined : answerOpacity}
	>
		<span class="text-muted-foreground/60 sm:hidden">aqsha · </span>{row.aqsha}
	</p>
</div>
