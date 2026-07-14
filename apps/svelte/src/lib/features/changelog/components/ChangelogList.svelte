<script lang="ts">
	import ChangelogCard from './ChangelogCard.svelte';
	import { changelogColumn, changelogGutter } from '../lib/layout';
	import type { ChangelogEntry } from '../types';

	let { entries }: { entries: ChangelogEntry[] } = $props();
</script>

<main class="{changelogColumn} py-14 sm:py-20">
	<header class="{changelogGutter} animate-in fade-in fill-mode-both duration-500">
		<h1 class="font-serif text-[1.9rem] leading-tight text-foreground sm:text-[2.25rem]">
			Apa yang baru
		</h1>
		<p class="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
			Fitur baru, peningkatan, dan perbaikan di Aqsha — biar kamu selalu tahu apa yang berubah.
		</p>
	</header>

	{#if entries.length === 0}
		<p class="{changelogGutter} mt-10 text-sm text-muted-foreground">
			Belum ada pembaruan. Nantikan, ya.
		</p>
	{:else}
		<div class="{changelogGutter} mt-10 flex flex-col gap-4 sm:mt-12 sm:gap-5">
			{#each entries as entry (entry.slug)}
				<ChangelogCard {entry} />
			{/each}
		</div>
	{/if}
</main>
