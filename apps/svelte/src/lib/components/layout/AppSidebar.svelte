<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import NavUser from './NavUser.svelte';
	import {
		Icon,
		HomeIcon,
		MessageSquareIcon,
		PanelLeftIcon,
		SearchIcon,
		SettingsIcon,
		TrendingUpIcon
	} from '$lib/icons';
	import { cn } from '$lib/utils';

	/**
	 * Left navigation rail — Phase-3 shell CHROME ported from apps/web/components/app-sidebar.tsx.
	 * Header (collapse + search buttons, Home / Jelajahi nav), footer (NavUser), and the ⌘K
	 * command palette (create + open). The workspace/thread SECTIONS (data-driven rows,
	 * ThreadActionsMenu, CreateWorkspacePopover, collapsible sections) are wired in Phase 7/9;
	 * until then the content shows the empty-state placeholder, matching web's no-items branch.
	 */
	const sidebar = Sidebar.useSidebar();

	let commandOpen = $state(false);

	const pathname = $derived(page.url.pathname);
	const isHomeActive = $derived(pathname === '/app');
	const isExploreActive = $derived(pathname.startsWith('/app/explore'));

	const sidebarItemBaseClass =
		'h-8 gap-2 rounded-[8px] px-2.5 py-0 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 ease-out hover:bg-muted/60 data-active:bg-primary/10 data-active:font-medium data-active:text-foreground data-active:shadow-none data-active:[&_svg]:text-primary hover:text-foreground active:bg-muted active:text-foreground [&_svg]:size-3.5';

	function sidebarItemClass(active?: boolean) {
		return cn(
			sidebarItemBaseClass,
			active
				? 'bg-primary/10 text-foreground [&_svg]:text-primary'
				: 'text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-primary/70'
		);
	}

	function closeSidebar() {
		if (sidebar.isMobile) {
			sidebar.setOpenMobile(false);
			return;
		}
		sidebar.setOpen(false);
	}

	function handleShortcut(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			commandOpen = true;
		}
	}
</script>

<svelte:window onkeydown={handleShortcut} />

<Sidebar.Root collapsible="offcanvas" variant="transparent">
	<Sidebar.Header class="gap-3 px-3 pb-3 pt-3.5">
		<div class="flex items-center gap-1.5 pl-1.5 pr-2.5">
			<button
				type="button"
				onclick={closeSidebar}
				class="flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
				aria-label="Tutup sidebar kiri"
			>
				<Icon icon={PanelLeftIcon} class="size-3.5" />
			</button>
			<button
				type="button"
				onclick={() => (commandOpen = true)}
				class="flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
				aria-label="Cari thread"
			>
				<Icon icon={SearchIcon} class="size-3.5" />
			</button>
		</div>

		<Sidebar.Menu class="gap-1">
			<Sidebar.MenuItem class="min-w-0 overflow-hidden">
				<Sidebar.MenuButton
					isActive={isHomeActive}
					size="sm"
					class={sidebarItemClass(isHomeActive)}
				>
					{#snippet child({ props })}
						<a href={resolve('/app')} {...props}>
							<Icon icon={HomeIcon} class="size-3.5 shrink-0" />
							<span>Home</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem class="min-w-0 overflow-hidden">
				<Sidebar.MenuButton
					isActive={isExploreActive}
					size="sm"
					class={sidebarItemClass(isExploreActive)}
				>
					{#snippet child({ props })}
						<a href={resolve('/app/explore')} {...props}>
							<Icon icon={TrendingUpIcon} class="size-3.5 shrink-0" />
							<span>Jelajahi</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="min-h-0 px-3 pb-3 pt-2">
		<div class="grid min-w-0 gap-5 overflow-hidden">
			<div
				class="rounded-[8px] border border-dashed border-mint-soft-border bg-mint-soft/50 px-3 py-4 text-center text-[12px] leading-relaxed text-muted-foreground"
			>
				Belum ada thread atau workspace.
			</div>
		</div>
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
			<Command.Item
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app'));
				}}
			>
				<Icon icon={MessageSquareIcon} class="size-4" />
				Chat baru
			</Command.Item>
		</Command.Group>
		<Command.Group heading="Buka">
			<Command.Item
				value="buka-beranda"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app'));
				}}
			>
				<Icon icon={HomeIcon} class="size-4" />
				Beranda
			</Command.Item>
			<Command.Item
				value="buka-jelajahi"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/explore'));
				}}
			>
				<Icon icon={TrendingUpIcon} class="size-4" />
				Jelajahi
			</Command.Item>
			<Command.Item
				value="buka-pengaturan"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/settings'));
				}}
			>
				<Icon icon={SettingsIcon} class="size-4" />
				Pengaturan
			</Command.Item>
		</Command.Group>
	</Command.List>
</Command.Dialog>
