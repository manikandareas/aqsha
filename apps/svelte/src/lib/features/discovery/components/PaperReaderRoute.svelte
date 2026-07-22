<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import { getAuthState } from '$lib/auth';
	import { usePaper } from '../api';
	import ExploreReaderChatShell from './ExploreReaderChatShell.svelte';
	import PaperReader from './PaperReader.svelte';

	/** Paper reader page. */
	let { paperKey }: { paperKey: string } = $props();

	const auth = getAuthState();
	const paper = usePaper(
		() => paperKey,
		() => auth.isSignedIn
	);
	const paperTitle = $derived(paper.data?.title);
</script>

<PageTitle title={paperTitle ?? 'Jelajahi'} />

<ExploreReaderChatShell breadcrumb="Paper">
	<PaperReader {paperKey} />
</ExploreReaderChatShell>
