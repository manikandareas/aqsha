<script lang="ts">
	import type { AskQuestion, AskQuestionsResumeData } from '@aqsha/chat-core';
	import { HelpCircleIcon } from '$lib/icons';
	import ToolCard from './ToolCard.svelte';
	import QuestionsForm from './QuestionsForm.svelte';

	/**
	 * Inline clarification card (above the composer) on the shared `ToolCard` shell: a compact header
	 * (icon + "Klarifikasi" + question count) that, when `onOpenPanel` is set, opens the Questions panel;
	 * the form follows. Port of `QuestionsCard`.
	 */
	let {
		questions,
		findings,
		onSubmit,
		onSkip,
		onOpenPanel
	}: {
		questions: AskQuestion[];
		findings?: string;
		onSubmit: (resume: AskQuestionsResumeData) => void;
		onSkip: () => void;
		onOpenPanel?: () => void;
	} = $props();
</script>

<ToolCard
	icon={HelpCircleIcon}
	title="Klarifikasi"
	meta={`${questions.length} pertanyaan`}
	{onOpenPanel}
>
	<QuestionsForm {questions} {findings} {onSubmit} {onSkip} scrollable />
</ToolCard>
