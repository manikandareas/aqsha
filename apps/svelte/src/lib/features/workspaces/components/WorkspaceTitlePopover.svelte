<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Icon, CheckIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';

	/** Rename-workspace popover in the board toolbar — from `workspace-board-toolbar.tsx`. */
	let {
		workspaceName,
		onRenameWorkspace
	}: {
		workspaceName: string;
		onRenameWorkspace: (name: string) => Promise<unknown>;
	} = $props();

	let open = $state(false);
	let name = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	function handleOpenChange(nextOpen: boolean) {
		open = nextOpen;
		error = null;
		if (nextOpen) {
			name = workspaceName;
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const nextName = name.trim();
		if (!nextName || nextName === workspaceName.trim()) {
			open = false;
			return;
		}
		isSubmitting = true;
		error = null;
		try {
			await onRenameWorkspace(nextName);
			open = false;
		} catch (submitError) {
			error = readableApiErrorMessage(submitError, 'Nama belum bisa disimpan.');
		}
		isSubmitting = false;
	}
</script>

<Popover.Root {open} onOpenChange={handleOpenChange}>
	<h1
		class="min-w-0 self-center font-sans text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg"
	>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="block max-w-full truncate rounded-[4px] text-left outline-none transition-colors hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/40"
					aria-label="Edit nama workspace"
				>
					{workspaceName}
				</button>
			{/snippet}
		</Popover.Trigger>
	</h1>
	<Popover.Content align="start" class="w-72 p-3">
		<form class="grid gap-2.5" onsubmit={handleSubmit}>
			<Input bind:value={name} placeholder="Nama workspace" />
			{#if error}
				<p class="text-[12px] font-medium text-destructive">{error}</p>
			{/if}
			<div class="flex justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={isSubmitting}
					onclick={() => (open = false)}
				>
					Batal
				</Button>
				<Button type="submit" size="sm" disabled={!name.trim() || isSubmitting}>
					<Icon icon={CheckIcon} class="size-3.5" />
					Simpan
				</Button>
			</div>
		</form>
	</Popover.Content>
</Popover.Root>
