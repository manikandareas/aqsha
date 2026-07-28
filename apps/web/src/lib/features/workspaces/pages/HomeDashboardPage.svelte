<script lang="ts">
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { viewerContext } from '$lib/auth';
	import AppPageHeader from '$lib/components/layout/AppPageHeader.svelte';
	import { readableApiErrorMessage } from '$lib/errors';
	import { Icon, PlusIcon } from '$lib/icons';
	import { useWorkspacesList } from '../api';
	import HomeFeatureShortcuts from '../components/HomeFeatureShortcuts.svelte';
	import NewProjectCard from '../components/NewProjectCard.svelte';
	import ProjectShelfCard from '../components/ProjectShelfCard.svelte';
	import ProjectSortMenu from '../components/ProjectSortMenu.svelte';
	import { sortWorkspaces, type ProjectSortId } from '../project-sort';
	import type { WorkspaceListItem } from '../types';

	const skeletonCards = [0, 1, 2, 3, 4] as const;
	const newProjectHref = resolve('/app/(product)/projects/new');
	/** Same gutter rhythm as library; shelf caps at 4 columns. */
	const shelfGridClass =
		'grid grid-cols-1 gap-4 @md:grid-cols-2 @2xl:gap-5 @3xl:grid-cols-3 @5xl:grid-cols-4';

	const clerk = useClerkContext();
	const viewer = viewerContext.get();
	const list = useWorkspacesList(
		() => false,
		() => clerk.isLoaded && Boolean(clerk.auth.userId)
	);

	let sort = $state<ProjectSortId>('updated-desc');

	const projects = $derived<WorkspaceListItem[]>(
		list.data?.pages.flatMap((page) => page.items) ?? []
	);
	const sortedProjects = $derived(sortWorkspaces(projects, sort));
	const projectCount = $derived(projects.length);
	const name = $derived(viewer.display({ name: '', email: '' }).name);
	const firstName = $derived(name.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(firstName ? `Hai, ${firstName}` : 'Hai');
</script>

<div class="flex w-full flex-1 flex-col overflow-y-auto">
	<AppPageHeader class="border-b-0">
		{#snippet title()}
			<span class="text-base font-semibold text-foreground">Home</span>
		{/snippet}
	</AppPageHeader>

	<div
		class="@container mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pt-4 pb-8 @2xl:gap-10 @2xl:px-6"
	>
		<header class="min-w-0">
			<h1
				class="font-heading text-balance text-3xl leading-tight font-bold text-foreground sm:text-4xl"
			>
				<span>{greeting}</span>
				<span class="home-greeting-wave ml-2 inline-block" aria-hidden="true">👋</span>
			</h1>
		</header>

		<HomeFeatureShortcuts />

		<section aria-labelledby="projects-heading" class="flex flex-col gap-5">
			<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div class="flex items-center gap-2.5">
					<h2
						id="projects-heading"
						class="font-heading text-lg font-bold text-foreground sm:text-xl"
					>
						Rak proyek
					</h2>
					{#if !list.isPending && !list.isError}
						<span
							class="rounded-md border-2 border-border bg-card px-1.5 py-0.5 font-mono text-micro tabular-nums text-muted-foreground"
							aria-label={`${projectCount} proyek`}
						>
							{projectCount}
						</span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					{#if !list.isPending && !list.isError && projectCount > 0}
						<ProjectSortMenu bind:value={sort} />
					{/if}
					<Button href={newProjectHref} size="sm" class="font-normal">
						<Icon icon={PlusIcon} class="size-4" />
						New
					</Button>
				</div>
			</div>

			{#if list.isPending}
				<p class="sr-only" role="status">Memuat proyek…</p>
				<div class={shelfGridClass} aria-busy="true" aria-label="Memuat proyek">
					<NewProjectCard />
					{#each skeletonCards as item (item)}
						<div
							class="flex h-[16rem] min-w-0 flex-col gap-3 overflow-hidden rounded-2xl bg-card/50 p-3 dark:bg-card"
							aria-hidden="true"
						>
							<div
								class="min-h-0 flex-1 animate-pulse rounded-xl border-2 border-border/70 bg-muted/35"
							></div>
							<div class="flex shrink-0 flex-col gap-1.5 px-0.5 pb-0.5">
								<div class="flex items-center gap-2">
									<div class="h-4 min-w-0 flex-1 animate-pulse rounded bg-muted/60"></div>
									<div class="size-8 shrink-0 animate-pulse rounded-md bg-muted/45"></div>
								</div>
								<div class="flex items-center gap-2">
									<div class="h-3 w-1/3 animate-pulse rounded bg-muted/45"></div>
									<div class="ml-auto size-7 shrink-0 animate-pulse rounded-full bg-muted/50"></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else if list.isError}
				<div role="alert" class="rounded-xl border-2 border-border bg-card p-6 sm:p-8">
					<h3 class="font-heading text-lg font-bold text-foreground">Proyekmu belum bisa dimuat</h3>
					<p class="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
						{readableApiErrorMessage(list.error, 'Coba lagi sebentar, ya.')}
					</p>
					<Button
						type="button"
						variant="outline"
						class="mt-4 min-h-11"
						onclick={() => list.refetch()}
					>
						Coba lagi
					</Button>
				</div>
			{:else if projectCount === 0}
				<div class="flex max-w-xl flex-col gap-2">
					<h3 class="font-heading text-lg font-bold text-foreground">Mulai rak pertamamu</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">
						Buat ruang kerja untuk skripsi, artikel, atau tulisan bebas. Sumber dan catatanmu akan
						tetap terhubung di satu tempat.
					</p>
				</div>
				<div class={shelfGridClass}>
					<NewProjectCard />
				</div>
			{:else}
				<div class={shelfGridClass}>
					<NewProjectCard />
					{#each sortedProjects as workspace (workspace.id)}
						<ProjectShelfCard {workspace} />
					{/each}
				</div>

				{#if list.hasNextPage}
					<Button
						type="button"
						variant="outline"
						class="mx-auto min-h-11"
						disabled={list.isFetchingNextPage}
						onclick={() => list.fetchNextPage()}
					>
						{list.isFetchingNextPage ? 'Memuat proyek…' : 'Muat lebih banyak'}
					</Button>
				{/if}
			{/if}
		</section>
	</div>
</div>

<style>
	.home-greeting-wave {
		transform-origin: 70% 85%;
		animation: home-greeting-wave 5s ease-in-out infinite;
	}

	@keyframes home-greeting-wave {
		0%,
		54%,
		100% {
			transform: rotate(0deg);
		}

		8%,
		24% {
			transform: rotate(14deg);
		}

		16% {
			transform: rotate(-8deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.home-greeting-wave {
			animation: none;
		}
	}
</style>
