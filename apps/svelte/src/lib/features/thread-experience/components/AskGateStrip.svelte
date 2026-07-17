<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { threadTranscriptColumnClass } from '$lib/components/layout/panel-surface';
	import QuestionsCard from '$lib/features/threads/components/QuestionsCard.svelte';
	import type { AskQuestionsResumeData } from '@aqsha/chat-core';
	import type { MastraAskGate } from '$lib/features/threads/lib/mastra-timeline';

	let {
		askGate,
		onSubmit,
		onSkip,
		onOpenPanel
	}: {
		askGate: MastraAskGate;
		onSubmit: (resume: AskQuestionsResumeData) => void;
		onSkip: () => void;
		onOpenPanel?: () => void;
	} = $props();

	const reduce = $derived(prefersReducedMotion.current);
</script>

<div
	class={threadTranscriptColumnClass}
	transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
>
	<QuestionsCard
		questions={askGate.questions}
		findings={askGate.findings}
		{onSubmit}
		{onSkip}
		{onOpenPanel}
	/>
</div>
