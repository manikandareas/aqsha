<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { toast } from 'svelte-sonner';
	import ProjectSectionPicker from '$lib/features/workspaces/components/ProjectSectionPicker.svelte';
	import { useLinkCitation } from '../../api';

	/** Tautkan satu referensi perpustakaan ke proyek (+ opsional bab). Link, bukan salinan. */
	let {
		open,
		onOpenChange,
		citationId
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		citationId: string | null;
	} = $props();

	const link = useLinkCitation();
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open && citationId}
		<Dialog.Content class="sm:max-w-sm">
			<Dialog.Header>
				<Dialog.Title>Tambahkan ke proyek</Dialog.Title>
				<Dialog.Description>
					Referensi tetap di perpustakaan — proyek hanya menautkannya.
				</Dialog.Description>
			</Dialog.Header>
			<ProjectSectionPicker
				disabled={link.isPending}
				onConfirm={({ workspaceId, sectionId }) =>
					link.mutate(
						{ workspaceId, citationId, sectionId },
						{
							onSuccess: () => {
								toast.success('Ditambahkan ke proyek');
								onOpenChange(false);
							}
						}
					)}
			/>
		</Dialog.Content>
	{/if}
</Dialog.Root>
