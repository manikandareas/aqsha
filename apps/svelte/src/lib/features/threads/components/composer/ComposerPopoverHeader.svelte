<script lang="ts">
	import { Icon, ArrowLeftIcon, SearchIcon } from '$lib/icons';
	import type { IconSvgElement } from '$lib/icons';

	let {
		icon = SearchIcon,
		title,
		count,
		onBack,
		backLabel
	}: {
		icon?: IconSvgElement;
		title: string;
		count?: number;
		onBack?: () => void;
		backLabel?: string;
	} = $props();
</script>

<div class="flex items-center justify-between gap-2 border-b border-border/60 px-3 pt-2.5 pb-2">
	<div class="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-foreground">
		{#if onBack}
			<button
				type="button"
				onclick={onBack}
				aria-label={backLabel ?? 'Kembali'}
				class="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
			>
				<Icon icon={ArrowLeftIcon} class="size-3" />
			</button>
		{:else}
			<span
				class="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground"
			>
				<Icon {icon} class="size-3" />
			</span>
		{/if}
		<span class="truncate">{title}</span>
		{#if count != null && count > 0}
			<span
				class="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground"
			>
				{count}
			</span>
		{/if}
	</div>
</div>
