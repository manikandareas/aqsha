<script lang="ts">
	import { Icon, FileTextIcon } from '$lib/icons';
	import type { ArtifactCardModel } from '../lib/timeline-types';
	import { getMessageInteractions } from './message-interactions';

	/**
	 * Agent-created document card (Slice 6.5) — a successful `propose_artifact`. Clicking the title
	 * opens the artifact reader in the right panel (`openArtifact`); in compact chat panels (no slot) it
	 * is static. Port of `chat-artifact-card.tsx`.
	 *
	 * Phase 9 seam: "Save to workspace" (FolderIcon → WorkspacePicker → `linkToWorkspace`) is deferred to
	 * Phase 9 (workspaces + artifacts APIs). Rendered here without the save affordance until then.
	 */
	let { model }: { model: ArtifactCardModel } = $props();

	const interactions = getMessageInteractions();
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
</div>
