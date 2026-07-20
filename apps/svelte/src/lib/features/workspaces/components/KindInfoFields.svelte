<script lang="ts">
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { KIND_INFO_FIELD_LABELS, KIND_INFO_FIELD_PLACEHOLDERS } from '../labels';
	import {
		WORKSPACE_KIND_INFO_FIELDS,
		type WorkspaceKind,
		type WorkspaceKindInfo,
		type WorkspaceKindInfoField
	} from '../types';

	/**
	 * Field metadata per-kind (kind_info) — dipakai form buat-proyek + sheet detail. Hanya field yang
	 * relevan untuk `kind` yang dirender; kosong (mis. `freeform`) → tidak menampilkan apa pun.
	 */
	let {
		kind,
		value = $bindable()
	}: {
		kind: WorkspaceKind;
		value: WorkspaceKindInfo;
	} = $props();

	const fields = $derived(
		WORKSPACE_KIND_INFO_FIELDS[kind] as readonly WorkspaceKindInfoField[]
	);
</script>

{#each fields as field (field)}
	<div class="grid gap-1.5">
		<label class="text-label font-medium" for={`kindinfo-${field}`}>
			{KIND_INFO_FIELD_LABELS[field]}
		</label>
		<Input
			id={`kindinfo-${field}`}
			bind:value={
				() => value[field] ?? '', (v) => (value = { ...value, [field]: v.trim() ? v : null })
			}
			placeholder={KIND_INFO_FIELD_PLACEHOLDERS[field]}
		/>
	</div>
{/each}
