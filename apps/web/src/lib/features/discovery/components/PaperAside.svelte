<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Icon, CheckIcon, CopyIcon, TrendingUpIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import type { ExplorePaper, PaperYearCount } from '$lib/features/discovery/types';

	// Easing fisik (spring-out) selaras dengan primitif reader lain.
	const EASE = 'ease-[cubic-bezier(0.32,0.72,0,1)]';

	// ── Terjemahan scientometrics OpenAlex → label manusiawi ────────────────────
	type AccessTone = 'open' | 'partial' | 'closed';
	const ACCESS_STATUS: Record<string, { label: string; tone: AccessTone }> = {
		diamond: { label: 'Akses terbuka penuh', tone: 'open' },
		gold: { label: 'Akses terbuka', tone: 'open' },
		hybrid: { label: 'Akses terbuka', tone: 'open' },
		green: { label: 'Tersedia di repositori', tone: 'partial' },
		bronze: { label: 'Gratis di penerbit', tone: 'partial' },
		closed: { label: 'Akses terbatas', tone: 'closed' }
	};
	const ACCESS_DOT: Record<AccessTone, string> = {
		open: 'bg-mint-foreground',
		partial: 'bg-lemon-foreground',
		closed: 'bg-muted-foreground/45'
	};

	/** citationPercentile 0–100 (lebih tinggi = lebih sering dikutip dari sebidang) → "Top X%". */
	function topPercentLabel(percentile: number): string {
		return `Top ${Math.max(1, 100 - Math.round(percentile))}%`;
	}

	/** fwci: 1,0 = rata-rata bidang → "1,4×". */
	function formatFwci(fwci: number): string {
		return `${fwci.toLocaleString('id-ID', { maximumFractionDigits: 1 })}×`;
	}

	function capitalize(value: string): string {
		return value.charAt(0).toUpperCase() + value.slice(1);
	}

	function dedupe(values: string[]): string[] {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient dedupe set, not reactive state
		const seen = new Set<string>();
		const out: string[] = [];
		for (const v of values) {
			const key = v.trim().toLowerCase();
			if (key && !seen.has(key)) {
				seen.add(key);
				out.push(v);
			}
		}
		return out;
	}

	let { paper }: { paper: ExplorePaper } = $props();

	const e = $derived(paper.enriched);
	const cites = $derived(paper.citedByCount ?? e?.citedByCount);

	const hasImpact = $derived(
		!!e &&
			(cites != null || e.fwci != null || e.citationPercentile != null || e.countsByYear.length > 1)
	);

	const journal = $derived(e?.journal ?? paper.venue);
	const access = $derived(
		e?.oaStatus
			? (ACCESS_STATUS[e.oaStatus] ?? { label: e.oaStatus, tone: 'partial' as const })
			: paper.isOpenAccess
				? { label: 'Akses terbuka', tone: 'open' as const }
				: undefined
	);
	const license = $derived(e?.license);
	const typeLine = $derived(
		[e?.type ? capitalize(e.type) : null, e?.language ? e.language.toUpperCase() : null]
			.filter(Boolean)
			.join(' · ')
	);
	const issn = $derived(e?.issn?.[0]);
	const concepts = $derived(
		dedupe([...(e?.concepts.map((c) => c.name) ?? []), ...paper.topics]).slice(0, 10)
	);
	const institutions = $derived(e?.institutions ?? []);
	const funders = $derived(e?.funders ?? []);
	const sdgs = $derived(e?.sdgs.map((s) => s.name) ?? []);

	const hasDetails = $derived(
		!!journal ||
			!!access ||
			!!paper.doi ||
			!!issn ||
			concepts.length > 0 ||
			institutions.length > 0 ||
			funders.length > 0 ||
			sdgs.length > 0
	);

	// DOI salin-cepat: morph centang, reset otomatis ~1,4 dtk.
	let copied = $state(false);
	$effect(() => {
		if (!copied) return;
		const id = setTimeout(() => (copied = false), 1400);
		return () => clearTimeout(id);
	});
	function copyDoi(doi: string) {
		navigator.clipboard
			?.writeText(doi)
			.then(() => (copied = true))
			.catch(() => {});
	}
</script>

