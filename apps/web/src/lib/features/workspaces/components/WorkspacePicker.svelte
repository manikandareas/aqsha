<script lang="ts">
	import { Icon, Loader2Icon } from '$lib/icons';
	import { getAuthState } from '$lib/auth';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { useWorkspacesList } from '../api';
	import { workspaceEmoji } from '../utils/workspace-emoji';

	/**
	 * Reusable active-workspace picker. Lists active workspaces (excludes `excludeId`), fetches its own
	 * data via `useWorkspacesList`. Picks a workspace only (no folder step). Consumed by the
	 * save-to-workspace Dialog (discovery) and Popover (chat artifact card).
	 */
	let {
		excludeId,
		onSelect,
		disabled = false
	}: {
		excludeId?: string;
		onSelect: (workspaceId: string) => void;
		disabled?: boolean;
	} = $props();

	const auth = getAuthState();
	const list = useWorkspacesList(
		() => false,
		() => auth.isSignedIn
	);
	const items = $derived(
		(list.data?.pages ?? []).flatMap((page) => page.items).filter((w) => w.id !== excludeId)
	);
</script>

{#if list.isPending}
	<div class="flex items-center justify-center py-6 text-muted-foreground">
		<Icon icon={Loader2Icon} class="animate-spin" />
	</div>
{:else if items.length === 0}
	<p class="py-6 text-center text-sm text-muted-foreground">Tidak ada workspace lain yang aktif.</p>
{:else}
	<div class="grid max-h-64 gap-1 overflow-y-auto">
		{#each items as workspace (workspace.id)}
			<button
				type="button"
				{disabled}
				onclick={() => onSelect(workspace.id)}
				class={cn(
					'flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50'
				)}
			>
				<span class="text-lg">{workspaceEmoji(workspace.emoji)}</span>
				<span class="truncate">{workspace.name}</span>
			</button>
		{/each}
	</div>
{/if}
