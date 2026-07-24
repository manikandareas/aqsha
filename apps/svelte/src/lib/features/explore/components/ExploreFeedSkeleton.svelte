<script lang="ts">
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
</script>

<div
	class="overflow-hidden rounded-lg border-2 border-border bg-card"
	role="status"
	aria-label="Memuat temuan…"
>
	{#each ['a', 'b', 'c', 'd', 'e'] as key (key)}
		<div class="space-y-3 border-b border-border/80 px-4 py-5 last:border-b-0 sm:px-5">
			<Skeleton class="h-5 w-[72%]" />
			<Skeleton class="h-3 w-[42%]" />
			<Skeleton class="h-3 w-full" />
			<Skeleton class="h-3 w-[64%]" />
			<Skeleton class="h-3 w-20" />
		</div>
	{/each}
</div>
