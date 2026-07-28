<script lang="ts">
	import { resolve } from '$app/paths';
	import { SeoHead } from '$lib/seo';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import CategoryBadge from '$lib/features/changelog/components/CategoryBadge.svelte';
	import ChangelogDateline from '$lib/features/changelog/components/ChangelogDateline.svelte';
	import ChangelogPreview from '$lib/features/changelog/components/ChangelogPreview.svelte';
	import {
		changelogColumn,
		changelogEase,
		changelogGutter
	} from '$lib/features/changelog/lib/layout';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const entry = $derived(data.entry);
</script>

<SeoHead seo={data.seo} />

<main class="{changelogColumn} py-14 sm:py-20">
	<div class={changelogGutter}>
		<header class="animate-in fade-in fill-mode-both duration-500">
			<a
				href={resolve('/changelog')}
				class="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors {changelogEase} hover:text-foreground"
			>
				<Icon
					icon={ArrowLeftIcon}
					class="size-4 transition-transform {changelogEase} group-hover:-translate-x-0.5"
				/>
				Semua pembaruan
			</a>

			<ChangelogDateline {entry} class="mt-8 text-sm" />
			<h1
				class="font-serif mt-2 text-balance text-[1.9rem] leading-[1.18] text-foreground sm:text-[2.4rem]"
			>
				{entry.title}
			</h1>
			{#if entry.categories.length > 0}
				<div class="mt-4 flex flex-wrap gap-1.5">
					{#each entry.categories as category (category)}
						<CategoryBadge {category} />
					{/each}
				</div>
			{/if}
		</header>

		<ChangelogPreview
			{entry}
			sizes="(min-width: 768px) 720px, 100vw"
			class="mt-8 aspect-[16/9] rounded-xl border-2 border-border sm:mt-10"
		/>

		<article class="aqsha-prose changelog-prose mt-8 sm:mt-10">
			<!-- eslint-disable-next-line svelte/no-at-html-tags — konten Content Collections build-time (trusted). -->
			{@html entry.mdx}
		</article>
	</div>
</main>
