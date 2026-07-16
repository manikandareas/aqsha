<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button, type ButtonSize, type ButtonVariant } from '@aqsha/ui-svelte/components/button';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Icon, FolderIcon } from '$lib/icons';
	import { useSaveUrl } from '$lib/features/artifacts/api';
	import WorkspacePicker from '$lib/features/workspaces/components/WorkspacePicker.svelte';

	/**
	 * Save-to-Workspace button. Opens a workspace picker Dialog then saves the URL via `useSaveUrl` (picks
	 * a workspace only, no folder). `onSaved` fires on real success (discovery interest +1). Used by
	 * discovery cards (icon-only) and the paper reader (labelled).
	 */
	let {
		url,
		title,
		label = 'Simpan',
		ariaLabel,
		variant = 'outline',
		size = 'sm',
		class: className,
		onSaved
	}: {
		url: string;
		title?: string;
		label?: string;
		ariaLabel?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		onSaved?: () => void;
	} = $props();

	const save = useSaveUrl();
	let open = $state(false);
</script>

<Button
	{variant}
	{size}
	class={className}
	aria-label={ariaLabel}
	title={ariaLabel}
	onclick={() => (open = true)}
>
	<Icon icon={FolderIcon} />
	{label}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Simpan ke workspace</Dialog.Title>
			<Dialog.Description>Pilih workspace untuk menyimpan tautan ini.</Dialog.Description>
		</Dialog.Header>
		<WorkspacePicker
			disabled={save.isPending}
			onSelect={(workspaceId) =>
				save.mutate(
					{ workspaceId, url, title },
					{
						onSuccess: () => {
							toast.success('Disimpan ke workspace');
							open = false;
							onSaved?.();
						}
					}
				)}
		/>
	</Dialog.Content>
</Dialog.Root>
