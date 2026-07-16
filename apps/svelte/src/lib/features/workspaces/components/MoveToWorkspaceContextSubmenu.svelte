<script module lang="ts">
	export type WorkspaceMoveTarget = {
		_id: string;
		name: string;
	};
</script>

<script lang="ts">
	import * as ContextMenu from '@aqsha/ui-svelte/components/context-menu';
	import { Icon, FolderIcon } from '$lib/icons';

	/** Shared "Pindahkan ke workspace" submenu — from `workspace-library-context-menus.tsx`. */
	let {
		workspaces,
		onMove
	}: {
		workspaces: WorkspaceMoveTarget[];
		onMove: (targetWorkspaceId: string) => void;
	} = $props();
</script>

<ContextMenu.Sub>
	<ContextMenu.SubTrigger>
		<Icon icon={FolderIcon} class="size-4" />
		Pindahkan ke workspace
	</ContextMenu.SubTrigger>
	<ContextMenu.SubContent class="w-56">
		{#if workspaces.length === 0}
			<ContextMenu.Item disabled>Tidak ada workspace lain</ContextMenu.Item>
		{:else}
			{#each workspaces as workspace (workspace._id)}
				<ContextMenu.Item onSelect={() => onMove(workspace._id)}>
					<span class="truncate">{workspace.name}</span>
				</ContextMenu.Item>
			{/each}
		{/if}
	</ContextMenu.SubContent>
</ContextMenu.Sub>
