<script lang="ts">
	import { buildNewsMentionLabel, type ContextRef } from '@aqsha/chat-core';
	import { PageTitle } from '$lib/seo';
	import { useFeedItem } from '../api';
	import ExploreReaderChatShell from './ExploreReaderChatShell.svelte';
	import NewsReader from './NewsReader.svelte';

	/** News reader page + Astra chat panel; auto-pins the news item as a context token. */
	let { id }: { id: string } = $props();

	const item = useFeedItem(() => id);
	const title = $derived(item.data && item.data.kind === 'news' ? item.data.title : undefined);
	const ambientContextRefs = $derived<ContextRef[]>(
		title ? [{ kind: 'news', feedItemId: id, label: buildNewsMentionLabel(title) }] : []
	);
</script>

<PageTitle title={title ?? 'Jelajahi'} />

<ExploreReaderChatShell breadcrumb="Berita" {ambientContextRefs}>
	{#snippet children({ openChat })}
		<NewsReader {id} onAskAstra={openChat} />
	{/snippet}
</ExploreReaderChatShell>
