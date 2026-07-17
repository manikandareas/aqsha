<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NameDialog from './NameDialog.svelte';
	import {
		Icon,
		ArrowDownIcon,
		ArrowUpIcon,
		MoreHorizontalIcon,
		PenLineIcon,
		PlusIcon,
		SearchIcon,
		SparklesIcon
	} from '$lib/icons';
	import { useCreateSection, useDeleteSection, useReorderSections, useUpdateSection } from '../api';
	import { SECTION_STATUS_LABELS } from '../labels';
	import { SECTION_STATUSES, type SectionStatus, type WorkspaceSection } from '../types';

	/**
	 * Kerangka bab = bintang rumah proyek. Status per bab diubah user (kosong→beres);
	 * section bibliography digenerate citeproc → tanpa status & tanpa editor manual.
	 */
	let {
		workspaceId,
		sections,
		onWriteWithAstra
	}: {
		workspaceId: string;
		sections: WorkspaceSection[];
		onWriteWithAstra: (section: WorkspaceSection) => void;
	} = $props();

	const createSection = useCreateSection();
	const updateSection = useUpdateSection();
	const deleteSection = useDeleteSection();
	const reorderSections = useReorderSections();

	let newTitle = $state('');
	let renameTarget = $state<WorkspaceSection | null>(null);
	let deleteTarget = $state<WorkspaceSection | null>(null);

	const STATUS_DOT: Record<SectionStatus, string> = {
		empty: 'bg-muted-foreground/40',
		draft: 'bg-lemon',
		in_review: 'bg-lavender',
		done: 'bg-mint'
	};

	async function addSection(event: SubmitEvent) {
		event.preventDefault();
		const title = newTitle.trim();
		if (!title) return;
		await createSection.mutateAsync({ workspaceId, title });
		newTitle = '';
	}

	function move(section: WorkspaceSection, delta: -1 | 1) {
		const ids = sections.map((s) => s.id);
		const from = ids.indexOf(section.id);
		const to = from + delta;
		if (to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to]!, ids[from]!];
		reorderSections.mutate({ workspaceId, orderedIds: ids });
	}
</script>

<section class="flex flex-col gap-3 px-6 py-5" aria-label="Kerangka bab">
	<h2 class="font-heading text-lg font-bold">Kerangka</h2>
	<ul class="grid gap-2">
		{#each sections as section, i (section.id)}
			{@const isBibliography = section.role === 'bibliography'}
			<li class="flex items-center gap-3 rounded-md border-2 border-border bg-card px-3 py-2.5">
				<span
					aria-hidden="true"
					class={`size-2 shrink-0 rounded-full ${isBibliography ? 'bg-muted-foreground/40' : STATUS_DOT[section.status]}`}
				></span>
				<a
					href={resolve('/app/(product)/projects/[projectId]/sections/[sectionId]', {
						projectId: workspaceId,
						sectionId: section.id
					})}
					class="min-w-0 flex-1 truncate font-medium hover:underline"
				>
					{section.title}
				</a>
				{#if isBibliography}
					<Badge variant="outline">otomatis</Badge>
				{:else}
					<Select.Root
						type="single"
						value={section.status}
						onValueChange={(v) =>
							updateSection.mutate({ id: section.id, workspaceId, status: v as SectionStatus })}
					>
						<Select.Trigger class="h-8 w-28" aria-label={`Status ${section.title}`}>
							{SECTION_STATUS_LABELS[section.status]}
						</Select.Trigger>
						<Select.Content>
							{#each SECTION_STATUSES as s (s)}
								<Select.Item value={s} label={SECTION_STATUS_LABELS[s]} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="gap-1.5"
						onclick={() => onWriteWithAstra(section)}
					>
						<Icon icon={SparklesIcon} class="size-3.5" />
						Tulis dengan Astra
					</Button>
				{/if}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="ghost"
								size="icon"
								aria-label={`Aksi ${section.title}`}
							>
								<Icon icon={MoreHorizontalIcon} class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onSelect={() => (renameTarget = section)}>
							<Icon icon={PenLineIcon} class="size-4" /> Ubah judul
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onSelect={() =>
								goto(
									resolve('/app/(product)/projects/[projectId]/search', {
										projectId: workspaceId
									}) + `?section=${section.id}`
								)}
						>
							<Icon icon={SearchIcon} class="size-4" /> Cari sumber untuk bab ini
						</DropdownMenu.Item>
						<DropdownMenu.Item disabled={i === 0} onSelect={() => move(section, -1)}>
							<Icon icon={ArrowUpIcon} class="size-4" /> Naik
						</DropdownMenu.Item>
						<DropdownMenu.Item
							disabled={i === sections.length - 1}
							onSelect={() => move(section, 1)}
						>
							<Icon icon={ArrowDownIcon} class="size-4" /> Turun
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item variant="destructive" onSelect={() => (deleteTarget = section)}>
							Hapus bab
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</li>
		{/each}
	</ul>
	<form class="flex items-center gap-2" onsubmit={addSection}>
		<Input bind:value={newTitle} placeholder="Tambah bab…" aria-label="Judul bab baru" />
		<Button type="submit" variant="outline" disabled={!newTitle.trim()}>
			<Icon icon={PlusIcon} class="size-4" /> Tambah
		</Button>
	</form>
</section>

<NameDialog
	open={renameTarget !== null}
	onOpenChange={(open) => {
		if (!open) renameTarget = null;
	}}
	title="Ubah judul bab"
	description="Kerangka sepenuhnya milikmu."
	submitLabel="Simpan"
	initialName={renameTarget?.title ?? ''}
	onSubmit={async ({ name }) => {
		if (!renameTarget) return;
		await updateSection.mutateAsync({ id: renameTarget.id, workspaceId, title: name });
		renameTarget = null;
	}}
/>

<ConfirmDialog
	open={deleteTarget !== null}
	onOpenChange={(open) => {
		if (!open) deleteTarget = null;
	}}
	title="Hapus bab?"
	description={`"${deleteTarget?.title ?? ''}" akan dihapus dari kerangka. Sumber yang ditandai untuk bab ini kembali ke level proyek.`}
	confirmLabel="Hapus"
	onConfirm={async () => {
		if (!deleteTarget) return;
		await deleteSection.mutateAsync({ id: deleteTarget.id, workspaceId });
		deleteTarget = null;
	}}
/>
