<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Command from '@aqsha/ui-svelte/components/command';
	import NavUser from './NavUser.svelte';
	import SidebarSection from './sidebar/SidebarSection.svelte';
	import NewProjectDialog from '$lib/features/workspaces/components/NewProjectDialog.svelte';
	import { useWorkspacesList } from '$lib/features/workspaces/api';
	import { projectDisplayTitle, type Workspace } from '$lib/features/workspaces/types';
	import {
		Icon,
		BookOpenIcon,
		HomeIcon,
		LayoutGridIcon,
		PanelLeftIcon,
		PlusIcon,
		SearchIcon,
		SettingsIcon,
		TrendingUpIcon,
		type IconSvgElement
	} from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Rail navigasi kiri IA project-first: Beranda, Perpustakaan, Jelajahi, Pengaturan +
	 * daftar proyek (urut aktivitas). Thread tidak lagi global — hidup di dalam proyek.
	 */
	const PROJECTS_COLLAPSED_STORAGE_KEY = 'aqsha:sidebar:projects-collapsed';
	const sidebarItemBaseClass =
		'gap-2 font-medium transition-[background-color,color,box-shadow] duration-150 ease-out hover:bg-muted/60 data-active:bg-primary/10 data-active:font-medium data-active:text-foreground data-active:shadow-none data-active:[&_svg]:text-primary hover:text-foreground active:bg-muted active:text-foreground [&_svg]:size-3.5';

	function sidebarItemClass(active?: boolean) {
		return cn(
			sidebarItemBaseClass,
			active
				? 'bg-primary/10 text-foreground [&_svg]:text-primary'
				: 'text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground'
		);
	}

	const sidebar = Sidebar.useSidebar();
	const clerk = useClerkContext();
	const list = useWorkspacesList(
		() => false,
		() => clerk.isLoaded && Boolean(clerk.auth.userId)
	);
	const projects = $derived<Workspace[]>(list.data?.pages.flatMap((p) => p.items) ?? []);

	let commandOpen = $state(false);
	let createDialogOpen = $state(false);

	const pathname = $derived(page.url.pathname);
	const selectedProjectId = $derived(page.params.projectId);
	const isHomeActive = $derived(pathname === '/app');
	const isLibraryActive = $derived(pathname.startsWith('/app/library'));
	const isExploreActive = $derived(pathname.startsWith('/app/explore'));
	const isSettingsActive = $derived(pathname.startsWith('/app/settings'));

	function closeSidebar() {
		if (sidebar.isMobile) {
			sidebar.setOpenMobile(false);
			return;
		}
		sidebar.setOpen(false);
	}

	function runCreateProject() {
		commandOpen = false;
		createDialogOpen = true;
	}

	function handleShortcut(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			commandOpen = true;
		}
	}
</script>

<svelte:window onkeydown={handleShortcut} />

{#snippet projectEmojiGlyph(emoji: string | null, active: boolean)}
	<span
		aria-hidden="true"
		class={cn(
			'flex size-4 shrink-0 items-center justify-center rounded-sm text-[13px] leading-none',
			active ? 'bg-background/70' : 'bg-muted/35'
		)}
	>
		{emoji?.trim() || '📚'}
	</span>
{/snippet}

{#snippet navItem(href: string, label: string, icon: IconSvgElement, active: boolean)}
	<Sidebar.MenuItem class="min-w-0 overflow-hidden">
		<Sidebar.MenuButton isActive={active} size="rail" class={sidebarItemClass(active)}>
			{#snippet child({ props })}
				<a {...props} {href}>
					<Icon {icon} class="size-3.5 shrink-0" />
					<span>{label}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

<Sidebar.Root collapsible="offcanvas" variant="inset">
	<Sidebar.Header class="gap-3 px-3 pb-3 pt-3.5">
		<div class="flex items-center gap-1.5 pl-1.5 pr-2.5">
			<button
				type="button"
				onclick={closeSidebar}
				class="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
				aria-label="Tutup sidebar kiri"
			>
				<Icon icon={PanelLeftIcon} class="size-3.5" />
			</button>
			<button
				type="button"
				onclick={() => (commandOpen = true)}
				class="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
				aria-label="Cari proyek"
			>
				<Icon icon={SearchIcon} class="size-3.5" />
			</button>
		</div>

		<Sidebar.Menu class="gap-1">
			{@render navItem(resolve('/app/(product)'), 'Beranda', HomeIcon, isHomeActive)}
			{@render navItem(resolve('/app/(product)/library'), 'Perpustakaan', BookOpenIcon, isLibraryActive)}
			{@render navItem(resolve('/app/(product)/explore'), 'Jelajahi', TrendingUpIcon, isExploreActive)}
			{@render navItem(resolve('/app/settings/overview'), 'Pengaturan', SettingsIcon, isSettingsActive)}
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="min-h-0 px-3 pb-3 pt-2">
		<SidebarSection label="Proyek" first collapsible storageKey={PROJECTS_COLLAPSED_STORAGE_KEY}>
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
						{@const active = project.id === selectedProjectId}
						<Sidebar.MenuItem class="min-w-0 overflow-hidden">
							<Sidebar.MenuButton
								isActive={active}
								size="rail"
								class={cn(sidebarItemClass(active), 'w-full min-w-0 max-w-full overflow-hidden')}
							>
								{#snippet child({ props })}
									<a
										{...props}
										href={resolve('/app/(product)/projects/[projectId]', { projectId: project.id })}
									>
										{@render projectEmojiGlyph(project.emoji, active)}
										<span class="min-w-0 flex-1 truncate font-normal">
											{projectDisplayTitle(project)}
										</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
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
	</Sidebar.Content>

	<Sidebar.Footer class="mt-auto gap-3 p-3">
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>

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
						{@render projectEmojiGlyph(project.emoji, false)}
						<span class="truncate">{projectDisplayTitle(project)}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>

<NewProjectDialog open={createDialogOpen} onOpenChange={(open) => (createDialogOpen = open)} />
