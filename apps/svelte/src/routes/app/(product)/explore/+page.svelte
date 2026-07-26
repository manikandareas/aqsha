<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import ExplorePage from '$lib/features/explore/components/ExplorePage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageTitle title="Jelajahi" />

<ExplorePage
	feedResult={data.exploreBootstrap.deferred.feed}
	initialFilterPanelOpen={data.filterPanelOpen}
/>
