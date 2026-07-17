<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Textarea } from '@aqsha/ui-svelte/components/textarea';
	import { useCreateWorkspace } from '../api';
	import { WORKSPACE_KIND_LABELS } from '../labels';
	import { WORKSPACE_KINDS, type WorkspaceKind } from '../types';

	/**
	 * Inner content of {@link NewProjectDialog}. Mounted only while open, so the draft state below
	 * starts fresh every time without an explicit reset.
	 */
	let { onOpenChange }: { onOpenChange: (open: boolean) => void } = $props();

	const createWorkspace = useCreateWorkspace();

	let kind = $state<WorkspaceKind | ''>('');
	let topicNote = $state('');
	let name = $state('');
	let deadlineInput = $state('');
	let submitting = $state(false);

	const canSubmit = $derived(kind !== '' && !submitting);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (kind === '') return;
		submitting = true;
		try {
			const result = await createWorkspace.mutateAsync({
				kind,
				...(topicNote.trim() ? { topicNote: topicNote.trim() } : {}),
				...(name.trim() ? { name: name.trim() } : {}),
				...(deadlineInput ? { deadline: new Date(`${deadlineInput}T00:00:00`).getTime() } : {})
			});
			// Create is rate-limited server-side as a return union, not a thrown error — surface it
			// inline and leave the dialog open so the draft isn't lost.
			if (!('id' in result)) {
				toast.warning(result.message);
				return;
			}
			onOpenChange(false);
			await goto(resolve('/app/(product)/projects/[projectId]', { projectId: result.id }));
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Proyek baru</Dialog.Title>
		<Dialog.Description>Kamu lagi nulis apa? Cukup jenis dan topik kasarnya dulu.</Dialog.Description>
	</Dialog.Header>
	<form class="grid gap-4" onsubmit={submit}>
		<div class="grid gap-1.5">
			<label class="text-label font-medium" for="project-kind">Jenis karya tulis</label>
			<Select.Root
				type="single"
				value={kind}
				onValueChange={(v) => (kind = v as WorkspaceKind)}
			>
				<Select.Trigger id="project-kind" class="w-full">
					{kind ? WORKSPACE_KIND_LABELS[kind] : 'Pilih jenis…'}
				</Select.Trigger>
				<Select.Content>
					{#each WORKSPACE_KINDS as k (k)}
						<Select.Item value={k} label={WORKSPACE_KIND_LABELS[k]} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="grid gap-1.5">
			<label class="text-label font-medium" for="project-topic">Topik kasar</label>
			<Textarea
				id="project-topic"
				bind:value={topicNote}
				rows={2}
				placeholder="cth. dampak media sosial terhadap kesehatan mental remaja"
			/>
		</div>
		<details class="group">
			<summary class="cursor-pointer text-label font-medium text-muted-foreground">
				Opsional: judul & tenggat
			</summary>
			<div class="mt-3 grid gap-3">
				<div class="grid gap-1.5">
					<label class="text-label font-medium" for="project-name">Judul (boleh kosong)</label>
					<Input id="project-name" bind:value={name} placeholder="Bisa diisi nanti" />
				</div>
				<div class="grid gap-1.5">
					<label class="text-label font-medium" for="project-deadline">Tenggat</label>
					<Input id="project-deadline" type="date" bind:value={deadlineInput} />
				</div>
			</div>
		</details>
		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button {...props} type="button" variant="outline">Batal</Button>
				{/snippet}
			</Dialog.Close>
			<Button type="submit" disabled={!canSubmit}>
				{submitting ? 'Membuat…' : 'Buat proyek'}
			</Button>
		</Dialog.Footer>
	</form>
</Dialog.Content>
