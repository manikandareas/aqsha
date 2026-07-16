<script lang="ts">
	import { resolve } from '$app/paths';
	import CategoryBadge from './CategoryBadge.svelte';
	import ChangelogDateline from './ChangelogDateline.svelte';
	import ChangelogPreview from './ChangelogPreview.svelte';
	import type { ChangelogEntry } from '../types';

	let { entry }: { entry: ChangelogEntry } = $props();
</script>

<!-- Kartu changelog compact (1 kolom, horizontal di desktop): thumbnail kiri, lalu tanggal (aksen) +
     judul + ringkasan + badge di kanan. Seluruh kartu link ke detail — body MDX lengkap di sana. -->
<a
	href={resolve('/(marketing)/changelog/[slug]', { slug: entry.slug })}
	class="group flex flex-col overflow-hidden rounded-2xl border-2 border-border bg-card transition-colors hover:border-border sm:min-h-[8.5rem] sm:flex-row"
>
	<ChangelogPreview
		{entry}
		class="aspect-[16/9] border-b border-border/60 sm:aspect-auto sm:w-52 sm:shrink-0 sm:border-r sm:border-b-0"
	/>

	<div class="flex-1 p-5">
		<ChangelogDateline {entry} class="text-xs" />

		<h2
			class="mt-1.5 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-foreground/70"
		>
			{entry.title}
		</h2>

		{#if entry.excerpt}
			<p class="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
				{entry.excerpt}
			</p>
		{/if}

		{#if entry.categories.length > 0}
			<div class="mt-3 flex flex-wrap gap-1.5">
				{#each entry.categories as category (category)}
					<CategoryBadge {category} />
				{/each}
			</div>
		{/if}
	</div>
</a>
