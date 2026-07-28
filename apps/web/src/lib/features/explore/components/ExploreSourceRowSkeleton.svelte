<script lang="ts">
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';

	/**
	 * Placeholder twin of `ExploreSourceRow` — same grid, same gaps, same vertical rhythm, so the
	 * list does not jump when real rows replace it. Widths arrive as static utility classes because
	 * Tailwind only emits classes it can see in the source.
	 */
	let {
		badges = 2,
		titleClass = 'w-[82%]',
		titleSecondClass = null,
		metaClass = 'w-[46%]',
		summaryClasses = ['w-full', 'w-[68%]']
	}: {
		badges?: number;
		titleClass?: string;
		/** Second title line — real titles usually wrap, so most rows get one. */
		titleSecondClass?: string | null;
		metaClass?: string;
		summaryClasses?: string[];
	} = $props();

	const BADGE_WIDTHS = ['w-24', 'w-16'];
</script>

<div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-1 pb-5 sm:gap-x-4 sm:px-1.5">
	<Skeleton class="mt-1 size-5 shrink-0" />

	<div class="min-w-0">
		<div class="flex min-w-0 items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				{#if badges > 0}
					<div class="mb-2 flex flex-wrap items-center gap-1.5">
						{#each BADGE_WIDTHS.slice(0, badges) as width (width)}
							<Skeleton class={`h-6 ${width}`} />
						{/each}
					</div>
				{/if}

				<Skeleton class={`h-5 ${titleClass}`} />
				{#if titleSecondClass}
					<Skeleton class={`mt-1.5 h-5 ${titleSecondClass}`} />
				{/if}

				<Skeleton class={`mt-2.5 h-3 ${metaClass}`} />

				{#each summaryClasses as width, index (index)}
					<Skeleton class={`mt-2 h-3 ${width}`} />
				{/each}
			</div>

			<div class="flex shrink-0 items-center gap-1">
				<Skeleton class="size-8 rounded-md" />
				<Skeleton class="size-8 rounded-md" />
			</div>
		</div>

		<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-3">
			<Skeleton class="h-3 w-20" />
			<Skeleton class="h-3 w-24" />
		</div>
	</div>
</div>
