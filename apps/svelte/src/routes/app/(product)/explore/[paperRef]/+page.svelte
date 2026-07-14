<script lang="ts">
	import { page } from '$app/state';
	import PaperReaderRoute from '$lib/features/discovery/components/PaperReaderRoute.svelte';

	// `/app/explore/[paperRef]` — paper reader. SvelteKit decodes the route param, so `paperRef` is the
	// canonical key (e.g. `doi:10.1/x`), matching the web `decodeURIComponent(paperRef)`. Keyed on the
	// param so navigating between related papers remounts a fresh reader + chat shell (web parity).
	const paperKey = $derived(page.params.paperRef ?? '');
</script>

{#key paperKey}
	<PaperReaderRoute {paperKey} />
{/key}
