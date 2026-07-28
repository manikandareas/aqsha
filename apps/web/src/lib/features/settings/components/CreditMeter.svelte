<script lang="ts">
	import { formatCredits, formatResetDate } from '../lib/format';

	/**
	 * Monthly credit balance meter (used vs limit). Unlimited → no bar + ∞ label.
	 */
	let {
		creditsUsed,
		creditsLimit,
		creditsRemaining,
		unlimited,
		resetAt
	}: {
		creditsUsed: number;
		creditsLimit: number;
		creditsRemaining: number;
		unlimited: boolean;
		resetAt: number;
	} = $props();

	const pct = $derived(
		unlimited || creditsLimit <= 0
			? 0
			: Math.min(100, Math.round((creditsUsed / creditsLimit) * 100))
	);
</script>

<div class="space-y-3">
	<div class="flex items-baseline justify-between gap-3">
		<span class="font-heading text-[2rem] font-bold leading-none tabular-nums text-foreground">
			{formatCredits(creditsRemaining, unlimited)}
		</span>
		<span class="text-[12px] text-muted-foreground">
			{unlimited ? 'kredit tak terbatas' : `tersisa dari ${formatCredits(creditsLimit, false)}`}
		</span>
	</div>
	{#if !unlimited}
		<div class="h-1.5 overflow-hidden rounded-full bg-muted">
			<div
				class="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
				style="width: {pct}%"
			></div>
		</div>
	{/if}
	<p class="text-[12px] text-muted-foreground">
		{unlimited
			? 'Penggunaan tetap tercatat.'
			: `${formatCredits(creditsUsed, false)} terpakai · reset ${formatResetDate(resetAt)}`}
	</p>
</div>
