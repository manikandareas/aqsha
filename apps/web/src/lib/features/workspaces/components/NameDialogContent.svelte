<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { readableApiErrorMessage } from '$lib/errors';

	/**
	 * Inner content of {@link NameDialog}. Mounted only while open (keyed on `initialName`), so `name`
	 * seeds fresh from `initialName` at each mount.
	 */
	let {
		title,
		description,
		submitLabel,
		initialName,
		onOpenChange,
		onSubmit
	}: {
		title: string;
		description: string;
		submitLabel: string;
		initialName: string;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { name: string }) => Promise<unknown>;
	} = $props();

	let name = $state(untrack(() => initialName));
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim()) return;
		isSubmitting = true;
		error = null;
		try {
			await onSubmit({ name: name.trim() });
			onOpenChange(false);
			isSubmitting = false;
		} catch (submitError) {
			error = readableApiErrorMessage(submitError, 'Aksi gagal.');
			isSubmitting = false;
		}
	}
</script>

<Dialog.Content class="gap-4 sm:max-w-md">
	<Dialog.Header>
		<Dialog.Title>{title}</Dialog.Title>
		<Dialog.Description>{description}</Dialog.Description>
	</Dialog.Header>
	<form class="grid gap-3" onsubmit={handleSubmit}>
		<Input autofocus bind:value={name} placeholder="Nama" />
		{#if error}
			<p class="text-[12px] font-medium text-destructive">{error}</p>
		{/if}
		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button {...props} type="button" variant="outline" disabled={isSubmitting}>Batal</Button>
				{/snippet}
			</Dialog.Close>
			<Button type="submit" disabled={!name.trim() || isSubmitting}>{submitLabel}</Button>
		</Dialog.Footer>
	</form>
</Dialog.Content>
