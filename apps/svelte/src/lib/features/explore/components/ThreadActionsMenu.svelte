<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, MoreHorizontalIcon, Trash2Icon } from '$lib/icons';

	/**
	 * Per-thread action menu (delete) for the compact chat panel header. Delete only; the sidebar-row pin
	 * variant is handled elsewhere.
	 */
	let { description, onDelete }: { description: string; onDelete: () => Promise<void> } = $props();

	let deleteDialogOpen = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="ghost"
				size="icon-sm"
				class="size-8 shrink-0 rounded-full text-muted-foreground"
				aria-label="Aksi thread"
			>
				<Icon icon={MoreHorizontalIcon} class="size-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44">
		<DropdownMenu.Item variant="destructive" onclick={() => (deleteDialogOpen = true)}>
			<Icon icon={Trash2Icon} class="size-4" />
			Hapus thread
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
<ConfirmDialog
	open={deleteDialogOpen}
	onOpenChange={(open) => (deleteDialogOpen = open)}
	title="Hapus thread"
	{description}
	confirmLabel="Hapus"
	onConfirm={onDelete}
/>
