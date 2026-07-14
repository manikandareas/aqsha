<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatPostDate } from '../lib/format';
	import { blogEase, blogGutter } from '../lib/layout';
	import type { BlogPost } from '../types';

	let { post, index = 0 }: { post: BlogPost; index?: number } = $props();
</script>

<!-- Gutter sbg padding internal → hover full-lebar baris, teks tetap rata dengan heading. Fade-in
     halus per item (no slide → lebih tenang); stagger via animation-delay inline. -->
<a
	href={resolve('/(marketing)/blog/[slug]', { slug: post.slug })}
	style:animation-delay="{Math.min(index, 8) * 60}ms"
	class="group animate-in fade-in fill-mode-both block duration-500 {blogGutter} py-5 transition-colors {blogEase} hover:bg-muted/40"
>
	<p class="text-xs text-muted-foreground">
		{formatPostDate(post.publishedAt)}
		<span class="px-1.5 text-muted-foreground/40">·</span>
		{post.readingTime} menit baca
	</p>

	<h2 class="mt-1.5 text-base font-medium leading-snug text-foreground sm:text-[1.0625rem]">
		{post.title}
	</h2>

	<p class="mt-1.5 line-clamp-2 max-w-xl text-sm leading-6 text-muted-foreground">
		{post.excerpt}
	</p>
</a>
