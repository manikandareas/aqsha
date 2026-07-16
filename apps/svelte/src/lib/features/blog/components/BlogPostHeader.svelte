<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import { formatPostDate } from '../lib/format';
	import { blogEase } from '../lib/layout';
	import type { BlogPost } from '../types';

	let { post }: { post: BlogPost } = $props();
</script>

<header class="animate-in fade-in fill-mode-both duration-500">
	<a
		href={resolve('/blog')}
		class="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors {blogEase} hover:text-foreground"
	>
		<Icon
			icon={ArrowLeftIcon}
			class="size-4 transition-transform {blogEase} group-hover:-translate-x-0.5"
		/>
		Semua tulisan
	</a>

	<!-- Judul memakai serif yang sama dengan heading prose → blok terasa kohesif. -->
	<h1
		class="font-serif mt-8 text-balance text-[1.9rem] leading-[1.18] text-foreground sm:text-[2.4rem]"
	>
		{post.title}
	</h1>
	<p class="mt-3 text-sm text-muted-foreground">
		{formatPostDate(post.publishedAt)}
		<span class="px-1.5 text-muted-foreground/40">·</span>
		{post.readingTime} menit baca
		{#if post.author}
			<span class="px-1.5 text-muted-foreground/40">·</span>
			{post.author}
		{/if}
	</p>

	{#if post.cover}
		<div
			class="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl border-2 border-border"
		>
			<img
				src={post.cover}
				alt=""
				sizes="(min-width: 768px) 768px, 100vw"
				class="absolute inset-0 h-full w-full object-cover"
			/>
		</div>
	{/if}
</header>
