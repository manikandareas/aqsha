<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { Icon, ChevronRightIcon } from '$lib/icons';
	import { cn } from '$lib/utils';
	import { createPersistentCollapse } from './persistent-collapse.svelte';

	/**
	 * Collapsible sidebar section header + animated body. Persisted collapse via
	 * `createPersistentCollapse`; the open/close animation is enabled only after the first client
	 * frame so a restored-collapsed state appears instantly instead of animating on load.
	 */
	let {
		label,
		first = false,
		collapsible = false,
		storageKey,
		action,
		children
	}: {
		label: string;
		first?: boolean;
		collapsible?: boolean;
		storageKey?: string;
		action?: Snippet;
		children: Snippet;
	} = $props();

	// `collapsible`/`storageKey` are static per section — capture once (createPersistentCollapse sets
	// up a persisted state machine once at init).
	const collapse = createPersistentCollapse(untrack(() => (collapsible ? storageKey : undefined)));
	let animate = $state(false);

	onMount(() => {
		if (!collapsible) return;
		const frame = requestAnimationFrame(() => (animate = true));
		return () => cancelAnimationFrame(frame);
	});

	const labelClass = 'text-[11px] font-medium tracking-[-0.01em] text-primary/75';
</script>

<div class="min-w-0 overflow-hidden">
	<div class={cn('flex items-center justify-between gap-1 px-0.5 pb-1.5', first ? 'pt-0' : 'pt-1')}>
		{#if collapsible}
			<button
				type="button"
				onclick={collapse.toggle}
				aria-expanded={!collapse.collapsed}
				class="-ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-[5px] px-1 py-0.5 text-left transition-[background-color] duration-150 ease-out hover:bg-muted/50"
			>
				<Icon
					icon={ChevronRightIcon}
					class={cn(
						'size-3 shrink-0 text-primary/60',
						animate ? 'transition-transform duration-200 ease-out' : null,
						collapse.collapsed ? 'rotate-0' : 'rotate-90'
					)}
				/>
				<span class={cn(labelClass, 'truncate')}>{label}</span>
			</button>
		{:else}
			<span class={labelClass}>{label}</span>
		{/if}
		{@render action?.()}
	</div>
	{#if collapsible}
		<div
			class={cn(
				'grid',
				animate ? 'transition-[grid-template-rows] duration-200 ease-out' : null,
				collapse.collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
			)}
		>
			<div class="min-h-0 overflow-hidden">{@render children()}</div>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>
