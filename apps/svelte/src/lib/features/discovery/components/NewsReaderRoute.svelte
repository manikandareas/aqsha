<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import { useFeedItem } from '../api';
	import ExploreReaderChatShell from './ExploreReaderChatShell.svelte';
	import NewsReader from './NewsReader.svelte';

	/** News reader page. */
	let { id }: { id: string } = $props();

	const item = useFeedItem(() => id);
	const title = $derived(item.data && item.data.kind === 'news' ? item.data.title : undefined);
</script>

<PageTitle title={title ?? 'Jelajahi'} />

<ExploreReaderChatShell breadcrumb="Berita">
	{#snippet children()}
		<NewsReader {id} />
	{/snippet}
</ExploreReaderChatShell>
