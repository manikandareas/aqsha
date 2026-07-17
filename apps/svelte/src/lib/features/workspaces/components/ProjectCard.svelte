<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Progress } from '@aqsha/ui-svelte/components/progress';
	import { useSections } from '../api';
	import {
		formatDeadline,
		formatRelativeToNow,
		sectionProgress,
		SECTION_STATUS_LABELS,
		WORKSPACE_KIND_LABELS,
		WORKSPACE_STAGE_LABELS
	} from '../labels';
	import { projectDisplayTitle, type Workspace } from '../types';

	/** Kartu proyek beranda: jenis, judul/topik, tahap, progress bab, tenggat, aktivitas. */
	let { workspace }: { workspace: Workspace } = $props();

	const isFreeform = $derived(workspace.kind === 'freeform');
	const sections = useSections(
		() => workspace.id,
		() => !isFreeform
	);
	const progress = $derived(sections.data ? sectionProgress(sections.data) : null);
	const untitled = $derived(!workspace.name.trim());
</script>

<a
	href={resolve('/app/(product)/projects/[projectId]', { projectId: workspace.id })}
	class="group flex flex-col gap-3 rounded-lg border-2 border-border bg-card p-4 transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
>
	<div class="flex items-center gap-2">
		<span aria-hidden="true" class="text-lg leading-none">{workspace.emoji?.trim() || '📚'}</span>
		<Badge variant="outline">{WORKSPACE_KIND_LABELS[workspace.kind]}</Badge>
		<Badge variant="secondary" class="ml-auto">{WORKSPACE_STAGE_LABELS[workspace.stage]}</Badge>
	</div>
	<p
		class={untitled
			? 'font-heading text-lg italic text-muted-foreground'
			: 'font-heading text-lg font-bold text-foreground'}
	>
		{projectDisplayTitle(workspace)}
	</p>
	{#if !isFreeform && progress && progress.total > 0}
		<div class="grid gap-1.5">
			<Progress value={(progress.done / progress.total) * 100} />
			<span class="text-label text-muted-foreground">
				{progress.done}/{progress.total} bab {SECTION_STATUS_LABELS.done}
			</span>
		</div>
	{/if}
	<div class="mt-auto flex items-center gap-3 text-label text-muted-foreground">
		{#if workspace.deadline != null}
			<span>Tenggat {formatDeadline(workspace.deadline)}</span>
		{/if}
		<span class="ml-auto">Diperbarui {formatRelativeToNow(workspace.updatedAt)}</span>
	</div>
</a>
