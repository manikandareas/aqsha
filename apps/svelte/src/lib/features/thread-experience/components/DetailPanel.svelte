<script lang="ts">
	import { Icon, XIcon } from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { searchKey } from '$lib/features/threads/lib/thread-panel-data';
	import SourcesPanel from '$lib/features/threads/components/SourcesPanel.svelte';
	import SourceCardList from '$lib/features/threads/components/SourceCardList.svelte';
	import QuestionsForm from '$lib/features/threads/components/QuestionsForm.svelte';
	import StatsBlock from '$lib/features/threads/components/stats-viz/StatsBlock.svelte';
	import { dedupeCards } from '$lib/features/threads/lib/source-card';
	import ArtifactDetailView from '$lib/features/workspaces/components/ArtifactDetailView.svelte';
	import { useArtifactDetailData } from '$lib/features/workspaces/api/use-workspaces-data';
	import type { ThreadPanelController } from './thread-panel-context.svelte';
	import PlanGateActions from './PlanGateActions.svelte';

	/**
	 * Thread-detail side panel body — resolves the current `?panel=` mode against the controller's
	 * id-keyed lookups and renders it: Sumber (aggregate / message-scoped), Statistik (aggregate /
	 * run-scoped), a `/deep` plan (+ gate actions), a clarification form, a search sub-step, or a generic
	 * tool step, or a read-only artifact preview (opened from an in-chat artifact card). The Workspace
	 * (context) tab remains a deferred sub-feature — see the `context` branch.
	 */
	let { controller }: { controller: ThreadPanelController } = $props();

	const mode = $derived(controller.mode);
	const lookups = $derived(controller.lookups);

	const title = $derived.by(() => {
		switch (mode.kind) {
			case 'sources':
				return 'Sumber';
			case 'stats':
				return 'Statistik';
			case 'plan':
				return 'Rencana riset';
			case 'questions':
				return 'Klarifikasi';
			case 'search':
				return 'Langkah pencarian';
			case 'step':
				return 'Detail langkah';
			case 'artifact':
				return 'Dokumen';
			case 'context':
				return 'Workspace';
			default:
				return '';
		}
	});

	const aggregateSources = $derived(dedupeCards([...lookups.messageSources.values()].flat()));

	// Artifact preview (opened from an in-chat artifact card). Query stays idle for non-artifact modes
	// because `useArtifact`/`useArtifactRender` are gated `enabled: Boolean(id())`.
	const artifactData = useArtifactDetailData(() =>
		mode.kind === 'artifact' ? mode.artifactId : ''
	);
</script>

