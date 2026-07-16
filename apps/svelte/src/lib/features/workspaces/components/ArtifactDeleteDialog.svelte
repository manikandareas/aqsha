<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { readableApiErrorMessage } from '$lib/errors';

	/**
	 * Delete-artifact confirmation. Controlled `open`; runs the async `onConfirm` and surfaces a
	 * normalized error inline on failure. Deliberately does NOT close itself on success — the parent
	 * (`ArtifactDetailView`) owns what happens next (navigate back on the page, close the panel).
	 */
	let {
		open,
		title,
		onOpenChange,
		onConfirm
	}: {
		open: boolean;
		title: string;
		onOpenChange: (open: boolean) => void;
		onConfirm: () => Promise<unknown>;
	} = $props();

	let isDeleting = $state(false);
	let error = $state<string | null>(null);

	async function handleConfirm() {
		isDeleting = true;
		error = null;
		try {
			await onConfirm();
		} catch (deleteError) {
			error = readableApiErrorMessage(deleteError, "We couldn't delete this artifact.");
			isDeleting = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="gap-4 sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete artifact</Dialog.Title>
			<Dialog.Description>
				&quot;{title}&quot; will be permanently removed from this workspace. This can&apos;t be
				undone.
			</Dialog.Description>
		</Dialog.Header>
		{#if error}
			<p class="text-[12px] font-medium text-destructive">{error}</p>
		{/if}
		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button type="button" variant="outline" disabled={isDeleting} {...props}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			<Button type="button" variant="destructive" disabled={isDeleting} onclick={handleConfirm}>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
