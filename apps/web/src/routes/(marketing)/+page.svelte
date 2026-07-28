<script lang="ts">
	import { SeoHead } from '$lib/seo';
	import LandingPage from '$lib/features/marketing/components/LandingPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SeoHead seo={data.seo} />

<!-- bg/text/min-h + chrome disediakan `(marketing)/+layout.svelte`; di sini cukup `<main>` semantik. -->
<main>
	<LandingPage latestUpdate={data.latestUpdate} teaserLatest={data.teaserLatest} />
</main>
