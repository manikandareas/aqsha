<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { Icon, DownloadIcon, InfoIcon, MoreHorizontalIcon, Trash2Icon } from '$lib/icons';
	import type { ArtifactRenderPayload } from '$lib/features/artifacts/types';
	import {
		resolveArtifactDownload,
		triggerArtifactDownload
	} from '$lib/features/threads/lib/artifact-download';

	/**
	 * Side-panel header actions — port of `artifact-detail-view.tsx` `ArtifactPanelActions`. A single
	 * More popover next to the panel close toggle: one overlay, two views. The "menu" view lists Info +
	 * Download + Delete; choosing Info swaps the SAME popover to the metadata "info" view. This
	 * deliberately avoids nesting a Popover inside a DropdownMenu (two dismissable layers sharing an
	 * anchor fight each other → flicker); one controlled surface sidesteps that.
	 */
	let {
		payload,
		title,
		infoContent,
		onDelete
	}: {
		payload: ArtifactRenderPayload;
		title: string;
		infoContent: Snippet;
		onDelete: () => void;
	} = $props();

	let open = $state(false);
	let view = $state<'menu' | 'info'>('menu');
	const download = $derived(resolveArtifactDownload(payload, title));

	const menuItemClass =
		'flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none';

	function handleOpenChange(next: boolean) {
		open = next;
		// Always reopen on the menu view, never stuck on a stale info panel.
		if (!next) view = 'menu';
	}
</script>

<Popover.Root {open} onOpenChange={handleOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="ghost"
				class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Tindakan lainnya"
			>
				<Icon icon={MoreHorizontalIcon} class="size-3.5" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="end"
		class={cn(
			view === 'info'
				? 'max-h-[72svh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-4'
				: 'w-44 p-1'
		)}
	>
		{#if view === 'menu'}
			<div class="grid gap-0.5">
				<button type="button" onclick={() => (view = 'info')} class={menuItemClass}>
					<Icon icon={InfoIcon} class="size-4 text-muted-foreground" />
					Info
				</button>
				{#if download.kind === 'url'}
					<a
						href={download.href}
						download={download.fileName}
						onclick={() => (open = false)}
						class={menuItemClass}
					>
						<Icon icon={DownloadIcon} class="size-4 text-muted-foreground" />
						Download
					</a>
				{:else}
					<button
						type="button"
						onclick={() => {
							open = false;
							triggerArtifactDownload(download);
						}}
						class={menuItemClass}
					>
						<Icon icon={DownloadIcon} class="size-4 text-muted-foreground" />
						Download
					</button>
				{/if}
				<button
					type="button"
					onclick={() => {
						open = false;
						onDelete();
					}}
					class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
				>
					<Icon icon={Trash2Icon} class="size-4" />
					Delete
				</button>
			</div>
		{:else}
			{@render infoContent()}
		{/if}
	</Popover.Content>
</Popover.Root>
