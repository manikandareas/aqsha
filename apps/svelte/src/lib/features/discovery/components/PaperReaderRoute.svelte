<script lang="ts">
	import { buildExternalPaperMentionLabel, type ContextRef } from '@aqsha/chat-core';
	import { usePaper } from '../api';
	import ExploreReaderChatShell from './ExploreReaderChatShell.svelte';
	import PaperReader from './PaperReader.svelte';

	/** Paper reader page + Astra chat panel; auto-pins the paper as a context token. */
	let { paperKey }: { paperKey: string } = $props();

	const paper = usePaper(() => paperKey);
	const paperTitle = $derived(paper.data?.title);
	const ambientContextRefs = $derived<ContextRef[]>(
		paperTitle
			? [{ kind: 'explore-paper', paperKey, label: buildExternalPaperMentionLabel(paperTitle) }]
			: []
	);
</script>

<ExploreReaderChatShell breadcrumb="Paper" {ambientContextRefs}>
	{#snippet children({ openChat })}
		<PaperReader {paperKey} onAskAstra={openChat} />
	{/snippet}
</ExploreReaderChatShell>
