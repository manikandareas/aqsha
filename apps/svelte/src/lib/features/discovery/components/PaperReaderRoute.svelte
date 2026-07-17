<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import { usePaper } from '../api';
	import ExploreReaderChatShell from './ExploreReaderChatShell.svelte';
	import PaperReader from './PaperReader.svelte';

	/** Paper reader page. */
	let { paperKey }: { paperKey: string } = $props();

	const paper = usePaper(() => paperKey);
	const paperTitle = $derived(paper.data?.title);
</script>

<PageTitle title={paperTitle ?? 'Jelajahi'} />

<ExploreReaderChatShell breadcrumb="Paper">
	{#snippet children()}
		<PaperReader {paperKey} />
	{/snippet}
</ExploreReaderChatShell>
