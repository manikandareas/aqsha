<script lang="ts">
	import { SeoHead } from '$lib/seo';
	import BlogList from '$lib/features/blog/components/BlogList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SeoHead seo={data.seo} />
<BlogList posts={data.posts} />
