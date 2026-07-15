<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Icon,
		ArchiveIcon,
		ChevronRightIcon,
		FileTextIcon,
		FolderIcon,
		MessageSquareIcon,
		MoreHorizontalIcon,
		PanelLeftIcon,
		PlusIcon,
		UploadIcon
	} from '$lib/icons';
	import PanelOpenButton from '$lib/components/layout/PanelOpenButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { panelHeaderBarClass } from '$lib/panel-surface';
	import { cn } from '$lib/utils';
	import type { BreadcrumbSegment } from '$lib/features/workspaces/utils/workspace-library-model';
	import WorkspaceEmojiPopover from './WorkspaceEmojiPopover.svelte';
	import WorkspaceTitlePopover from './WorkspaceTitlePopover.svelte';

	/** Port of `apps/web/features/workspaces/components/workspace-board-toolbar.tsx`. */
	let {
		workspaceName,
		workspaceEmoji,
		titleSlot,
		breadcrumb,
		onNavigate,
		onCreateFolder,
		onCreateDocument,
		onCreateUrl,
		onRenameWorkspace,
		onUpdateWorkspaceEmoji,
		onArchiveWorkspace,
		controls,
		onToggleChat,
		chatOpen,
		showLeftSidebarTrigger,
		onToggleLeftSidebar,
		showCreateActions = true,
		showWorkspaceSettings = true,
		barClassName
	}: {
		workspaceName: string;
		workspaceEmoji?: string;
		titleSlot?: Snippet;
		breadcrumb: BreadcrumbSegment[];
		onNavigate: (folderId: 'root' | string) => void;
		onCreateFolder: () => void;
		onCreateDocument: () => void;
		onCreateUrl: () => void;
		onRenameWorkspace: (name: string) => Promise<unknown>;
		onUpdateWorkspaceEmoji: (emoji: string) => Promise<unknown>;
		onArchiveWorkspace: () => void;
		/** Compact search / filter / sort cluster, docked in the header's right side. */
		controls?: Snippet;
		onToggleChat?: () => void;
		chatOpen?: boolean;
		showLeftSidebarTrigger?: boolean;
		onToggleLeftSidebar?: () => void;
		showCreateActions?: boolean;
		showWorkspaceSettings?: boolean;
		/** Bar surface override — e.g. `panelCardToolbarClass` when embedded INSIDE the panel card. */
		barClassName?: string;
	} = $props();

	const inSubfolder = $derived(breadcrumb.length > 1);
	const showTitleControls = $derived(showWorkspaceSettings && !titleSlot);
</script>

<div
	class={cn(
		barClassName ?? panelHeaderBarClass,
		inSubfolder && 'h-auto flex-col items-stretch gap-1'
	)}
>
	<div
		class={cn(
			'flex w-full min-w-0 items-center justify-between gap-3',
			inSubfolder && 'h-11 shrink-0'
		)}
	>
		<div class="flex min-w-0 items-center gap-1.5">
			{#if showLeftSidebarTrigger && onToggleLeftSidebar}
				<Button
					type="button"
					variant="ghost"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					onclick={onToggleLeftSidebar}
					aria-label="Buka sidebar kiri"
				>
					<Icon icon={PanelLeftIcon} class="size-3.5" />
				</Button>
			{/if}
			{#if showTitleControls}
				<WorkspaceEmojiPopover emoji={workspaceEmoji} onUpdateEmoji={onUpdateWorkspaceEmoji} />
			{/if}
			{#if titleSlot}
				{@render titleSlot()}
			{:else if showTitleControls}
				<WorkspaceTitlePopover {workspaceName} {onRenameWorkspace} />
			{:else}
				<h1
					class="self-center truncate font-sans text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg"
				>
					{workspaceName}
				</h1>
			{/if}
			{#if showCreateActions}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="ghost"
								class="size-7 shrink-0 self-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
								aria-label="Tambah item"
							>
								<Icon icon={PlusIcon} class="size-3.5" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-44">
						<DropdownMenu.Item onSelect={onCreateFolder}>
							<Icon icon={FolderIcon} class="size-4" />
							Folder
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={onCreateDocument}>
							<Icon icon={FileTextIcon} class="size-4" />
							Dokumen
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={onCreateUrl}>
							<Icon icon={UploadIcon} class="size-4" />
							Upload
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
		<div class="flex min-w-0 items-center gap-1">
			{#if controls}{@render controls()}{/if}
			{#if controls && onToggleChat}
				<span aria-hidden="true" class="mx-0.5 h-4 w-px shrink-0 bg-border/70"></span>
			{/if}
			{#if onToggleChat}
				<PanelOpenButton
					open={chatOpen ?? false}
					onOpen={() => onToggleChat?.()}
					ariaLabel="Buka panel samping"
				>
					{#snippet icon()}
						<Icon icon={MessageSquareIcon} class="size-3.5" />
					{/snippet}
				</PanelOpenButton>
			{/if}
			{#if showWorkspaceSettings}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="ghost"
								size="icon-sm"
								class="size-7 rounded-full text-muted-foreground"
								aria-label="Opsi workspace"
							>
								<Icon icon={MoreHorizontalIcon} class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-44">
						<DropdownMenu.Item variant="destructive" onSelect={onArchiveWorkspace}>
							<Icon icon={ArchiveIcon} class="size-4" />
							Archive
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	</div>
	{#if inSubfolder}
		<nav
			aria-label="Lokasi folder"
			class="flex min-w-0 items-center gap-1 pb-2 text-[12px] font-medium text-muted-foreground"
		>
			{#each breadcrumb as segment, index (segment.id)}
				{@const isLast = index === breadcrumb.length - 1}
				<span class="flex min-w-0 items-center gap-1">
					{#if index > 0}
						<Icon icon={ChevronRightIcon} class="size-3 shrink-0" />
					{/if}
					{#if isLast}
						<span class="truncate font-semibold text-foreground">{segment.label}</span>
					{:else}
						<button
							type="button"
							onclick={() => onNavigate(segment.id)}
							class="truncate hover:text-foreground"
						>
							{segment.label}
						</button>
					{/if}
				</span>
			{/each}
		</nav>
	{/if}
</div>
