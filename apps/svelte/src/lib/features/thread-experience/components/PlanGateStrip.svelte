<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { NotebookIcon } from '$lib/icons';
	import { threadTranscriptColumnClass } from '$lib/components/layout/panel-surface';
	import ToolCard from '$lib/features/threads/components/ToolCard.svelte';
	import type { MastraPlanGate } from '$lib/features/threads/lib/mastra-timeline';
	import PlanGateActions from './PlanGateActions.svelte';

	let {
		planGate,
		onApprove,
		onDecline,
		onOpenPanel
	}: {
		planGate: MastraPlanGate;
		onApprove: () => void;
		onDecline: () => void;
		onOpenPanel?: () => void;
	} = $props();

	const reduce = $derived(prefersReducedMotion.current);
</script>

<div
	class={threadTranscriptColumnClass}
	transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
>
	<ToolCard
		icon={NotebookIcon}
		title="Rencana riset"
		meta={`${planGate.subQuestions.length} sub-pertanyaan`}
		{onOpenPanel}
	>
		<PlanGateActions {onApprove} {onDecline} />
	</ToolCard>
</div>
