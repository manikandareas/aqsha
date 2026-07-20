<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, FileTextIcon, UploadIcon } from '$lib/icons';
	import { useUploadArtifact } from '$lib/features/artifacts/api';
	import NameDialog from './NameDialog.svelte';
	import KindInfoFields from './KindInfoFields.svelte';
	import { useUpdateWorkspace } from '../api';
	import { formatDeadline, WORKSPACE_KIND_LABELS } from '../labels';
	import {
		projectDisplayTitle,
		THESIS_FAMILY_KINDS,
		WORKSPACE_KIND_INFO_FIELDS,
		type Workspace,
		type WorkspaceKindInfo
	} from '../types';

	/** Identitas + metadata proyek: jenis, judul (klik → ubah), info per-kind, pedoman, tenggat. */
	let { workspace }: { workspace: Workspace } = $props();

	const update = useUpdateWorkspace();
	const uploadGuideline = useUploadArtifact(() => workspace.id);
	const untitled = $derived(!workspace.name.trim());
	const infoFields = $derived(WORKSPACE_KIND_INFO_FIELDS[workspace.kind]);
	const isThesisFamily = $derived(THESIS_FAMILY_KINDS.includes(workspace.kind));

	let renameOpen = $state(false);
	let deadlineOpen = $state(false);
	let deadlineInput = $state('');
	// Seed sekali dari prop (sheet mount per-proyek); refetch tak boleh menimpa editan user.
	let kindInfo = $state<WorkspaceKindInfo>(untrack(() => ({ ...(workspace.kindInfo ?? {}) })));

	$effect(() => {
		if (deadlineOpen) {
			deadlineInput =
				workspace.deadline != null ? new Date(workspace.deadline).toISOString().slice(0, 10) : '';
		}
	});

	function prunedKindInfo(): WorkspaceKindInfo {
		const out: WorkspaceKindInfo = {};
		for (const [key, val] of Object.entries(kindInfo)) {
			if (typeof val === 'string' && val.trim()) out[key as keyof WorkspaceKindInfo] = val.trim();
		}
		return out;
	}

	async function saveKindInfo(): Promise<void> {
		await update.mutateAsync({ id: workspace.id, kindInfo: prunedKindInfo() });
		toast.success('Info proyek disimpan.');
	}

	async function saveDeadline(): Promise<void> {
		await update.mutateAsync({
			id: workspace.id,
			deadline: deadlineInput ? new Date(`${deadlineInput}T00:00:00`).getTime() : null
		});
		deadlineOpen = false;
	}

	function uploadPedoman(event: Event): void {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		uploadGuideline.mutate(
			{ file },
			{
				onSuccess: () => toast.success('Pedoman diunggah ke proyek.'),
				onError: () => toast.error('Gagal mengunggah pedoman.')
			}
		);
	}
</script>

<div class="flex flex-col gap-4 px-6 py-4">
	<div class="flex flex-wrap items-center gap-2">
		<span aria-hidden="true" class="text-xl leading-none">{workspace.emoji?.trim() || '📚'}</span>
		<Badge variant="outline">{WORKSPACE_KIND_LABELS[workspace.kind]}</Badge>
		<Popover.Root bind:open={deadlineOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} type="button" variant="ghost" size="sm" class="text-muted-foreground">
						{workspace.deadline != null
							? `Tenggat ${formatDeadline(workspace.deadline)}`
							: 'Atur tenggat'}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="grid w-64 gap-3">
				<label class="text-label font-medium" for="deadline-input">Tenggat proyek</label>
				<Input id="deadline-input" type="date" bind:value={deadlineInput} />
				<div class="flex justify-end gap-2">
					{#if workspace.deadline != null}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => {
								deadlineInput = '';
								void saveDeadline();
							}}
						>
							Hapus
						</Button>
					{/if}
					<Button type="button" size="sm" onclick={saveDeadline}>Simpan</Button>
				</div>
			</Popover.Content>
		</Popover.Root>
	</div>

	<button
		type="button"
		class="w-fit text-left font-heading text-2xl font-bold hover:underline focus-visible:underline focus-visible:outline-none"
		onclick={() => (renameOpen = true)}
		aria-label="Ubah judul proyek"
	>
		<span class={untitled ? 'italic text-muted-foreground' : ''}>
			{projectDisplayTitle(workspace)}
		</span>
	</button>
	{#if untitled && workspace.topicNote}
		<p class="text-sm text-muted-foreground">Masih eksplorasi — beri judul kapan pun kamu siap.</p>
	{/if}

	{#if infoFields.length > 0}
		<div class="grid gap-3 rounded-lg border-2 border-border bg-card p-4">
			<h2 class="font-heading text-base font-bold">Info dokumen</h2>
			<KindInfoFields kind={workspace.kind} bind:value={kindInfo} />
			<Button
				type="button"
				size="sm"
				class="w-fit"
				disabled={update.isPending}
				onclick={saveKindInfo}
			>
				Simpan info
			</Button>
		</div>
	{/if}

	{#if isThesisFamily}
		<div class="grid gap-2">
			<span class="text-label font-medium">Pedoman penulisan</span>
			<label
				class="flex w-fit cursor-pointer items-center gap-1.5 rounded-md border-2 border-dashed border-border px-3 py-2 text-label text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
			>
				<Icon icon={uploadGuideline.isPending ? FileTextIcon : UploadIcon} class="size-4" />
				{uploadGuideline.isPending ? 'Mengunggah…' : 'Unggah / ganti pedoman'}
				<input
					type="file"
					accept="application/pdf"
					class="sr-only"
					disabled={uploadGuideline.isPending}
					onchange={uploadPedoman}
				/>
			</label>
		</div>
	{/if}
</div>

<NameDialog
	open={renameOpen}
	onOpenChange={(open) => (renameOpen = open)}
	title="Judul proyek"
	description="Judul bisa diubah kapan saja."
	submitLabel="Simpan"
	initialName={workspace.name}
	onSubmit={async ({ name }) => {
		await update.mutateAsync({ id: workspace.id, name });
		renameOpen = false;
	}}
/>
