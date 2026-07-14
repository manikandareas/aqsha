<script lang="ts">
	import BlogCard from './BlogCard.svelte';
	import { blogColumn, blogGutter } from '../lib/layout';
	import type { BlogPost } from '../types';

	let { posts }: { posts: BlogPost[] } = $props();
</script>

<main class="{blogColumn} py-14 sm:py-20">
	<header class="{blogGutter} animate-in fade-in fill-mode-both duration-500">
		<h1 class="font-serif text-[1.9rem] leading-tight text-foreground sm:text-[2.25rem]">Blog</h1>
		<p class="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
			Catatan tim Aqsha soal riset, verifikasi sumber, dan cara nulis ilmiah yang sumbernya beneran
			ada.
		</p>
	</header>

	{#if posts.length === 0}
		<p class="{blogGutter} mt-10 text-sm text-muted-foreground">Belum ada tulisan. Nantikan, ya.</p>
	{:else}
		<div class="mt-8 divide-y divide-border/60 border-y border-border/60">
			{#each posts as post, index (post.slug)}
				<BlogCard {post} {index} />
			{/each}
		</div>
	{/if}
</main>
