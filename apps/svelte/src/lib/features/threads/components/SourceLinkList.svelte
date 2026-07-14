<script lang="ts">
	import { Icon, ChevronDownIcon, ExternalLinkIcon, type IconSvgElement } from '$lib/icons';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { faviconUrl, originMeta, sourceDomain, sourceHref } from '../lib/source-card';
	import type { SourceCardData } from '../lib/timeline-types';
	import { cn } from '$lib/utils';

	/**
	 * Source list inside a detail panel — shared by the message-sources, search-step, and step
	 * panels. Tiap item = kartu collapsible kompak: header (favicon + judul 1 baris + domain)
	 * dengan chevron; snippet + judul penuh baru tampil saat dibuka. Tautan keluar = ikon
	 * terpisah di kanan header (bukan seluruh kartu) supaya tak bertabrakan dengan toggle.
	 * Anti-overflow: `min-w-0` di tiap lapis flex + `[overflow-wrap:anywhere]` untuk token
	 * panjang tanpa spasi (URL/DOI di snippet). Port `thread-experience/components/source-link-list.tsx`.
	 */
	let { sources }: { sources: SourceCardData[] } = $props();
</script>

{#snippet favicon(fav: string | null, icon: IconSvgElement)}
	<span
		aria-hidden="true"
		class="mt-0.5 flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted"
	>
		{#if fav}
			<span class="size-3 bg-cover bg-center" style={`background-image: url("${fav}")`}></span>
		{:else}
			<Icon {icon} class="size-2.5 text-muted-foreground" />
		{/if}
	</span>
{/snippet}

{#snippet heading(source: SourceCardData, domain: string | null, label: string)}
	<span class="min-w-0 flex-1">
		<span class="block truncate text-[12px] text-foreground leading-5">{source.title}</span>
		<span class="block truncate text-[11px] text-muted-foreground/70 leading-4">
			{domain ?? label}
		</span>
	</span>
{/snippet}

{#snippet openLink(href: string | null)}
	{#if href}
		<a
			{href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Buka sumber di tab baru"
			class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Icon icon={ExternalLinkIcon} class="size-3.5" />
		</a>
	{/if}
{/snippet}

{#if sources.length === 0}
	<p class="text-[13px] text-muted-foreground">Belum ada sumber.</p>
{:else}
	<div class="grid min-w-0 gap-1.5">
		{#each sources as source (source.key)}
			{@const meta = originMeta(source.origin)}
			{@const domain = sourceDomain(source)}
			{@const fav = faviconUrl(domain)}
			{@const href = sourceHref(source)}
			<!-- Tanpa detail tambahan (snippet), collapsible tak berguna — render baris statis. -->
			{@const collapsible = Boolean(source.snippet)}
			{#if !collapsible}
				<div class="flex min-w-0 items-start gap-2.5 rounded-lg border bg-card py-2 pr-2 pl-3">
					{@render favicon(fav, meta.icon)}
					{@render heading(source, domain, meta.label)}
					{@render openLink(href)}
				</div>
			{:else}
				<Collapsible.Root class="min-w-0 overflow-hidden rounded-lg border bg-card">
					<div class="flex min-w-0 items-start gap-1 py-2 pr-2 pl-3">
						<Collapsible.Trigger
							class={cn(
								'group -my-2 flex min-w-0 flex-1 items-start gap-2.5 py-2 text-left',
								'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
							)}
						>
							{@render favicon(fav, meta.icon)}
							{@render heading(source, domain, meta.label)}
							<Icon
								icon={ChevronDownIcon}
								class="mt-1 size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-muted-foreground group-data-[state=open]:rotate-180"
							/>
						</Collapsible.Trigger>
						{@render openLink(href)}
					</div>
					<Collapsible.Content>
						<div class="min-w-0 border-t px-3 py-2">
							<!-- Judul penuh (header meng-truncate ke 1 baris). -->
							<p class="break-words text-[12px] text-foreground leading-5 [overflow-wrap:anywhere]">
								{source.title}
							</p>
							<p
								class="mt-1 break-words text-[11px] text-muted-foreground leading-5 [overflow-wrap:anywhere]"
							>
								{source.snippet}
							</p>
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}
		{/each}
	</div>
{/if}