{#if hasImpact || hasDetails}
	<aside class="mt-9 min-w-0 space-y-3 @5xl:sticky @5xl:top-6 @5xl:mt-0 @5xl:self-start">
		{#if hasImpact && e}
			<div class="overflow-hidden rounded-2xl border-2 border-border bg-card">
				<div class="bg-muted/25 px-5 py-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="font-serif text-[34px] leading-none tracking-tight text-foreground">
								{cites != null ? cites.toLocaleString('id-ID') : '—'}
							</p>
							<p class="mt-1.5 text-[11px] font-medium text-muted-foreground">Sitasi</p>
						</div>
						{#if e.citationPercentile != null}
							<span
								class={cn(
									'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
									e.citationPercentile >= 75
										? 'border-mint-soft-border bg-mint-soft text-mint-foreground'
										: 'border-border/70 bg-muted/50 text-muted-foreground'
								)}
							>
								{topPercentLabel(e.citationPercentile)}
							</span>
						{/if}
					</div>

					{#if e.fwci != null}
						<div class="mt-4 flex items-baseline gap-2 border-t border-border/40 pt-3">
							<span
								class={cn(
									'font-serif text-[18px] leading-none tracking-tight',
									e.fwci >= 1 ? 'text-mint-foreground' : 'text-foreground'
								)}
							>
								{formatFwci(e.fwci)}
							</span>
							<span class="text-[11px] leading-tight text-muted-foreground">
								rata-rata sitasi bidang ini
							</span>
						</div>
					{/if}
				</div>

				{#if e.countsByYear.length > 1}
					<div class="px-5 py-4">
						{@render citationTrend(e.countsByYear)}
					</div>
				{/if}
			</div>
		{/if}

		{#if hasDetails}
			<div
				class="overflow-hidden rounded-2xl border-2 border-border bg-card px-5 divide-y divide-border/50"
			>
				{#if access || journal || typeLine || paper.doi || issn}
					{@render asideGroup('Publikasi', publikasiBody)}
				{/if}

				{#if concepts.length > 0}
					{@render asideGroup('Topik & konsep', conceptsBody)}
				{/if}

				{#if institutions.length > 0}
					{@render asideGroup('Afiliasi', afiliasiBody)}
				{/if}

				{#if funders.length > 0}
					{@render asideGroup('Pendanaan', pendanaanBody)}
				{/if}

				{#if sdgs.length > 0}
					{@render asideGroup('Tujuan pembangunan berkelanjutan', sdgBody)}
				{/if}
			</div>
		{/if}
	</aside>
{/if}

<!-- Tren sitasi per tahun — bar puncak disorot penuh, lain redup; caption tahun puncak. -->
{#snippet citationTrend(counts: PaperYearCount[])}
	{@const max = Math.max(1, ...counts.map((c) => c.citedByCount))}
	{@const peak = counts.reduce(
		(best, c) => (c.citedByCount > best.citedByCount ? c : best),
		counts[0]
	)}
	<div>
		<div class="flex h-10 items-end gap-[3px]" aria-hidden="true">
			{#each counts as c (c.year)}
				<span
					title={`${c.year}: ${c.citedByCount}`}
					class={cn(
						'min-w-[4px] flex-1 rounded-sm transition-colors duration-300',
						EASE,
						c.year === peak.year ? 'bg-mint-foreground' : 'bg-mint-foreground/30'
					)}
					style={`height: ${Math.max(6, (c.citedByCount / max) * 100)}%`}
				></span>
			{/each}
		</div>
		<p class="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
			<Icon icon={TrendingUpIcon} class="size-3" />
			Tren sitasi · puncak {peak.year}
		</p>
	</div>
{/snippet}

<!-- DOI: teks tertaut ke doi.org + tombol salin dengan morph centang (feedback ~1,4 dtk). -->
{#snippet doiValue(doi: string)}
	<div class="flex items-start gap-1.5">
		<a
			href={`https://doi.org/${doi}`}
			target="_blank"
			rel="noopener noreferrer"
			class="min-w-0 break-all text-[13px] leading-snug text-foreground underline-offset-2 hover:underline"
		>
			{doi}
		</a>
		<button
			type="button"
			onclick={() => copyDoi(doi)}
			aria-label={copied ? 'DOI tersalin' : 'Salin DOI'}
			class={cn(
				'mt-px flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[transform,color] duration-200 hover:text-foreground active:scale-90',
				EASE,
				copied && 'text-mint-foreground'
			)}
		>
			{#if copied}<Icon icon={CheckIcon} class="size-3.5" />{:else}<Icon
					icon={CopyIcon}
					class="size-3.5"
				/>{/if}
		</button>
	</div>
{/snippet}

{#snippet asideGroup(title: string, body: Snippet)}
	<section class="py-4">
		<h3 class="mb-3 text-[11px] font-semibold tracking-tight text-muted-foreground">{title}</h3>
		{@render body()}
	</section>
{/snippet}

{#snippet asideRow(label: string, value: Snippet)}
	<div class="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-x-3">
		<dt class="text-[11px] font-medium text-muted-foreground">{label}</dt>
		<dd class="min-w-0 text-[13px] leading-snug text-foreground">{@render value()}</dd>
	</div>
{/snippet}

{#snippet publikasiBody()}
	{#if access}
		<div class="mb-3 flex items-center gap-2">
			<span class={cn('size-2 shrink-0 rounded-full', ACCESS_DOT[access.tone])}></span>
			<span class="text-[13px] leading-tight text-foreground">{access.label}</span>
			{#if license}<span class="truncate text-[12px] text-muted-foreground">· {license}</span>{/if}
		</div>
	{/if}
	<dl class="space-y-2.5">
		{#if journal}{@render asideRow('Jurnal', journalVal)}{/if}
		{#if typeLine}{@render asideRow('Jenis', typeLineVal)}{/if}
		{#if paper.doi}{@render asideRow('DOI', doiVal)}{/if}
		{#if issn}{@render asideRow('ISSN', issnVal)}{/if}
	</dl>
{/snippet}

{#snippet journalVal()}{journal}{/snippet}
{#snippet typeLineVal()}{typeLine}{/snippet}
{#snippet doiVal()}{#if paper.doi}{@render doiValue(paper.doi)}{/if}{/snippet}
{#snippet issnVal()}{issn}{/snippet}

{#snippet conceptsBody()}
	<div class="flex flex-wrap gap-1.5">
		{#each concepts as c (c)}
			<Badge variant="secondary" class="font-normal">{c}</Badge>
		{/each}
	</div>
{/snippet}

{#snippet afiliasiBody()}
	<p class="text-[13px] leading-relaxed text-muted-foreground">{institutions.join(' · ')}</p>
{/snippet}

{#snippet pendanaanBody()}
	<p class="text-[13px] leading-relaxed text-muted-foreground">{funders.join(' · ')}</p>
{/snippet}

{#snippet sdgBody()}
	<div class="flex flex-wrap gap-1.5">
		{#each sdgs as s (s)}
			<Badge variant="outline" class="font-normal">{s}</Badge>
		{/each}
	</div>
{/snippet}
