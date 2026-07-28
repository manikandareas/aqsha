<script lang="ts">
	import { SeoHead } from '$lib/seo';
	import ChangelogList from '$lib/features/changelog/components/ChangelogList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SeoHead seo={data.seo} />
<ChangelogList entries={data.entries} />
