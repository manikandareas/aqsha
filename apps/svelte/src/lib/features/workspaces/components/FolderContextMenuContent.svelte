<script lang="ts">
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { Icon, ExternalLinkIcon, PenLineIcon, Trash2Icon } from '$lib/icons';
	import MoveToWorkspaceContextSubmenu, {
		type WorkspaceMoveTarget
	} from './MoveToWorkspaceContextSubmenu.svelte';

	/** Folder right-click menu content — port of `FolderContextMenuContent` (workspace-library-context-menus.tsx). */
	let {
		workspaces,
		onOpen,
		onRename,
		onDelete,
		onMoveToWorkspace
	}: {
		workspaces: WorkspaceMoveTarget[];
		onOpen: () => void;
		onRename: () => void;
		onDelete: () => void;
		onMoveToWorkspace: (targetWorkspaceId: string) => void;
	} = $props();
</script>

<ContextMenu.Content class="w-52">
	<ContextMenu.Label>Folder</ContextMenu.Label>
	<ContextMenu.Item onSelect={onOpen}>
		<Icon icon={ExternalLinkIcon} class="size-4" />
		Buka folder
	</ContextMenu.Item>
	<ContextMenu.Item onSelect={onRename}>
		<Icon icon={PenLineIcon} class="size-4" />
		Rename
	</ContextMenu.Item>
	<MoveToWorkspaceContextSubmenu {workspaces} onMove={onMoveToWorkspace} />
	<ContextMenu.Separator />
	<ContextMenu.Item variant="destructive" onSelect={onDelete}>
		<Icon icon={Trash2Icon} class="size-4" />
		Delete
	</ContextMenu.Item>
</ContextMenu.Content>
