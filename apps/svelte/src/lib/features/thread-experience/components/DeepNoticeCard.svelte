<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { Icon, AlertCircleIcon, RotateCcwIcon, type IconSvgElement } from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { threadTranscriptColumnClass } from '$lib/components/layout/panel-surface';
	import { toolCardShellClass } from '$lib/features/threads/components/ToolCard.svelte';

	let {
		body,
		detail = null,
		primary,
		secondary
	}: {
		body: string;
		detail?: string | null;
		primary: {
			label: string;
			onClick: () => void;
			disabled?: boolean;
			/** Defaults to retry. Pass another glyph (e.g. XIcon) for dismiss-only actions. */
			icon?: IconSvgElement;
		};
		secondary?: { label: string; onClick: () => void };
	} = $props();

	const reduce = $derived(prefersReducedMotion.current);
</script>

<div
	class={threadTranscriptColumnClass}
	transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
>
	<div class={toolCardShellClass}>
		<div class="flex gap-2">
			<Icon icon={AlertCircleIcon} class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0 flex-1">
				<p class="text-sm text-foreground">{body}</p>
				{#if detail}<p class="mt-1 text-xs text-muted-foreground">{detail}</p>{/if}
			</div>
		</div>
		<div class="mt-3 flex gap-2 pl-6">
			<Button size="sm" onclick={primary.onClick} disabled={primary.disabled}>
				<Icon icon={primary.icon ?? RotateCcwIcon} class="size-3.5" />
				{primary.label}
			</Button>
			{#if secondary}
				<Button size="sm" variant="ghost" onclick={secondary.onClick}>{secondary.label}</Button>
			{/if}
		</div>
	</div>
</div>
