<script lang="ts">
	import { cn } from '$lib/utils';
	import { Icon, Loader2Icon } from '$lib/icons';
	import { type ArtifactSidebarRecord } from './ArtifactDetailSidebar.svelte';

	/**
	 * Inner metadata content for a markdown document (popover/menu-agnostic) — port of web
	 * `artifact-detail-sidebar.tsx` `MarkdownArtifactInfo`.
	 */
	let { artifact }: { artifact: ArtifactSidebarRecord } = $props();

	function markdownSourceLabel(source: string | undefined) {
		if (source === 'upload') return 'Uploaded';
		if (source === 'agent') return 'From the agent';
		if (source === 'url') return 'Saved link';
		return 'Created here';
	}

	function indexingDisplay(status?: 'not_indexed' | 'pending' | 'ready' | 'failed') {
		switch (status) {
			case 'ready':
				return { label: 'Indexed', tone: 'bg-mint-foreground' };
			case 'pending':
				return { label: 'Indexing', tone: 'bg-lemon-foreground' };
			case 'failed':
				return { label: 'Indexing failed', tone: 'bg-destructive' };
			default:
				return { label: 'Not indexed', tone: 'bg-muted-foreground/50' };
		}
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleDateString('en', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const indexDisplay = $derived(indexingDisplay(artifact.indexingStatus));
</script>

{#snippet propertyRow(label: string, value: string, badge = false)}
	<div>
		<dt class="text-[12px] font-medium text-muted-foreground">{label}</dt>
		<dd
			class="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground"
			title={value}
		>
			{#if badge}
				<span class="min-w-0 truncate rounded-md bg-muted px-2 py-0.5 text-[13px] font-semibold">
					{value}
				</span>
			{:else}
				<span class="min-w-0 truncate">{value}</span>
			{/if}
		</dd>
	</div>
{/snippet}

<section>
	<h2 class="mb-4 text-[12px] font-semibold text-muted-foreground">About</h2>
	<div class="space-y-4">
		{@render propertyRow('Type', 'Document', true)}
		{@render propertyRow('Source', markdownSourceLabel(artifact.source))}
		<div>
			<dt class="text-[12px] font-medium text-muted-foreground">Index</dt>
			<dd class="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-foreground">
				{#if artifact.indexingStatus === 'pending'}
					<Icon icon={Loader2Icon} class="size-3.5 animate-spin text-muted-foreground" />
				{:else}
					<span class={cn('size-1.5 rounded-full', indexDisplay.tone)}></span>
				{/if}
				{indexDisplay.label}
			</dd>
			{#if artifact.indexingStatus === 'failed' && artifact.indexingFailureReason}
				<p class="mt-1 text-[12px] leading-5 text-destructive">{artifact.indexingFailureReason}</p>
			{/if}
		</div>
		{@render propertyRow('Created', formatDate(artifact.createdAt))}
		{@render propertyRow('Updated', formatDate(artifact.updatedAt))}
	</div>
</section>
