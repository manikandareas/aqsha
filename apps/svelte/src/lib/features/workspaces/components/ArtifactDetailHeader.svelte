<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, CheckIcon, ChevronRightIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';

	/**
	 * Sticky artifact-reader breadcrumb header. Workspace crumb → editable title crumb (a controlled
	 * rename popover, formerly `ArtifactTitleBreadcrumb`, inlined here) → optional `trailing` actions.
	 */
	let {
		artifactTitle,
		onRenameArtifact,
		workspaceId,
		workspaceName,
		trailing
	}: {
		artifactTitle: string;
		onRenameArtifact: (name: string) => Promise<unknown>;
		workspaceId: string;
		workspaceName?: string;
		trailing?: Snippet;
	} = $props();

	let open = $state(false);
	let name = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);

	function handleOpenChange(nextOpen: boolean) {
		open = nextOpen;
		error = null;
		if (nextOpen) {
			name = artifactTitle;
			requestAnimationFrame(() => inputEl?.focus());
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const nextName = name.trim();
		if (!nextName || nextName === artifactTitle.trim()) {
			open = false;
			return;
		}
		isSubmitting = true;
		error = null;
		try {
			await onRenameArtifact(nextName);
			open = false;
		} catch (submitError) {
			error = readableApiErrorMessage(submitError, "We couldn't save the name.");
		}
		isSubmitting = false;
	}
</script>

<header
	class="sticky top-0 z-30 flex h-11 items-center justify-between gap-2 bg-background/70 px-5 backdrop-blur-xl sm:gap-4 sm:px-7"
>
	<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5 text-[13px]">
		<a
			href={resolve('/app/(product)/workspaces/[workspaceId]', { workspaceId })}
			class="hidden max-w-[12rem] shrink-0 truncate font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
		>
			{workspaceName ?? 'Workspace'}
		</a>
		<Icon
			icon={ChevronRightIcon}
			class="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block"
		/>
		<Popover.Root {open} onOpenChange={handleOpenChange}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						aria-current="page"
						title={artifactTitle}
						class="block min-w-0 max-w-[55ch] truncate rounded-[4px] text-left font-medium text-foreground transition-colors outline-none hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40"
						aria-label="Edit artifact name"
					>
						{artifactTitle}
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="start" class="w-72 p-3">
				<form class="grid gap-2.5" onsubmit={handleSubmit}>
					<Input bind:ref={inputEl} bind:value={name} placeholder="Artifact name" />
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
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={!name.trim() || isSubmitting}>
							<Icon icon={CheckIcon} class="size-3.5" />
							Save
						</Button>
					</div>
				</form>
			</Popover.Content>
		</Popover.Root>
	</nav>
	{#if trailing}
		<div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
			{@render trailing()}
		</div>
	{/if}
</header>
