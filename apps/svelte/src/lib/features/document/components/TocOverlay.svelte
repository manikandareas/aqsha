<script lang="ts">
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NameDialog from '$lib/features/workspaces/components/NameDialog.svelte';
	import {
		Icon,
		ArrowDownIcon,
		ArrowUpIcon,
		BookOpenIcon,
		MoreHorizontalIcon,
		PenLineIcon,
		PlusIcon,
		Trash2Icon
	} from '$lib/icons';
	import type { DocumentOutlineEntry } from '../lib/outline';

	/**
	 * Overlay daftar bab mengambang di atas preview — rumah navigasi + manajemen bab. Klik bab →
	 * `onNavigate` (gulir preview + editor ke heading). Manajemen (tambah/pindah/ganti judul/hapus)
	 * aktif saat callback-nya tersedia; setiap aksi mengembalikan indeks bab, pemanggil menerapkan
	 * transformasi teks murni ke editor sebagai satu edit user (memicu autosave + recompile).
	 */
	let {
		outline,
		onNavigate,
		onInsert,
		onMove,
		onRename,
		onRemove
	}: {
		outline: DocumentOutlineEntry[];
		onNavigate: (entry: DocumentOutlineEntry) => void;
		onInsert?: (afterIndex: number, title: string) => void;
		onMove?: (fromIndex: number, toIndex: number) => void;
		onRename?: (index: number, title: string) => void;
		onRemove?: (index: number) => void;
	} = $props();

	const manageable = $derived(Boolean(onInsert && onMove && onRename && onRemove));

	let open = $state(false);
	let renameTarget = $state<{ index: number; title: string } | null>(null);
	let deleteTarget = $state<{ index: number; title: string } | null>(null);
	let addOpen = $state(false);

	function navigate(entry: DocumentOutlineEntry): void {
		onNavigate(entry);
		open = false;
	}
</script>

<div class="absolute right-4 top-4 z-30">
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="outline"
					size="sm"
					class="gap-1.5 bg-card"
					aria-label="Daftar bab"
				>
					<Icon icon={BookOpenIcon} class="size-4" />
					Daftar bab
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="end" class="w-80 max-w-[calc(100vw-2rem)] p-2">
			<p class="px-2 pb-1.5 pt-1 text-micro uppercase text-muted-foreground">Bab</p>
			{#if outline.length === 0}
				<p class="px-2 py-3 text-sm text-muted-foreground">
					Belum ada bab. Tambahkan heading <code class="font-mono">= Judul</code> di editor
					{#if manageable}atau lewat tombol di bawah{/if}.
				</p>
			{:else}
				<ul class="grid max-h-[60svh] gap-0.5 overflow-y-auto">
					{#each outline as entry, i (entry.sourceLine)}
						<li class="flex items-center gap-1">
							<button
								type="button"
								class="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
								onclick={() => navigate(entry)}
							>
								{entry.title}
							</button>
							{#if manageable}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												type="button"
												variant="ghost"
												size="icon-sm"
												aria-label={`Aksi ${entry.title}`}
											>
												<Icon icon={MoreHorizontalIcon} class="size-4" />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item
											onSelect={() => (renameTarget = { index: i, title: entry.title })}
										>
											<Icon icon={PenLineIcon} class="size-4" /> Ubah judul
										</DropdownMenu.Item>
										<DropdownMenu.Item disabled={i === 0} onSelect={() => onMove?.(i, i - 1)}>
											<Icon icon={ArrowUpIcon} class="size-4" /> Naik
										</DropdownMenu.Item>
										<DropdownMenu.Item
											disabled={i === outline.length - 1}
											onSelect={() => onMove?.(i, i + 1)}
										>
											<Icon icon={ArrowDownIcon} class="size-4" /> Turun
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											variant="destructive"
											onSelect={() => (deleteTarget = { index: i, title: entry.title })}
										>
											<Icon icon={Trash2Icon} class="size-4" /> Hapus bab
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if manageable}
				<div class="mt-1 border-t border-border pt-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-1.5"
						onclick={() => (addOpen = true)}
					>
						<Icon icon={PlusIcon} class="size-4" /> Tambah bab
					</Button>
				</div>
			{/if}
		</Popover.Content>
	</Popover.Root>
</div>

{#if manageable}
	<NameDialog
		open={addOpen}
		onOpenChange={(v) => (addOpen = v)}
		title="Tambah bab"
		description="Bab baru ditambahkan di akhir dokumen."
		submitLabel="Tambah"
		onSubmit={async ({ name }) => {
			onInsert?.(outline.length - 1, name);
			addOpen = false;
		}}
	/>

	<NameDialog
		open={renameTarget !== null}
		onOpenChange={(v) => {
			if (!v) renameTarget = null;
		}}
		title="Ubah judul bab"
		description="Kerangka sepenuhnya milikmu."
		submitLabel="Simpan"
		initialName={renameTarget?.title ?? ''}
		onSubmit={async ({ name }) => {
			if (renameTarget) onRename?.(renameTarget.index, name);
			renameTarget = null;
		}}
	/>

	<ConfirmDialog
		open={deleteTarget !== null}
		onOpenChange={(v) => {
			if (!v) deleteTarget = null;
		}}
		title="Hapus bab?"
		description={`"${deleteTarget?.title ?? ''}" beserta isinya akan dihapus dari dokumen.`}
		confirmLabel="Hapus"
		onConfirm={async () => {
			if (deleteTarget) onRemove?.(deleteTarget.index);
			deleteTarget = null;
		}}
	/>
{/if}
