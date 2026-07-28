<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import WorkspacePicker from './WorkspacePicker.svelte';
	import { useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';

	/** Pemilih proyek tujuan untuk menautkan sumber (level proyek — tanpa bab). */
	let {
		disabled = false,
		confirmLabel = 'Tambahkan',
		onConfirm
	}: {
		disabled?: boolean;
		confirmLabel?: string;
		onConfirm: (target: { workspaceId: string; sectionId: string | null }) => void;
	} = $props();

	let workspaceId = $state<string | null>(null);
	const workspace = useWorkspace(
		() => workspaceId ?? '',
		() => workspaceId !== null
	);
</script>

{#if workspaceId === null}
	<WorkspacePicker {disabled} onSelect={(id) => (workspaceId = id)} />
{:else}
	<div class="grid gap-3">
		<button
			type="button"
			class="w-fit text-label text-muted-foreground hover:text-foreground hover:underline"
			onclick={() => (workspaceId = null)}
		>
			← Ganti proyek
		</button>
		<p class="text-sm font-medium">
			{workspace.data ? projectDisplayTitle(workspace.data) : 'Proyek'}
		</p>
		<Button
			type="button"
			{disabled}
			onclick={() => workspaceId && onConfirm({ workspaceId, sectionId: null })}
		>
			{confirmLabel}
		</Button>
	</div>
{/if}
