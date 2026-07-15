<script module lang="ts">
	async function copyTextToClipboard(text: string) {
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return;
			} catch {
				copyTextWithSelection(text);
				return;
			}
		}

		copyTextWithSelection(text);
	}

	function copyTextWithSelection(text: string) {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.top = '-1000px';
		textarea.style.left = '-1000px';
		document.body.appendChild(textarea);
		textarea.select();

		try {
			document.execCommand('copy');
		} finally {
			textarea.remove();
		}
	}
</script>

<script lang="ts">
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import {
		Icon,
		BookmarkIcon,
		CheckIcon,
		ExternalLinkIcon,
		FolderIcon,
		LinkIcon,
		PenLineIcon,
		Trash2Icon
	} from '$lib/icons';
	import type { MoveTargetOption } from '$lib/features/workspaces/utils/workspace-library-model';
	import MoveToWorkspaceContextSubmenu, {
		type WorkspaceMoveTarget
	} from './MoveToWorkspaceContextSubmenu.svelte';

	/** Artifact right-click menu content — port of `ArtifactContextMenuContent` (workspace-library-context-menus.tsx). */
	let {
		moveTargets,
		workspaces,
		artifactHref,
		isSelected,
		onSelect,
		onOpen,
		onRename,
		onDelete,
		onMove,
		onMoveToWorkspace,
		onAddToCitations
	}: {
		moveTargets: MoveTargetOption[];
		workspaces: WorkspaceMoveTarget[];
		artifactHref: string;
		isSelected: boolean;
		onSelect: () => void;
		onOpen: () => void;
		onRename: () => void;
		onDelete: () => void;
		onMove: (target: string) => void;
		onMoveToWorkspace: (targetWorkspaceId: string) => void;
		/** Fase 2 bridge — hanya untuk paper saat Citation Manager aktif. */
		onAddToCitations?: () => void;
	} = $props();
</script>

{#snippet moveToFolderSubmenu()}
	<ContextMenu.Sub>
		<ContextMenu.SubTrigger>
			<Icon icon={FolderIcon} class="size-4" />
			Pindah ke folder
		</ContextMenu.SubTrigger>
		<ContextMenu.SubContent>
			{#each moveTargets as target (target.value)}
				<ContextMenu.Item onSelect={() => onMove(target.value)}>{target.label}</ContextMenu.Item>
			{/each}
		</ContextMenu.SubContent>
	</ContextMenu.Sub>
{/snippet}

<ContextMenu.Content class="w-56">
	<ContextMenu.Label>Artifact</ContextMenu.Label>
	<ContextMenu.Item onSelect={onOpen}>
		<Icon icon={ExternalLinkIcon} class="size-4" />
		Buka
	</ContextMenu.Item>
	<ContextMenu.Item {onSelect}>
		{#if isSelected}
			<Icon icon={CheckIcon} class="size-4" />
		{:else}
			<Icon icon={LinkIcon} class="size-4" />
		{/if}
		{isSelected ? 'Hapus dari konteks' : 'Tambah ke konteks'}
	</ContextMenu.Item>
	<ContextMenu.Separator />
	<ContextMenu.Item onSelect={onRename}>
		<Icon icon={PenLineIcon} class="size-4" />
		Rename
	</ContextMenu.Item>
	{@render moveToFolderSubmenu()}
	<MoveToWorkspaceContextSubmenu {workspaces} onMove={onMoveToWorkspace} />
	<ContextMenu.Item
		onSelect={() => {
			void copyTextToClipboard(new URL(artifactHref, window.location.origin).toString()).catch(
				() => {}
			);
		}}
	>
		<Icon icon={LinkIcon} class="size-4" />
		Salin link
	</ContextMenu.Item>
	{#if onAddToCitations}
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={onAddToCitations}>
			<Icon icon={BookmarkIcon} class="size-4" />
			Tambahkan ke Sitasi
		</ContextMenu.Item>
	{/if}
	<ContextMenu.Separator />
	<ContextMenu.Item variant="destructive" onSelect={onDelete}>
		<Icon icon={Trash2Icon} class="size-4" />
		Delete
	</ContextMenu.Item>
</ContextMenu.Content>