<SidePanelFrame>
	{#snippet header()}
		<div
			class="sticky top-0 z-20 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 @2xl:px-6"
		>
			<span class="truncate text-sm font-semibold text-foreground">{title}</span>
			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				aria-label="Tutup panel"
				onclick={() => controller.close()}
			>
				<Icon icon={XIcon} class="size-4" />
			</Button>
		</div>
	{/snippet}

	{#if mode.kind === 'artifact'}
		<!-- Artifact preview reuses the read-only panel view (its own toolbar suppressed via `embedded`;
		     this DetailPanel already supplies the header + close). -->
		<ArtifactDetailView
			data={artifactData}
			artifactId={mode.artifactId}
			variant="panel"
			embedded
			onClose={() => controller.close()}
		/>
	{:else}
		<div class={cn('min-h-0 flex-1 overflow-y-auto', panelBodyPaddingClass)}>
			{#if mode.kind === 'sources'}
				{@const list = mode.messageId
					? (lookups.messageSources.get(mode.messageId) ?? [])
					: aggregateSources}
				{#if list.length > 0}
					<SourcesPanel sources={list} />
				{:else}
					<p class="text-sm text-muted-foreground">Belum ada sumber riset.</p>
				{/if}
			{:else if mode.kind === 'stats'}
				{#if mode.runKey}
					{@const item = lookups.stats.find((s) => s.runKey === mode.runKey)}
					{#if item}
						<StatsBlock group={item.group} />
					{:else if lookups.statsLoading}
						<p class="text-sm text-muted-foreground">Memuat hasil analisis…</p>
					{:else}
						<p class="text-sm text-muted-foreground">Hasil analisis tidak ditemukan.</p>
					{/if}
				{:else if lookups.stats.length > 0}
					<div class="flex flex-col gap-6">
						{#each lookups.stats as item (item.runKey)}
							<StatsBlock
								group={item.group}
								onOpenStats={() => controller.openStatsPanel(item.runKey)}
							/>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">Belum ada hasil analisis di percakapan ini.</p>
				{/if}
			{:else if mode.kind === 'plan'}
				{@const plan = lookups.plans.get(mode.turnId)}
				{#if plan}
					<div class="flex flex-col gap-3">
						{#if plan.plan}
							<p class="text-sm leading-6 whitespace-pre-wrap text-foreground">{plan.plan}</p>
						{/if}
						{#if plan.subQuestions.length > 0}
							<ol class="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
								{#each plan.subQuestions as q, i (`${i}-${q.slice(0, 24)}`)}
									<li>{q}</li>
								{/each}
							</ol>
						{/if}
						{#if plan.resolve}
							{@const resolvePlan = plan.resolve}
							<div class="pt-1">
								<PlanGateActions
									onApprove={() => resolvePlan(true)}
									onDecline={() => resolvePlan(false)}
								/>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">Rencana tidak ditemukan.</p>
				{/if}
			{:else if mode.kind === 'questions'}
				{#if lookups.ask?.resolve && lookups.ask.skip}
					{@const ask = lookups.ask}
					{@const resolveAsk = ask.resolve}
					{@const skipAsk = ask.skip}
					<QuestionsForm
						questions={ask.questions}
						findings={ask.findings}
						onSubmit={(resume) => resolveAsk(resume)}
						onSkip={() => skipAsk()}
					/>
				{:else}
					<p class="text-sm text-muted-foreground">Tidak ada klarifikasi aktif.</p>
				{/if}
			{:else if mode.kind === 'search'}
				{@const step = lookups.searches.get(searchKey(mode.turnId, mode.subQuestionIndex))}
				{#if step}
					<div class="flex flex-col gap-3">
						<p class="text-sm font-medium text-foreground">{step.subQuestion}</p>
						{#if step.sources.length > 0}
							<SourceCardList sources={step.sources} />
						{:else}
							<p class="text-sm text-muted-foreground">
								Belum ada sumber untuk sub-pertanyaan ini.
							</p>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">Langkah pencarian tidak ditemukan.</p>
				{/if}
			{:else if mode.kind === 'step'}
				{@const step = lookups.steps.get(mode.toolCallId)}
				{#if step}
					<div class="flex flex-col gap-3">
						<p class="text-sm font-medium text-foreground">{step.title}</p>
						{#if step.detail?.kind === 'text'}
							<p class="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
								{step.detail.text}
							</p>
						{:else if step.detail?.kind === 'search-flat'}
							<SourceCardList sources={step.detail.sources} />
						{/if}
						{#if step.rows && step.rows.length > 0}
							<dl class="grid gap-1.5 text-[13px]">
								{#each step.rows as row (row.key)}
									<div class="flex min-w-0 gap-1.5">
										<dt class="shrink-0 text-muted-foreground">{row.label}:</dt>
										<dd class="min-w-0 break-words text-foreground">{row.value}</dd>
									</div>
								{/each}
							</dl>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">Langkah tidak ditemukan.</p>
				{/if}
			{:else if mode.kind === 'context'}
				<!-- Workspace/library tab in the thread panel is a deferred sub-feature: no affordance opens
				     it (reachable only via a manual ?panel=c), and it needs a thread workspaceId the model
				     does not carry. Neutral placeholder until it is built. -->
				<p class="text-sm text-muted-foreground">Tab Workspace belum tersedia di panel ini.</p>
			{/if}
		</div>
	{/if}
</SidePanelFrame>
