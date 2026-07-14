<script lang="ts">
	import { page } from '$app/state';
	import NewsReaderRoute from '$lib/features/discovery/components/NewsReaderRoute.svelte';

	// `/app/explore/n/[id]` — news reader. Keyed on the id so navigating between related news items
	// remounts a fresh reader + chat shell (web parity with the dynamic-segment re-instantiation).
	const id = $derived(page.params.id ?? '');
</script>

{#key id}
	<NewsReaderRoute {id} />
{/key}
