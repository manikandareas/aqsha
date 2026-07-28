<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NameDialog from '$lib/features/workspaces/components/NameDialog.svelte';
	import {
		Icon,
		ArrowDownIcon,
		ArrowUpIcon,
		MoreHorizontalIcon,
		PenLineIcon,
		PlusIcon,
		Trash2Icon
	} from '$lib/icons';
	import type { DocumentOutlineEntry } from '../lib/outline';

	/**
	 * Ruler TOC mengambang di tengah-kanan preview: satu bar per bab, bar aktif menyorot bab yang
	 * sedang terlihat (`activeIndex` dari preview). Hover/fokus memunculkan panel kompak berisi
	 * daftar bab + manajemen (tambah/pindah/ganti judul/hapus) saat callback-nya tersedia; setiap
	 * aksi mengembalikan indeks bab, pemanggil menerapkan transformasi teks murni ke editor.
	 */
	let {
		outline,
		activeIndex = 0,
		onNavigate,
		onInsert,
		onMove,
		onRename,
		onRemove
	}: {
		outline: DocumentOutlineEntry[];
		activeIndex?: number;
		onNavigate: (entry: DocumentOutlineEntry) => void;
		onInsert?: (afterIndex: number, title: string) => void;
		onMove?: (fromIndex: number, toIndex: number) => void;
		onRename?: (index: number, title: string) => void;
		onRemove?: (index: number) => void;
	} = $props();

	const manageable = $derived(Boolean(onInsert && onMove && onRename && onRemove));

	let open = $state(false);
	let menuOpen = $state(false);
	let renameTarget = $state<{ index: number; title: string } | null>(null);
	let deleteTarget = $state<{ index: number; title: string } | null>(null);
	let addOpen = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	function show(): void {
		clearTimeout(closeTimer);
		open = true;
	}

	// Jeda singkat sebelum menutup supaya pointer sempat menyeberang celah ruler → panel;
	// panel juga bertahan selama dropdown aksi masih terbuka.
	function scheduleHide(): void {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			if (!menuOpen) open = false;
		}, 120);
	}

	function navigate(entry: DocumentOutlineEntry): void {
		onNavigate(entry);
	}
</script>

{#if outline.length > 0 || manageable}
	<div
		class="absolute right-3 top-1/2 z-30 -translate-y-1/2"
		role="navigation"
		aria-label="Daftar bab"
		onpointerenter={show}
		onpointerleave={scheduleHide}
		onfocusin={show}
		onfocusout={scheduleHide}
	>
		<!-- Ruler: satu bar per bab. -->
		<div
			class="flex max-h-[70svh] flex-col items-end justify-center gap-1.5 overflow-hidden py-2 pl-2 pr-3"
		>
			{#if outline.length === 0}
				<button
					type="button"
					class="rounded-full py-0.5"
					aria-label="Tambah bab"
					onclick={() => (addOpen = true)}
				>
					<span class="block h-0.5 w-4 rounded-full bg-neutral-400"></span>
				</button>
			{:else}
				{#each outline as entry, i (entry.sourceLine)}
					<button
						type="button"
						class="group rounded-full py-0.5"
						aria-label={entry.title}
						aria-current={i === activeIndex ? 'true' : undefined}
						onclick={() => navigate(entry)}
					>
						<span
							class={[
								'block h-0.5 rounded-full transition-all duration-200',
								i === activeIndex
									? 'w-6 bg-neutral-800'
									: 'w-4 bg-neutral-400 group-hover:bg-neutral-600'
							]}
						></span>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Panel kompak daftar bab, muncul di sisi kiri ruler saat hover/fokus. -->
		{#if open}
			<div class="absolute right-full top-1/2 -translate-y-1/2 pr-1">
				<div
					class="w-64 max-w-[calc(100vw-4rem)] rounded-xl border-2 border-border bg-card p-1.5 shadow-soft-card"
				>
					{#if outline.length === 0}
						<p class="px-2 py-2.5 text-label text-muted-foreground">
							Belum ada bab. Tambahkan heading <code class="font-mono">= Judul</code> di editor{#if manageable}
								atau lewat tombol di bawah{/if}.
						</p>
					{:else}
						<ul class="grid max-h-[55svh] gap-px overflow-y-auto">
							{#each outline as entry, i (entry.sourceLine)}
								<li class="flex items-center gap-0.5">
									<button
										type="button"
										class={[
											'min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-label transition-colors',
											i === activeIndex
												? 'bg-muted font-semibold text-foreground'
												: 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground'
										]}
										onclick={() => navigate(entry)}
									>
										{entry.title}
									</button>
									{#if manageable}
										<DropdownMenu.Root
											onOpenChange={(v) => {
												menuOpen = v;
												if (!v) scheduleHide();
											}}
										>
											<DropdownMenu.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														type="button"
														variant="ghost"
														size="icon-sm"
														class="size-6 shrink-0"
														aria-label={`Aksi ${entry.title}`}
													>
														<Icon icon={MoreHorizontalIcon} class="size-3.5" />
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
								class="h-7 w-full justify-start gap-1.5 text-label"
								onclick={() => (addOpen = true)}
							>
								<Icon icon={PlusIcon} class="size-3.5" /> Tambah bab
							</Button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

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
