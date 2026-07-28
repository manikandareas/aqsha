<script lang="ts">
	import { formatCount } from '../lib/format';

	type UsageDay = { date: string; credits: number; eventCount: number };

	/**
	 * Compact usage timeseries bar chart (credits per day, normalized to max).
	 */
	let { days }: { days: UsageDay[] } = $props();

	const max = $derived(Math.max(1, ...days.map((d) => d.credits)));
	const total = $derived(days.reduce((sum, d) => sum + d.credits, 0));
</script>

<div class="space-y-3">
	<div class="flex h-28 items-end gap-px border-b border-border/50">
		{#each days as d (d.date)}
			<div
				class="flex-1 rounded-t-[2px] bg-primary/25 transition-colors duration-150 hover:bg-primary"
				style="height: {Math.max(2, Math.round((d.credits / max) * 100))}%"
				title={`${d.date}: ${d.credits} kredit`}
			></div>
		{/each}
	</div>
	<p class="text-[12px] text-muted-foreground">
		{total === 0
			? 'Belum ada penggunaan pada rentang ini.'
			: `${formatCount(total)} kredit dalam ${days.length} hari`}
	</p>
</div>
