<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button, type ButtonSize, type ButtonVariant } from '@aqsha/ui-svelte/components/button';
	import { toast } from 'svelte-sonner';
	import { Icon, BookmarkIcon, CheckIcon } from '$lib/icons';
	import ProjectSectionPicker from '$lib/features/workspaces/components/ProjectSectionPicker.svelte';
	import { useSaveSource } from '$lib/features/citations/api';
	import type { SourceSaveInput } from '../source-save';

	/**
	 * Simpan citation-first dari explore: default masuk perpustakaan akun saja;
	 * opsional pilih proyek tujuan (+ bab). Duplikat memakai referensi lama.
	 */
	let {
		source,
		label = 'Simpan',
		ariaLabel,
		variant = 'outline',
		size = 'sm',
		class: className,
		onSaved
	}: {
		source: SourceSaveInput;
		label?: string;
		ariaLabel?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		onSaved?: () => void;
	} = $props();

	const save = useSaveSource();
	let open = $state(false);
	let saved = $state(false);

	function saveTo(target: { workspaceId: string; sectionId: string | null } | null) {
		save.mutate(
			{
				source,
				workspaceId: target?.workspaceId ?? null,
				sectionId: target?.sectionId ?? null
			},
			{
				onSuccess: () => {
					saved = true;
					open = false;
					toast.success(target ? 'Tersimpan & ditautkan ke proyek' : 'Tersimpan ke perpustakaan');
					onSaved?.();
				}
			}
		);
	}
</script>

<Button
	type="button"
	{variant}
	{size}
	class={className}
	aria-label={ariaLabel ?? label ?? 'Simpan'}
	disabled={save.isPending || saved}
	onclick={() => (open = true)}
>
	<Icon icon={saved ? CheckIcon : BookmarkIcon} class="size-3.5" />
	{#if label}{saved ? 'Tersimpan' : label}{/if}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Simpan sumber</Dialog.Title>
			<Dialog.Description>Masuk ke perpustakaanmu; tautkan ke proyek bila perlu.</Dialog.Description
			>
		</Dialog.Header>
		<div class="grid gap-4">
			<Button
				type="button"
				variant="outline"
				disabled={save.isPending}
				onclick={() => saveTo(null)}
			>
				Perpustakaan saja
			</Button>
			<div class="grid gap-2">
				<p class="text-label font-medium text-muted-foreground">Atau tautkan ke proyek:</p>
				<ProjectSectionPicker
					disabled={save.isPending}
					confirmLabel="Simpan ke proyek"
					onConfirm={saveTo}
				/>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
