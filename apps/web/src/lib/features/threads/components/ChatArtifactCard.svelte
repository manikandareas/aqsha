<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Icon, CheckIcon, FileTextIcon, FolderIcon } from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { useLinkArtifactToWorkspace } from '$lib/features/artifacts/api';
	import WorkspacePicker from '$lib/features/workspaces/components/WorkspacePicker.svelte';
	import type { ArtifactCardModel } from '../lib/timeline-types';
	import { getMessageInteractions } from './message-interactions';

	/**
	 * Agent-created document card (Slice 6.5) — a successful `propose_artifact`. Artifact is
	 * BORN-HEADLESS (`workspaceId=null`): offer Save-to-workspace (FolderIcon → picker →
	 * `linkToWorkspace`). Once saved → static "Tersimpan" badge. Clicking the title opens the artifact
	 * reader in the right panel (`openArtifact`); in compact chat panels (no slot) it is static.
	 */
	let { model }: { model: ArtifactCardModel } = $props();

	const interactions = getMessageInteractions();
	const link = useLinkArtifactToWorkspace();
	let open = $state(false);
	let saved = $state(false);
</script>

<div
	class="flex w-full min-w-0 items-start gap-2 rounded-[10px] border border-border/80 bg-card/40 px-3 py-2.5 text-left text-[13px] leading-5"
>
	{#snippet titleBlock()}
		<Icon icon={FileTextIcon} class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
		<span class="min-w-0 flex-1">
			<span class="line-clamp-2 font-medium break-words text-foreground">{model.title}</span>
			<span class="mt-0.5 block truncate text-[12px] text-muted-foreground">Dibuat · Dokumen</span>
		</span>
	{/snippet}

	{#if interactions.openArtifact}
		<button
			type="button"
			onclick={() => interactions.openArtifact?.(model.artifactId)}
			aria-label={`Buka ${model.title}`}
			class="-m-0.5 flex min-w-0 flex-1 items-start gap-2 rounded-md p-0.5 text-left transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{@render titleBlock()}
		</button>
	{:else}
		<div class="flex min-w-0 flex-1 items-start gap-2">
			{@render titleBlock()}
		</div>
	{/if}

	{#if saved}
		<span
			class="inline-flex shrink-0 items-center gap-1 self-center px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
		>
			<Icon icon={CheckIcon} class="size-3.5" />
			Tersimpan
		</span>
	{:else}
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="ghost"
						size="icon"
						class="size-7 shrink-0 self-center"
						aria-label="Simpan ke workspace"
					>
						<Icon icon={FolderIcon} class="size-4" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-64 p-2">
				<p class="px-1 pb-1.5 text-[12px] font-medium text-foreground">Simpan ke workspace</p>
				<WorkspacePicker
					disabled={link.isPending}
					onSelect={(workspaceId) =>
						link.mutate(
							{ id: model.artifactId, workspaceId },
							{
								onSuccess: () => {
									toast.success('Disimpan ke workspace');
									saved = true;
									open = false;
								}
							}
						)}
				/>
			</Popover.Content>
		</Popover.Root>
	{/if}
</div>
