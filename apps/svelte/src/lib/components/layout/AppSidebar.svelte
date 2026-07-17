<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Command from '@aqsha/ui-svelte/components/command';
	import NavUser from './NavUser.svelte';
	import SidebarSection from './sidebar/SidebarSection.svelte';
	import ThreadArchiveGroup from './sidebar/ThreadArchiveGroup.svelte';
	import ThreadActionsMenu from '$lib/features/thread-experience/components/ThreadActionsMenu.svelte';
	import CreateWorkspacePopover from '$lib/features/workspaces/components/CreateWorkspacePopover.svelte';
	import NameDialog from '$lib/features/workspaces/components/NameDialog.svelte';
	import {
		useWorkspaceIndexData,
		type SidebarThread,
		type SidebarWorkspace
	} from '$lib/features/workspaces/api/use-workspaces-data';
	import {
		Icon,
		HomeIcon,
		LayoutGridIcon,
		MessageSquareIcon,
		PanelLeftIcon,
		PinIcon,
		PlusIcon,
		SearchIcon,
		SettingsIcon,
		TrendingUpIcon
	} from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Left navigation rail. Fetches sidebar data via `useWorkspaceIndexData()` (reactive getters);
	 * selection derives from the route. Renders the workspace tree + thread groups (pinned / recent /
	 * older) with per-row `ThreadActionsMenu`, `CreateWorkspacePopover`, collapsible sections, and the
	 * ⌘K command palette.
	 */
	const MOBILE_THREAD_TITLE_MAX_CHARS = 42;
	const THREADS_COLLAPSED_STORAGE_KEY = 'aqsha:sidebar:threads-collapsed';
	const WORKSPACES_COLLAPSED_STORAGE_KEY = 'aqsha:sidebar:workspaces-collapsed';
	// Sizing/type/radius live in the menu-button `rail` size variant; this carries the rail's
	// state grammar. Hover icons follow the text to foreground (green icon over the muted hover
	// fill misses 3:1); the primary icon is reserved for the active row, where it clears it.
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
	const data = useWorkspaceIndexData();

	let commandOpen = $state(false);
	let createDialogOpen = $state(false);

	const pathname = $derived(page.url.pathname);
	const selectedThreadId = $derived(page.params.threadId);
	const selectedWorkspaceId = $derived(page.params.workspaceId);
	const isHomeActive = $derived(pathname === '/app' && !selectedThreadId);
	const isWorkspaceRoute = $derived(pathname.startsWith('/app/workspaces'));
	const isExploreActive = $derived(pathname.startsWith('/app/explore'));

	const sortedWorkspaces = $derived(
		[...data.workspaces].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
	);
	const sortedThreads = $derived(
		[...data.threads].sort((a, b) => b.lastActivityAt - a.lastActivityAt)
	);
	// Thread yang disematkan diangkat ke grup "Disematkan" (urut pinnedAt DESC). Sisanya (unpinned)
	// dipisah recent/older dari BE (ThreadService.list `bucket`).
	const pinnedThreads = $derived(
		data.threads
			.filter((t) => t.pinnedAt != null)
			.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
	);
	const unpinnedThreads = $derived(sortedThreads.filter((t) => t.pinnedAt == null));
	const recentThreads = $derived(unpinnedThreads.filter((t) => t.bucket !== 'older'));
	const olderThreads = $derived(unpinnedThreads.filter((t) => t.bucket === 'older'));

	async function submitCreateWorkspace({ name }: { name: string }) {
		const workspaceId = await data.createWorkspace({ name });
		await goto(
			resolve('/app/(product)/workspaces/[workspaceId]', { workspaceId: String(workspaceId) })
		);
	}

	function runCreateThread() {
		commandOpen = false;
		void goto(resolve('/app/(product)'));
	}

	function runCreateWorkspace() {
		commandOpen = false;
		createDialogOpen = true;
	}

	function closeSidebar() {
		if (sidebar.isMobile) {
			sidebar.setOpenMobile(false);
			return;
		}
		sidebar.setOpen(false);
	}

	async function handleDeleteThread(thread: SidebarThread) {
		await data.removeThread({ threadId: thread.threadId });
		if (pathname === `/app/threads/${thread.threadId}`) {
			if (thread.workspaceId) {
				await goto(
					resolve('/app/(product)/workspaces/[workspaceId]', { workspaceId: thread.workspaceId })
				);
			} else {
				await goto(resolve('/app/(product)'));
			}
		}
	}

	async function handleTogglePin(thread: SidebarThread) {
		await data.togglePinThread({ threadId: thread.threadId, pinned: thread.pinnedAt == null });
	}

	function truncateCharacters(value: string, maxLength: number) {
		const trimmed = value.trim();
		if (trimmed.length <= maxLength) return trimmed;
		return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`;
	}

	function handleShortcut(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			commandOpen = true;
		}
	}
</script>

<svelte:window onkeydown={handleShortcut} />

{#snippet workspaceEmojiGlyph(emoji: string | undefined, active: boolean)}
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

{#snippet workspaceRow(workspace: SidebarWorkspace)}
	{@const active = isWorkspaceRoute && workspace._id === selectedWorkspaceId}
	<Sidebar.MenuItem class="min-w-0 overflow-hidden">
		<Sidebar.MenuButton
			isActive={active}
			size="rail"
			class={cn(sidebarItemClass(active), 'w-full min-w-0 max-w-full overflow-hidden')}
		>
			{#snippet child({ props })}
				<a
					{...props}
					href={resolve('/app/(product)/workspaces/[workspaceId]', { workspaceId: workspace._id })}
				>
					{@render workspaceEmojiGlyph(workspace.emoji, active)}
					<span class="min-w-0 flex-1 truncate font-normal">{workspace.name}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

{#snippet threadRow(thread: SidebarThread)}
	{@const active = thread.threadId === selectedThreadId}
	{@const isPinned = thread.pinnedAt != null}
	{@const deleteDescription = thread.workspaceId
		? 'Thread dan pesannya akan dihapus permanen dari workspace ini.'
		: 'Thread dan pesannya akan dihapus permanen.'}
	<Sidebar.MenuItem class="min-w-0 overflow-hidden">
		<Sidebar.MenuButton
			isActive={active}
			size="rail"
			class={cn(sidebarItemClass(active), 'w-full min-w-0 max-w-full overflow-hidden pr-8')}
		>
			{#snippet child({ props })}
				<a
					{...props}
					href={resolve('/app/(product)/threads/[threadId]', { threadId: thread.threadId })}
					aria-label={thread.title}
					title={thread.title}
				>
					<Icon icon={MessageSquareIcon} class="size-3.5 shrink-0" />
					<span class="min-w-0 flex-1 truncate font-normal">
						{truncateCharacters(thread.title, MOBILE_THREAD_TITLE_MAX_CHARS)}
					</span>
					{#if isPinned}
						<Icon icon={PinIcon} class="size-3 shrink-0 text-primary" />
					{/if}
					{#if thread.status === 'streaming'}
						<span class="inline-flex size-1.5 shrink-0 rounded-full bg-primary"></span>
					{/if}
				</a>
			{/snippet}
		</Sidebar.MenuButton>
		<ThreadActionsMenu
			variant="sidebar-row"
			description={deleteDescription}
			onDelete={() => handleDeleteThread(thread)}
			{isPinned}
			onTogglePin={() => handleTogglePin(thread)}
		/>
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
				aria-label="Cari thread"
			>
				<Icon icon={SearchIcon} class="size-3.5" />
			</button>
		</div>

		<Sidebar.Menu class="gap-1">
			<Sidebar.MenuItem class="min-w-0 overflow-hidden">
				<Sidebar.MenuButton
					isActive={isHomeActive}
					size="rail"
					class={sidebarItemClass(isHomeActive)}
				>
					{#snippet child({ props })}
						<a {...props} href={resolve('/app/(product)')}>
							<Icon icon={HomeIcon} class="size-3.5 shrink-0" />
							<span>Home</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem class="min-w-0 overflow-hidden">
				<Sidebar.MenuButton
					isActive={isExploreActive}
					size="rail"
					class={sidebarItemClass(isExploreActive)}
				>
					{#snippet child({ props })}
						<a {...props} href={resolve('/app/(product)/explore')}>
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
			<SidebarSection
				label="Workspaces"
				first
				collapsible
				storageKey={WORKSPACES_COLLAPSED_STORAGE_KEY}
			>
				{#snippet action()}
					<CreateWorkspacePopover onSubmit={submitCreateWorkspace} />
				{/snippet}
				{#if sortedWorkspaces.length > 0}
					<Sidebar.Menu class="min-w-0 gap-1 overflow-hidden">
						{#each sortedWorkspaces as workspace (workspace._id)}
							{@render workspaceRow(workspace)}
						{/each}
					</Sidebar.Menu>
				{:else}
					<div
						class="rounded-sm border border-dashed border-border/70 px-2.5 py-2 text-label font-medium leading-5 text-muted-foreground"
					>
						Belum ada workspace.
					</div>
				{/if}
			</SidebarSection>

			<SidebarSection label="Threads" collapsible storageKey={THREADS_COLLAPSED_STORAGE_KEY}>
				{#snippet action()}
					<button
						type="button"
						onclick={runCreateThread}
						class="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
						aria-label="Thread baru"
					>
						<Icon icon={PlusIcon} class="size-3.5" />
					</button>
				{/snippet}
				{#if sortedThreads.length > 0}
					<div class="min-w-0 overflow-hidden">
						<Sidebar.Menu class="min-w-0 gap-1 overflow-hidden">
							{#if pinnedThreads.length > 0}
								<li role="presentation" aria-hidden="true" class="flex items-center gap-1 px-1">
									<Icon icon={PinIcon} class="size-3 shrink-0 text-primary" />
									<span
										class="min-w-0 flex-1 truncate text-label font-medium text-muted-foreground"
									>
										Disematkan
									</span>
								</li>
								{#each pinnedThreads as thread (thread.threadId)}
									{@render threadRow(thread)}
								{/each}
							{/if}
							{#each recentThreads as thread (thread.threadId)}
								{@render threadRow(thread)}
							{/each}
						</Sidebar.Menu>
						{#if olderThreads.length > 0}
							<ThreadArchiveGroup threads={olderThreads} {selectedThreadId} {threadRow} />
						{/if}
					</div>
				{:else}
					<div
						class="rounded-sm border border-dashed border-border/70 px-2.5 py-2 text-label font-medium leading-5 text-muted-foreground"
					>
						Belum ada thread.
					</div>
				{/if}
			</SidebarSection>
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
			<Command.Item onSelect={runCreateThread}>
				<Icon icon={MessageSquareIcon} class="size-4" />
				Chat baru
			</Command.Item>
			<Command.Item onSelect={runCreateWorkspace}>
				<Icon icon={LayoutGridIcon} class="size-4" />
				Workspace baru
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
		{#if sortedWorkspaces.length > 0}
			<Command.Group heading="Workspaces">
				{#each sortedWorkspaces as workspace (workspace._id)}
					<Command.Item
						value={`workspace-${workspace._id}`}
						keywords={[workspace.name]}
						onSelect={() => {
							commandOpen = false;
							goto(
								resolve('/app/(product)/workspaces/[workspaceId]', { workspaceId: workspace._id })
							);
						}}
					>
						{@render workspaceEmojiGlyph(workspace.emoji, false)}
						<span class="truncate">{workspace.name}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if sortedThreads.length > 0}
			<Command.Group heading="Threads">
				{#each sortedThreads as thread (thread.threadId)}
					<Command.Item
						value={`thread-${thread.threadId}`}
						keywords={[thread.title]}
						onSelect={() => {
							commandOpen = false;
							goto(resolve('/app/(product)/threads/[threadId]', { threadId: thread.threadId }));
						}}
					>
						<Icon icon={MessageSquareIcon} class="size-4" />
						<span class="truncate">{thread.title}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>

<NameDialog
	open={createDialogOpen}
	onOpenChange={(open) => (createDialogOpen = open)}
	title="Workspace baru"
	description="Buat area riset personal."
	submitLabel="Buat"
	onSubmit={submitCreateWorkspace}
/>
