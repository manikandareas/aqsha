<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import AppLoadingOverlay from '$lib/components/layout/AppLoadingOverlay.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NameDialog from '../components/NameDialog.svelte';
	import { useWorkspaceIndexData } from '../api/use-workspaces-data';
	import { Icon, ArchiveIcon, FolderIcon, MoreHorizontalIcon, PlusIcon } from '$lib/icons';

	/** Workspaces index — port `apps/web/features/workspaces/pages/workspaces-index-page.tsx` (WSP-1). */
	const data = useWorkspaceIndexData();

	let createOpen = $state(false);
	let archiveId = $state<string | null>(null);
	const archiveTarget = $derived(data.workspaces.find((workspace) => workspace._id === archiveId));
</script>

<main class="mx-auto grid w-full max-w-5xl gap-5 px-4 py-5 sm:px-8 lg:py-7">
	<header
		class="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4"
	>
		<div class="min-w-0">
			<h1 class="truncate font-heading text-2xl font-semibold tracking-normal">Workspaces</h1>
			<p class="mt-1 text-[13px] font-medium text-muted-foreground">
				{data.workspaces.length} aktif
			</p>
		</div>
		<Button type="button" onclick={() => (createOpen = true)}>
			<Icon icon={PlusIcon} class="size-4" />
			Workspace
		</Button>
	</header>

	{#if data.isLoadingWorkspaces}
		<AppLoadingOverlay variant="absolute" />
	{:else if data.workspaces.length === 0}
		<div
			class="grid min-h-[42svh] place-items-center rounded-[8px] border border-dashed border-border bg-muted/20 p-8 text-center"
		>
			<div class="grid gap-3">
				<Icon icon={FolderIcon} class="mx-auto size-8 text-muted-foreground" />
				<h2 class="font-heading text-xl font-semibold">Belum ada workspace.</h2>
				<Button type="button" onclick={() => (createOpen = true)}>
					<Icon icon={PlusIcon} class="size-4" />
					Buat workspace
				</Button>
			</div>
		</div>
	{:else}
		<section class="grid overflow-hidden rounded-[8px] border border-border">
			{#each data.workspaces as workspace (workspace._id)}
				<div
					class="grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-border/70 p-3 last:border-b-0"
				>
					<a
						href={resolve('/app/(product)/workspaces/[workspaceId]', {
							workspaceId: workspace._id
						})}
						class="min-w-0 hover:opacity-80"
					>
						<span class="truncate text-[14px] font-semibold">{workspace.name}</span>
					</a>
					<div class="flex items-center gap-2">
						<Badge variant="outline" class="hidden sm:inline-flex">Active</Badge>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Workspace actions"
									>
										<Icon icon={MoreHorizontalIcon} class="size-4" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-40">
								<DropdownMenu.Item
									variant="destructive"
									onclick={() => (archiveId = workspace._id)}
								>
									<Icon icon={ArchiveIcon} class="size-4" />
									Archive
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</div>
			{/each}
		</section>
	{/if}
</main>

<NameDialog
	open={createOpen}
	onOpenChange={(open) => (createOpen = open)}
	title="Workspace baru"
	description="Buat area riset personal."
	submitLabel="Buat"
	onSubmit={async ({ name }) => {
		await data.createWorkspace({ name });
	}}
/>
<ConfirmDialog
	open={Boolean(archiveTarget)}
	onOpenChange={(open) => {
		if (!open) archiveId = null;
	}}
	title="Archive workspace"
	description="Workspace ini disembunyikan dari daftar aktif."
	confirmLabel="Archive"
	onConfirm={async () => {
		if (archiveTarget) {
			await data.archiveWorkspace({ workspaceId: archiveTarget._id });
		}
	}}
/>
