<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import * as Command from '@aqsha/ui-svelte/components/command';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as ContextMenu from '@aqsha/ui-svelte/components/context-menu';
	import * as AlertDialog from '@aqsha/ui-svelte/components/alert-dialog';
	import { buttonVariants } from '@aqsha/ui-svelte/components/button';
	import NavUser from './NavUser.svelte';
	import SidebarSection from './sidebar/SidebarSection.svelte';
	import { sidebarItemClass } from './sidebar/sidebar-item-class';
	import NameDialog from '$lib/features/workspaces/components/NameDialog.svelte';
	import {
		useWorkspacesList,
		useUpdateWorkspace,
		useArchiveWorkspace
	} from '$lib/features/workspaces/api';
	import { mainTypFilename } from '$lib/features/workspaces/main-typ-filename';
	import { projectDisplayTitle, type Workspace } from '$lib/features/workspaces/types';
	import {
		Icon,
		BookOpenIcon,
		ChevronRightIcon,
		FileText,
		FolderIcon,
		HomeIcon,
		LayoutGridIcon,
		MoreHorizontalIcon,
		PanelLeftIcon,
		PencilIcon,
		PlusIcon,
		Quote,
		SearchIcon,
		SettingsIcon,
		Trash2Icon,
		TrendingUpIcon,
		type IconSvgElement
	} from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Rail navigasi kiri IA project-first: Beranda, Perpustakaan, Jelajahi, Pengaturan +
	 * daftar proyek (urut aktivitas). Thread tidak lagi global — hidup di dalam proyek.
	 */
	// Sub-rows (kind.typ, Referensi) mirror the parent project row's type: 12px label + muted ink,
	// mint when active. `[&>svg]` overrides beat MenuSubButton's built-in direct-child icon color.
	const sidebarSubItemBaseClass =
		'gap-2 font-normal text-muted-foreground transition-[background-color,color] duration-150 ease-out [&>svg]:size-3.5 [&>svg]:text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:[&>svg]:text-foreground active:bg-muted active:text-foreground data-active:bg-primary/10 data-active:text-foreground data-active:[&>svg]:text-primary';

	const sidebar = Sidebar.useSidebar();
	const clerk = useClerkContext();
	const list = useWorkspacesList(
		() => false,
		() => clerk.isLoaded && Boolean(clerk.auth.userId)
	);
	const projects = $derived<Workspace[]>(list.data?.pages.flatMap((p) => p.items) ?? []);

	let commandOpen = $state(false);

	const pathname = $derived(page.url.pathname);
	const selectedProjectId = $derived(page.params.projectId);

	// Which project rows are expanded to reveal their children (kind.typ + Referensi). The project
	// you navigate into auto-expands; a manual collapse afterward sticks until you visit it again.
	const expandedProjects = new SvelteSet<string>();
	// Idempotent like a boolean $state: skip when already in the requested state. The controlled
	// Collapsible can fire onOpenChange with its current value, and an unconditional SvelteSet
	// add/delete would bump the set that `open` reads — re-entering and looping the reactive graph.
	function setProjectExpanded(id: string, open: boolean) {
		if (open === expandedProjects.has(id)) return;
		if (open) expandedProjects.add(id);
		else expandedProjects.delete(id);
	}
	// Auto-expand only in response to navigation. `untrack` keeps this effect from depending on the
	// set it writes, so it runs on route change alone rather than on every expand/collapse.
	$effect(() => {
		const id = selectedProjectId;
		if (id) untrack(() => setProjectExpanded(id, true));
	});
	const isHomeActive = $derived(pathname === '/app');
	const isLibraryActive = $derived(pathname.startsWith('/app/library'));
	const isExploreActive = $derived(pathname.startsWith('/app/explore'));
	const isSettingsActive = $derived(pathname.startsWith('/app/settings'));

	// Desktop rail collapsed to icons. Mobile renders as a full-width sheet (never "icon" mode), so
	// guard on isMobile to keep the sheet showing the full rows, not the collapsed icon variant.
	const collapsed = $derived(!sidebar.isMobile && sidebar.state === 'collapsed');

	function runCreateProject() {
		commandOpen = false;
		void goto(resolve('/app/(product)/projects/new'));
	}

	// Per-project rename/delete. One dialog instance each, driven by the selected row. "Delete"
	// archives: the list query excludes archived, so the row simply leaves the rail.
	const updateWorkspace = useUpdateWorkspace();
	const archiveWorkspace = useArchiveWorkspace();
	let renameTarget = $state<Workspace | null>(null);
	let deleteTarget = $state<Workspace | null>(null);

	async function submitRename({ name }: { name: string }) {
		const target = renameTarget;
		if (!target) return;
		await updateWorkspace.mutateAsync({ id: target.id, name });
		renameTarget = null;
	}

	async function confirmDelete() {
		const target = deleteTarget;
		if (!target) return;
		deleteTarget = null;
		await archiveWorkspace.mutateAsync({ id: target.id });
		// Don't strand the user on the page of a project that no longer exists in the rail.
		if (target.id === selectedProjectId) void goto(resolve('/app/(product)'));
	}

	function handleShortcut(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			commandOpen = true;
		}
	}

	type StaticNavRoute =
		| '/app/(product)'
		| '/app/(product)/library'
		| '/app/(product)/explore'
		| '/app/settings/overview';
