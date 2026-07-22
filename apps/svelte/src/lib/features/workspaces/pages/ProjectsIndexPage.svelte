<script lang="ts">
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, PlusIcon } from '$lib/icons';
	import { useWorkspacesList } from '../api';
	import ProjectCard from '../components/ProjectCard.svelte';
	import type { Workspace } from '../types';

	/** Beranda: daftar proyek karya tulis + pintu masuk "Proyek baru" tanpa friksi. */
	const clerk = useClerkContext();
	const list = useWorkspacesList(
		() => false,
		() => clerk.isLoaded && Boolean(clerk.auth.userId)
	);
	const projects = $derived<Workspace[]>(list.data?.pages.flatMap((p) => p.items) ?? []);
	const skeletonItems = [0, 1, 2, 3, 4, 5];

	const newProjectHref = resolve('/app/(product)/projects/new');
</script>

<div class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-8">
	<header class="flex items-center justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">Proyek</h1>
			<p class="text-sm text-muted-foreground">Semua karya tulismu, dari ide sampai selesai.</p>
		</div>
		<Button href={newProjectHref}>
			<Icon icon={PlusIcon} class="size-4" />
			Proyek baru
		</Button>
	</header>

	{#if list.isPending}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each skeletonItems as i (i)}
				<div class="h-44 animate-pulse rounded-lg border-2 border-border bg-muted/40"></div>
			{/each}
		</div>
	{:else if projects.length === 0}
		<div
			class="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-12 text-center"
		>
			<h2 class="font-heading text-xl font-bold">Kamu lagi nulis apa?</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				Skripsi, artikel jurnal, atau ide yang masih mentah — mulai dari satu proyek, judulnya bisa
				menyusul.
			</p>
			<Button href={newProjectHref}>Buat proyek pertama</Button>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each projects as workspace (workspace.id)}
				<ProjectCard {workspace} />
			{/each}
		</div>
		{#if list.hasNextPage}
			<Button type="button" variant="outline" class="mx-auto" onclick={() => list.fetchNextPage()}>
				Muat lebih banyak
			</Button>
		{/if}
	{/if}
</div>
