<script lang="ts">
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import WorkspacePicker from './WorkspacePicker.svelte';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';

	/**
	 * Picker dua langkah proyek → bab (opsional). Bab bibliography disembunyikan
	 * (kontennya digenerate, bukan target penandaan sumber).
	 */
	let {
		disabled = false,
		confirmLabel = 'Tambahkan',
		onConfirm
	}: {
		disabled?: boolean;
		confirmLabel?: string;
		onConfirm: (target: { workspaceId: string; sectionId: string | null }) => void;
	} = $props();

	const NO_SECTION = '__none__';
	let workspaceId = $state<string | null>(null);
	let sectionId = $state<string | null>(null);

	const workspace = useWorkspace(
		() => workspaceId ?? '',
		() => workspaceId !== null
	);
	const sections = useSections(
		() => workspaceId ?? '',
		() => workspaceId !== null
	);
	const sectionOptions = $derived((sections.data ?? []).filter((s) => s.role !== 'bibliography'));
</script>

{#if workspaceId === null}
	<WorkspacePicker {disabled} onSelect={(id) => (workspaceId = id)} />
{:else}
	<div class="grid gap-3">
		<button
			type="button"
			class="w-fit text-label text-muted-foreground hover:text-foreground hover:underline"
			onclick={() => {
				workspaceId = null;
				sectionId = null;
			}}
		>
			← Ganti proyek
		</button>
		<p class="text-sm font-medium">
			{workspace.data ? projectDisplayTitle(workspace.data) : 'Proyek'}
		</p>
		{#if sectionOptions.length > 0}
			<Select.Root
				type="single"
				value={sectionId ?? NO_SECTION}
				onValueChange={(v) => (sectionId = v === NO_SECTION ? null : v)}
			>
				<Select.Trigger class="w-full" aria-label="Tandai untuk bab">
					{sectionOptions.find((s) => s.id === sectionId)?.title ?? 'Seluruh proyek'}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value={NO_SECTION} label="Seluruh proyek" />
					{#each sectionOptions as s (s.id)}
						<Select.Item value={s.id} label={s.title} />
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}
		<Button
			type="button"
			{disabled}
			onclick={() => workspaceId && onConfirm({ workspaceId, sectionId })}
		>
			{confirmLabel}
		</Button>
	</div>
{/if}
