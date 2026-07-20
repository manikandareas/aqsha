<script lang="ts">
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import NameDialog from './NameDialog.svelte';
	import StageStepper from './StageStepper.svelte';
	import { useUpdateWorkspace } from '../api';
	import { formatDeadline, WORKSPACE_KIND_LABELS } from '../labels';
	import { projectDisplayTitle, type Workspace, type WorkspaceStage } from '../types';

	/** Identitas proyek: jenis, judul (klik → ubah), stepper tahap manual, tenggat. */
	let { workspace }: { workspace: Workspace } = $props();

	const update = useUpdateWorkspace();
	const isFreeform = $derived(workspace.kind === 'freeform');
	const untitled = $derived(!workspace.name.trim());

	let renameOpen = $state(false);
	let deadlineOpen = $state(false);
	let deadlineInput = $state('');

	$effect(() => {
		if (deadlineOpen) {
			deadlineInput =
				workspace.deadline != null ? new Date(workspace.deadline).toISOString().slice(0, 10) : '';
		}
	});

	function setStage(stage: WorkspaceStage) {
		update.mutate({ id: workspace.id, stage });
	}

	async function saveDeadline() {
		await update.mutateAsync({
			id: workspace.id,
			deadline: deadlineInput ? new Date(`${deadlineInput}T00:00:00`).getTime() : null
		});
		deadlineOpen = false;
	}
</script>

<header class="flex flex-col gap-3 border-b-2 border-border px-6 py-4">
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
		<span class={untitled ? 'italic text-muted-foreground' : ''}
			>{projectDisplayTitle(workspace)}</span
		>
	</button>
	{#if untitled && workspace.topicNote}
		<p class="text-sm text-muted-foreground">Masih eksplorasi — beri judul kapan pun kamu siap.</p>
	{/if}
	{#if !isFreeform}
		<StageStepper stage={workspace.stage} onStageChange={setStage} />
	{/if}
</header>

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
