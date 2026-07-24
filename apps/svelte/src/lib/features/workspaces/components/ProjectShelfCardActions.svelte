<script lang="ts">
	import * as AlertDialog from '@aqsha/ui-svelte/components/alert-dialog';
	import { buttonVariants } from '@aqsha/ui-svelte/components/button';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Icon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from '$lib/icons';
	import { useArchiveWorkspace, useUpdateWorkspace } from '../api';
	import { projectDisplayTitle, type Workspace } from '../types';
	import NameDialog from './NameDialog.svelte';

	/**
	 * Rename / archive menu for a shelf card. Lives outside the overlay link hit-target so
	 * pointer events must stopPropagation before the full-card `<a>` navigates.
	 */
	let { workspace }: { workspace: Pick<Workspace, 'id' | 'name' | 'topicNote'> } = $props();

	const updateWorkspace = useUpdateWorkspace();
	const archiveWorkspace = useArchiveWorkspace();

	let renameOpen = $state(false);
	let deleteOpen = $state(false);

	const title = $derived(projectDisplayTitle(workspace));

	async function submitRename({ name }: { name: string }) {
		await updateWorkspace.mutateAsync({ id: workspace.id, name });
		renameOpen = false;
	}

	async function confirmDelete() {
		deleteOpen = false;
		await archiveWorkspace.mutateAsync({ id: workspace.id });
	}

	function stopCardNav(event: Event) {
		event.stopPropagation();
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class="relative z-20 -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-current/55 transition-[background-color,color] duration-150 ease-out hover:bg-foreground/8 hover:text-current focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-foreground/8 data-[state=open]:text-current"
				aria-label="Aksi proyek"
				onclick={(event) => {
					stopCardNav(event);
					(props as { onclick?: (event: MouseEvent) => void }).onclick?.(event);
				}}
				onpointerdown={stopCardNav}
			>
				<Icon icon={MoreHorizontalIcon} class="size-4" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-40">
		<DropdownMenu.Item onSelect={() => (renameOpen = true)}>
			<Icon icon={PencilIcon} class="size-4" />
			<span>Ubah nama</span>
		</DropdownMenu.Item>
		<DropdownMenu.Item variant="destructive" onSelect={() => (deleteOpen = true)}>
			<Icon icon={Trash2Icon} class="size-4" />
			<span>Hapus</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<NameDialog
	open={renameOpen}
	onOpenChange={(next) => {
		renameOpen = next;
	}}
	title="Judul proyek"
	description="Judul bisa diubah kapan saja."
	submitLabel="Simpan"
	initialName={workspace.name}
	onSubmit={submitRename}
/>

<AlertDialog.Root
	open={deleteOpen}
	onOpenChange={(next) => {
		deleteOpen = next;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Hapus proyek ini?</AlertDialog.Title>
			<AlertDialog.Description>
				{title} akan diarsipkan dan hilang dari daftar.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Batal</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive-solid' })}
				onclick={confirmDelete}
			>
				Hapus
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
