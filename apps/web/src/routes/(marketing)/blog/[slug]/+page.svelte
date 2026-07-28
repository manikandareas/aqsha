<script lang="ts">
	import { SeoHead } from '$lib/seo';
	import BlogPostHeader from '$lib/features/blog/components/BlogPostHeader.svelte';
	import { blogColumn, blogGutter } from '$lib/features/blog/lib/layout';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const post = $derived(data.post);
</script>

<SeoHead seo={data.seo} />

<main class="{blogColumn} py-14 sm:py-20">
	<div class={blogGutter}>
		<BlogPostHeader {post} />
		<article class="aqsha-prose blog-prose mt-10 sm:mt-12">
			<!-- eslint-disable-next-line svelte/no-at-html-tags — konten Content Collections build-time (trusted). -->
			{@html post.mdx}
		</article>
	</div>
</main>