</script>

<svelte:window onkeydown={handleShortcut} />

{#snippet navItem(route: StaticNavRoute, label: string, icon: IconSvgElement, active: boolean)}
	<Sidebar.MenuItem class="min-w-0 overflow-hidden">
		<Sidebar.MenuButton
			isActive={active}
			size="rail"
			class={sidebarItemClass(active)}
			tooltipContent={label}
		>
			{#snippet child({ props })}
				<a {...props} href={resolve(route)}>
					<Icon {icon} class="size-3.5 shrink-0 group-data-[collapsible=icon]:size-4" />
					<span>{label}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

<Sidebar.Root collapsible="icon" variant="inset">
	<Sidebar.Header class="gap-3 px-3 pb-3 pt-3.5 group-data-[collapsible=icon]:px-0">
		<!-- pl aligns the toggle/search icons onto the same vertical column as the nav + project
		icons below (rail buttons inset their icon 8px; a centered size-6 button needs this nudge).
		Collapsed: the row centers the toggle (which now expands the rail) and hides search. -->
		<div
			class="flex items-center gap-1.5 pl-[3px] pr-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
		>
			<button
				type="button"
				onclick={() => sidebar.toggle()}
				class="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-md"
				aria-label={collapsed ? 'Buka sidebar kiri' : 'Tutup sidebar kiri'}
			>
				<Icon icon={PanelLeftIcon} class="size-3.5 group-data-[collapsible=icon]:size-4" />
			</button>
			<button
				type="button"
				onclick={() => (commandOpen = true)}
				class="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary group-data-[collapsible=icon]:hidden"
				aria-label="Cari proyek"
			>
				<Icon icon={SearchIcon} class="size-3.5" />
			</button>
		</div>

		<Sidebar.Menu class="gap-1 group-data-[collapsible=icon]:items-center">
			{@render navItem('/app/(product)', 'Beranda', HomeIcon, isHomeActive)}
			{@render navItem('/app/(product)/library', 'Perpustakaan', BookOpenIcon, isLibraryActive)}
			{@render navItem('/app/(product)/explore', 'Jelajahi', TrendingUpIcon, isExploreActive)}
			{@render navItem('/app/settings/overview', 'Pengaturan', SettingsIcon, isSettingsActive)}
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="min-h-0 px-3 pb-3 pt-2 group-data-[collapsible=icon]:px-0">
		{#if !collapsed}
			<SidebarSection label="Proyek" first>
				{#snippet action()}
					<button
						type="button"
						onclick={runCreateProject}
						class="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
						aria-label="Proyek baru"
					>
						<Icon icon={PlusIcon} class="size-3.5" />
					</button>
				{/snippet}
				{#if projects.length > 0}
					<Sidebar.Menu class="min-w-0 gap-1 overflow-hidden">
						{#each projects as project (project.id)}
							{@const inProject = project.id === selectedProjectId}
							{@const detailHref = resolve('/app/(product)/projects/[projectId]', {
								projectId: project.id
							})}
							{@const referencesHref = `${detailHref}/references`}
							{@const open = expandedProjects.has(project.id)}
							<Collapsible.Root {open} onOpenChange={(v) => setProjectExpanded(project.id, v)}>
								<Sidebar.MenuItem class="min-w-0 overflow-hidden pl-[3px]">
									<ContextMenu.Root>
										<ContextMenu.Trigger class="flex min-w-0 items-center gap-0.5">
											<button
												type="button"
												class={cn(
													'flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 ease-out hover:bg-muted/60',
													inProject ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
												)}
												aria-label={open ? 'Tutup isi proyek' : 'Buka isi proyek'}
												aria-expanded={open}
												onclick={() => setProjectExpanded(project.id, !open)}
											>
												{#if inProject || open}
													<Icon
														icon={ChevronRightIcon}
														class={cn(
															'size-3.5 transition-transform duration-200 ease-out',
															open && 'rotate-90'
														)}
													/>
												{:else}
													<!-- Idle: folder, crossfading to a chevron on row hover/focus. Both icons stack
												in one grid cell so the swap is opacity-only (no layout jump). -->
													<span
														class="relative grid size-3.5 place-items-center [&>*]:col-start-1 [&>*]:row-start-1"
													>
														<Icon
															icon={FolderIcon}
															class="size-3.5 transition-opacity duration-150 group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0"
														/>
														<Icon
															icon={ChevronRightIcon}
															class="size-3.5 opacity-0 transition-opacity duration-150 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
														/>
													</span>
												{/if}
											</button>
											<!-- Parent never takes the active (primary) surface — only child rows do. -->
											<Sidebar.MenuButton
												isActive={false}
												size="rail"
												class={cn(sidebarItemClass(false), 'min-w-0 flex-1 overflow-hidden')}
											>
												{#snippet child({ props })}
													<a {...props} href={detailHref}>
														<span class="min-w-0 flex-1 truncate font-normal">
															{projectDisplayTitle(project)}
														</span>
													</a>
												{/snippet}
											</Sidebar.MenuButton>
											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													{#snippet child({ props })}
														<!-- Trailing action: hidden on desktop until the row is hovered/focused or the
													menu is open; always shown on touch (no hover) via the unset mobile default. -->
														<button
															{...props}
															type="button"
															class="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color,opacity] duration-150 ease-out group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100 hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 data-[state=open]:bg-muted/60 data-[state=open]:text-foreground data-[state=open]:opacity-100 md:opacity-0"
															aria-label="Aksi proyek"
														>
															<Icon icon={MoreHorizontalIcon} class="size-3.5" />
														</button>
													{/snippet}
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end" class="min-w-40">
													<DropdownMenu.Item onSelect={() => (renameTarget = project)}>
														<Icon icon={PencilIcon} class="size-4" />
														<span>Ubah nama</span>
													</DropdownMenu.Item>
													<DropdownMenu.Item
														variant="destructive"
														onSelect={() => (deleteTarget = project)}
													>
														<Icon icon={Trash2Icon} class="size-4" />
														<span>Hapus</span>
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										</ContextMenu.Trigger>
										<ContextMenu.Content class="min-w-40">
											<ContextMenu.Item onSelect={() => (renameTarget = project)}>
												<Icon icon={PencilIcon} class="size-4" />
												<span>Ubah nama</span>
											</ContextMenu.Item>
											<ContextMenu.Item
												variant="destructive"
												onSelect={() => (deleteTarget = project)}
											>
												<Icon icon={Trash2Icon} class="size-4" />
												<span>Hapus</span>
											</ContextMenu.Item>
										</ContextMenu.Content>
									</ContextMenu.Root>
									<Collapsible.Content>
										<Sidebar.MenuSub class="mr-0">
											<Sidebar.MenuSubItem>
												<Sidebar.MenuSubButton
													size="sm"
													isActive={pathname === detailHref}
													class={sidebarSubItemBaseClass}
												>
													{#snippet child({ props })}
														<a {...props} href={detailHref}>
															<Icon icon={FileText} class="shrink-0" />
															<span>{mainTypFilename(project.kind)}</span>
														</a>
													{/snippet}
												</Sidebar.MenuSubButton>
											</Sidebar.MenuSubItem>
											<Sidebar.MenuSubItem>
												<Sidebar.MenuSubButton
													size="sm"
													isActive={pathname === referencesHref}
													class={sidebarSubItemBaseClass}
												>
													{#snippet child({ props })}
														<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- this legacy child path has no route ID yet. -->
														<a {...props} href={referencesHref}>
															<Icon icon={Quote} class="shrink-0" />
															<span>Referensi</span>
														</a>
													{/snippet}
												</Sidebar.MenuSubButton>
											</Sidebar.MenuSubItem>
										</Sidebar.MenuSub>
									</Collapsible.Content>
								</Sidebar.MenuItem>
							</Collapsible.Root>
						{/each}
					</Sidebar.Menu>
				{:else}
					<div
						class="rounded-sm border border-dashed border-border/70 px-2.5 py-2 text-label font-medium leading-5 text-muted-foreground"
					>
						Belum ada proyek.
					</div>
				{/if}
			</SidebarSection>
		{/if}
	</Sidebar.Content>

	<Sidebar.Footer class="mt-auto gap-3 p-3 group-data-[collapsible=icon]:p-2">
		<NavUser />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>

<NameDialog
	open={renameTarget !== null}
	onOpenChange={(next) => {
		if (!next) renameTarget = null;
	}}
	title="Judul proyek"
	description="Judul bisa diubah kapan saja."
	submitLabel="Simpan"
	initialName={renameTarget?.name ?? ''}
	onSubmit={submitRename}
/>

<AlertDialog.Root
	open={deleteTarget !== null}
	onOpenChange={(next) => {
		if (!next) deleteTarget = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Hapus proyek ini?</AlertDialog.Title>
			<AlertDialog.Description>
				{deleteTarget ? projectDisplayTitle(deleteTarget) : 'Proyek'} akan diarsipkan dan hilang dari
				daftar.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Batal</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive-solid' })}
				onclick={confirmDelete}
			>
				Hapus
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<Command.Dialog bind:open={commandOpen}>
	<Command.Input placeholder="Cari atau buat..." />
	<Command.List>
		<Command.Empty>Tidak ada hasil.</Command.Empty>
		<Command.Group heading="Buat">
			<Command.Item onSelect={runCreateProject}>
				<Icon icon={LayoutGridIcon} class="size-4" />
				Proyek baru
			</Command.Item>
		</Command.Group>
		<Command.Group heading="Buka">
			<Command.Item
				value="buka-beranda"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/(product)'));
				}}
			>
				<Icon icon={HomeIcon} class="size-4" />
				Beranda
			</Command.Item>
			<Command.Item
				value="buka-perpustakaan"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/(product)/library'));
				}}
			>
				<Icon icon={BookOpenIcon} class="size-4" />
				Perpustakaan
			</Command.Item>
			<Command.Item
				value="buka-jelajahi"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/(product)/explore'));
				}}
			>
				<Icon icon={TrendingUpIcon} class="size-4" />
				Jelajahi
			</Command.Item>
			<Command.Item
				value="buka-pengaturan"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/settings/overview'));
				}}
			>
				<Icon icon={SettingsIcon} class="size-4" />
				Pengaturan
			</Command.Item>
		</Command.Group>
		{#if projects.length > 0}
			<Command.Group heading="Proyek">
				{#each projects as project (project.id)}
					<Command.Item
						value={`project-${project.id}`}
						keywords={[projectDisplayTitle(project)]}
						onSelect={() => {
							commandOpen = false;
							goto(resolve('/app/(product)/projects/[projectId]', { projectId: project.id }));
						}}
					>
						<span class="truncate">{projectDisplayTitle(project)}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>
