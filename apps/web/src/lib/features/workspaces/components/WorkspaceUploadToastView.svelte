<script lang="ts">
	import { Progress } from '@aqsha/ui-svelte/components/progress';
	import { Icon, ChevronDownIcon, ChevronUpIcon, RotateCcwIcon, XIcon } from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import {
		getUploadSummary,
		isRetryableUploadItem,
		type UploadQueueItem
	} from '$lib/features/workspaces/components/workspace-upload-toast-model';
	import WorkspaceUploadToastRow from './WorkspaceUploadToastRow.svelte';
	import WorkspaceUploadToastStatusIcon from './WorkspaceUploadToastStatusIcon.svelte';

	/**
	 * Presentational upload-queue card. Rendered inside a sonner toast by `WorkspaceUploadToast.svelte`.
	 */
	let {
		items,
		isUploadActive,
		isCollapsed,
		onDismiss,
		onToggleCollapsed,
		onRetryFailed
	}: {
		items: UploadQueueItem[];
		isUploadActive: boolean;
		isCollapsed: boolean;
		onDismiss: () => void;
		onToggleCollapsed: () => void;
		onRetryFailed: () => void;
	} = $props();

	const summary = $derived(getUploadSummary(items));
	const failedCount = $derived(summary.failedCount);
	const retryableCount = $derived(items.filter(isRetryableUploadItem).length);
	const canRetry = $derived(retryableCount > 0 && !isUploadActive);
	const showBar = $derived(summary.tone !== 'complete');
</script>

<section
	class="lip-pop w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-2 border-border bg-card text-card-foreground sm:w-[340px]"
>
	<header class="flex items-center gap-2.5 px-3 py-2.5">
		<WorkspaceUploadToastStatusIcon status={summary.tone} class="size-4" />
		<button
			aria-expanded={!isCollapsed}
			class="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40"
			onclick={onToggleCollapsed}
			type="button"
		>
			<span class="min-w-0 flex-1 truncate text-[12.5px] font-semibold leading-5">
				{summary.title}
			</span>
			{#if showBar}
				<span class="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
					{summary.completeCount}/{summary.total}
				</span>
			{/if}
			<span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
				{#if isCollapsed}
					<Icon icon={ChevronUpIcon} class="size-3.5" />
				{:else}
					<Icon icon={ChevronDownIcon} class="size-3.5" />
				{/if}
			</span>
		</button>
		<Button
			aria-label="Tutup status upload"
			class="-mr-1 size-6"
			onclick={onDismiss}
			size="icon-xs"
			type="button"
			variant="ghost"
		>
			<Icon icon={XIcon} class="size-3.5" />
		</Button>
	</header>

	{#if showBar}
		<div class="px-3 pb-2.5">
			<Progress class="h-1 bg-muted" value={summary.progress} />
		</div>
	{/if}

	{#if !isCollapsed}
		<div class="max-h-64 overflow-y-auto border-t border-border/60 px-1.5 py-1.5">
			{#each items as item (item.id)}
				<WorkspaceUploadToastRow {item} />
			{/each}
		</div>
	{/if}

	{#if canRetry}
		<footer class="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
			<span class="truncate text-[11px] font-medium text-coral-foreground">
				{failedCount} file gagal
			</span>
			<Button
				class="h-7 gap-1.5 text-[11.5px]"
				onclick={onRetryFailed}
				size="sm"
				type="button"
				variant="outline"
			>
				<Icon icon={RotateCcwIcon} class="size-3.5" />
				Coba lagi
			</Button>
		</footer>
	{/if}
</section>
