<script module lang="ts">
	// One cited/gathered source as a clickable row: favicon (with a Globe fallback when no favicon
	// resolves) + title + domain + outbound affordance. Shared by the sub-agent detail panel and the
	// answer-level Sources collapsible so the provenance row reads identically everywhere. Pure
	// presentation — the caller passes an already-resolved `SourceLinkItem` (no raw payload).
	export type SourceLinkItem = {
		key: string;
		title: string;
		url?: string;
		domain: string | null;
		favicon: string | null;
	};
</script>

<script lang="ts">
	import { Icon, ExternalLinkIcon, GlobeIcon } from '$lib/icons';
	import { cn } from '$lib/utils';

	let { link }: { link: SourceLinkItem } = $props();

	const rowClass = 'flex min-w-0 items-start gap-2 rounded-[8px] px-2 py-1.5 transition-colors';
</script>

{#snippet favicon(fav: string | null)}
	{#if fav}
		<span
			aria-hidden="true"
			class="mt-0.5 size-4 shrink-0 rounded-[4px] bg-muted bg-cover bg-center"
			style={`background-image: url("${fav}")`}
		></span>
	{:else}
		<span
			aria-hidden="true"
			class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-muted text-muted-foreground"
		>
			<Icon icon={GlobeIcon} class="size-3" />
		</span>
	{/if}
{/snippet}

{#snippet content()}
	{@render favicon(link.favicon)}
	<span class="min-w-0 flex-1">
		<span class="line-clamp-2 break-words text-[13px] leading-5 text-foreground">{link.title}</span>
	</span>
	{#if link.domain}
		<span class="mt-0.5 shrink-0 text-[12px] text-muted-foreground">{link.domain}</span>
	{/if}
{/snippet}

{#if link.url}
	<li data-source-key={link.key}>
		<a
			href={link.url}
			target="_blank"
			rel="noopener noreferrer"
			class={cn(
				rowClass,
				'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
			)}
		>
			{@render content()}
			<Icon icon={ExternalLinkIcon} class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
		</a>
	</li>
{:else}
	<li class={rowClass}>{@render content()}</li>
{/if}
