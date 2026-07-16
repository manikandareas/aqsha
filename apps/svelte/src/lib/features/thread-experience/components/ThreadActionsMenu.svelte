<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import {
		Icon,
		MoreHorizontalIcon,
		MoreVerticalIcon,
		PinIcon,
		PinOffIcon,
		Trash2Icon
	} from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Menu aksi per-thread (dropdown). Delete selalu ada; sematkan/lepas hanya saat `onTogglePin` diberikan
	 * (sidebar row). `variant="sidebar-row"` = trigger absolut kanan-atas, muncul saat hover/focus.
	 */
	let {
		description,
		onDelete,
		variant = 'header',
		isPinned = false,
		onTogglePin
	}: {
		description: string;
		onDelete: () => Promise<void>;
		variant?: 'header' | 'sidebar-row';
		isPinned?: boolean;
		onTogglePin?: () => void | Promise<void>;
	} = $props();

	let deleteDialogOpen = $state(false);
	const isSidebarRow = $derived(variant === 'sidebar-row');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="ghost"
				size="icon-sm"
				class={cn(
					isSidebarRow
						? 'absolute top-1 right-1 size-7 shrink-0 rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100 md:opacity-0 [&_svg]:size-3.5'
						: 'size-8 shrink-0 rounded-full text-muted-foreground'
				)}
				onclick={isSidebarRow
					? (event: MouseEvent) => {
							event.preventDefault();
							event.stopPropagation();
						}
					: undefined}
				aria-label="Aksi thread"
			>
				{#if isSidebarRow}
					<Icon icon={MoreVerticalIcon} />
				{:else}
					<Icon icon={MoreHorizontalIcon} class="size-4" />
				{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content
		align={isSidebarRow ? 'start' : 'end'}
		side={isSidebarRow ? 'right' : undefined}
		sideOffset={isSidebarRow ? 4 : undefined}
		class="w-44"
	>
		{#if onTogglePin}
			<DropdownMenu.Item onclick={() => void onTogglePin?.()}>
				{#if isPinned}
					<Icon icon={PinOffIcon} class="size-4" />
					Lepas sematan
				{:else}
					<Icon icon={PinIcon} class="size-4" />
					Sematkan thread
				{/if}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
		{/if}
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
