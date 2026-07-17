<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, type IconSvgElement } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	let {
		icon,
		emoji,
		title,
		titleClass,
		description,
		meta,
		trailing,
		pinTrailing = false,
		active,
		disabled = false,
		onSelect,
		onMouseEnter
	}: {
		icon?: IconSvgElement;
		emoji?: string;
		title: string;
		titleClass?: string;
		description?: string;
		meta?: Snippet;
		trailing?: Snippet;
		pinTrailing?: boolean;
		active: boolean;
		disabled?: boolean;
		onSelect: () => void;
		onMouseEnter: () => void;
	} = $props();

	const showDescription = $derived(description != null);
</script>

<!-- Keyboard nav is delegated to TokenizedPromptInput (roving highlight); the option is a pointer
	target only, so it carries no key handler and a non-focusable tabindex. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	role="option"
	tabindex={-1}
	aria-selected={active}
	aria-disabled={disabled}
	onmouseenter={onMouseEnter}
	onclick={() => {
		if (!disabled) onSelect();
	}}
	class={cn(
		'group/cmd relative flex cursor-pointer gap-2.5 rounded-lg px-2 py-1.5 text-control',
		showDescription ? 'items-start' : 'items-center',
		active ? 'bg-mint-soft' : 'hover:bg-mint-soft/60',
		disabled && 'cursor-not-allowed opacity-50',
		trailing && pinTrailing && 'pr-8'
	)}
>
	<span
		class={cn(
			'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
			showDescription && 'mt-0.5',
			active ? 'bg-mint-soft text-mint-foreground' : 'bg-muted text-muted-foreground'
		)}
	>
		{#if emoji}
			<span class="text-[14px] leading-none">{emoji}</span>
		{:else if icon}
			<Icon {icon} class="size-3.5" />
		{/if}
	</span>
	<span class="flex min-w-0 flex-1 flex-col">
		<span class={cn('truncate font-medium leading-5 text-foreground', titleClass)}>{title}</span>
		{#if showDescription}
			<span class="mt-0.5 text-label leading-4 whitespace-normal text-muted-foreground">
				{description}
			</span>
		{/if}
	</span>
	{#if meta}
		<span class={cn('flex shrink-0 items-center gap-1.5', showDescription && 'mt-0.5')}>
			{@render meta()}
		</span>
	{/if}
	{#if trailing}
		{#if pinTrailing}
			<span class="absolute inset-y-0 right-2 flex items-center">{@render trailing()}</span>
		{:else}
			<span class={cn('shrink-0', showDescription && 'mt-0.5')}>{@render trailing()}</span>
		{/if}
	{/if}
</div>
