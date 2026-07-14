<script module lang="ts">
	/** Copy tahap-2 uji berat — hint durasi jujur per uji supaya user tak mengira macet. */
	const HEAVY_HINTS: Record<string, string> = {
		sem_pls: 'SEM-PLS: bootstrap ±1–2 menit',
		cb_sem: 'CB-SEM: estimasi model ±1–2 menit',
		uji_mediasi: 'bootstrap 5000 sampel ±1 menit'
	};
</script>

<script lang="ts">
	import {
		type StatsGroup,
		statsAnalysisMeta,
		summarizeStatsGroup
	} from '@aqsha/chat-core/stats-viz';
	import { Badge } from '$lib/components/ui/badge';
	import { Icon, ChartColumnIcon, CheckCircle2Icon, XCircleIcon } from '$lib/icons';
	import type { DeepStepDetail, ToolRowModel } from '../../lib/timeline-types';
	import ElapsedLabel from '../ElapsedLabel.svelte';
	import StatsSummary, { statsCountsLabel } from './StatsSummary.svelte';

	type AnalysisDetail = Extract<DeepStepDetail, { kind: 'analysis' }>;

	/**
	 * Kartu run analisis statistik — identitas momen analisis di chat, menggantikan tool-row
	 * generik `run_analysis`/`run_python_analysis` (fase A plan statistik-panel):
	 * - Running: judul uji + ringkasan mapping + badge kredit + elapsed berdetak; uji berat
	 *   (SEM/mediasi) memakai copy bertahap supaya bootstrap 1–2 menit tak terasa hang.
	 * - Sukses: "struk" ringkas — chip verdict agregat + jumlah tabel/gambar, dihitung dari grup
	 *   blok DB (`statsGroupsByToolCallId`, D10 — BUKAN parsing output tool; anti-forgery gratis).
	 *   Grup belum ter-fetch (jendela invalidasi) → struk tanpa chip, degrade mulus.
	 * - Gagal / `ok:false`: kartu error dengan note ramah tool (blocked kredit / mapping kolom).
	 * `onOpen` (fase B: buka panel Statistik scoped) → struk bisa diklik. Port `analysis-run-card.tsx`.
	 */
	let {
		model,
		detail,
		group,
		onOpen
	}: {
		model: ToolRowModel;
		detail: AnalysisDetail;
		/** Grup blok DB milik toolCallId ini — sumber judul final + chip verdict. */
		group?: StatsGroup;
		/** Fase B: buka panel Statistik scoped runKey ini. Absen → struk non-interaktif. */
		onOpen?: () => void;
	} = $props();

	const title = $derived(group?.title ?? detail.title);
	const isFailed = $derived(
		model.status === 'failed' || model.status === 'denied' || Boolean(detail.failed)
	);

	// Uji berat = flag META ATAU kredit ≥ 20 (jaring pengaman bila META tertinggal).
	const heavy = $derived(
		Boolean(statsAnalysisMeta(detail.analysis)?.heavy) || detail.credits >= 20
	);
	// Ambang transisi copy tahap-2 uji berat: satu `setTimeout` yang menyala sekali (10s), BUKAN
	// interval per-detik (elapsed berdetak sudah dimiliki `ElapsedLabel`) — hanya butuh momen ambang.
	let reached = $state(false);
	$effect(() => {
		if (!(model.isRunning && heavy)) return;
		const timer = setTimeout(() => (reached = true), 10 * 1000);
		return () => clearTimeout(timer);
	});
	const pastBoot = $derived(heavy && reached);
	// Copy bertahap uji berat (pola copy per-fase /deep): sandbox boot dulu, lalu hint durasi.
	const runningBase = $derived(
		!heavy
			? 'Menghitung'
			: !pastBoot
				? 'Menyiapkan sandbox'
				: `Menghitung (${HEAVY_HINTS[detail.analysis] ?? 'uji berat — bisa 1–2 menit'})`
	);

	const summary = $derived(group ? summarizeStatsGroup(group) : undefined);
</script>

{#snippet creditsBadge(credits: number)}
	{#if credits > 0}
		<Badge
			variant="secondary"
			class="shrink-0 rounded-full bg-muted/60 px-2 py-0 font-medium text-[11px] text-muted-foreground"
		>
			{credits} kredit
		</Badge>
	{/if}
{/snippet}

{#snippet receiptBody()}
	<Icon icon={CheckCircle2Icon} class="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
	<span class="min-w-0 break-words font-medium text-foreground">{title}</span>
	{#if summary}
		<StatsSummary {summary} />
		<span class="shrink-0 text-[12px] text-muted-foreground">
			{statsCountsLabel(summary.tables, summary.figures)}
		</span>
	{/if}
{/snippet}

{#if model.isRunning}
	<div class="my-0.5 flex min-w-0 flex-col gap-1 rounded-xl border bg-muted/20 px-3 py-2.5">
		<div class="flex min-w-0 items-center gap-2">
			<Icon icon={ChartColumnIcon} class="size-3.5 shrink-0 text-primary" />
			<span class="min-w-0 truncate font-medium text-foreground">{title}</span>
			{@render creditsBadge(detail.credits)}
		</div>
		{#if detail.argsSummary}
			<p class="break-words text-[12px] text-muted-foreground leading-4">{detail.argsSummary}</p>
		{/if}
		<span class="text-[12px]"><ElapsedLabel base={runningBase} /></span>
	</div>
{:else if isFailed}
	<div
		class="my-0.5 flex min-w-0 flex-col gap-1 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5"
	>
		<div class="flex min-w-0 items-center gap-2">
			<Icon icon={XCircleIcon} class="size-3.5 shrink-0 text-red-500" />
			<span class="min-w-0 truncate font-medium text-foreground">{title}</span>
			<span class="shrink-0 text-[11px] text-red-500">tidak berjalan</span>
		</div>
		<p class="break-words text-[12.5px] text-muted-foreground leading-5">
			{detail.note ?? 'Analisis gagal dijalankan. Minta Astra mencoba lagi.'}
		</p>
		{#if detail.argsSummary}
			<p class="break-words text-[12px] text-muted-foreground/70 leading-4">{detail.argsSummary}</p>
		{/if}
	</div>
{:else if !onOpen}
	<div class="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
		{@render receiptBody()}
	</div>
{:else}
	<button
		type="button"
		onclick={onOpen}
		class="-mx-1.5 flex w-full min-w-0 flex-wrap items-start gap-x-2 gap-y-1 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		title="Buka di panel Statistik"
	>
		{@render receiptBody()}
	</button>
{/if}
