<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { formatDeadline, formatRelativeToNow, WORKSPACE_KIND_LABELS } from '../labels';
	import { projectDisplayTitle, type Workspace } from '../types';

	/** Kartu proyek beranda: jenis, judul/topik, tenggat, aktivitas terakhir. */
	let { workspace }: { workspace: Workspace } = $props();

	const untitled = $derived(!workspace.name.trim());
</script>

<a
	href={resolve('/app/(product)/projects/[projectId]', { projectId: workspace.id })}
	class="group flex flex-col gap-3 rounded-lg border-2 border-border bg-card p-4 transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
>
	<div class="flex items-center gap-2">
		<span aria-hidden="true" class="text-lg leading-none">{workspace.emoji?.trim() || '📚'}</span>
		<Badge variant="outline">{WORKSPACE_KIND_LABELS[workspace.kind]}</Badge>
	</div>
	<p
		class={untitled
			? 'font-heading text-lg italic text-muted-foreground'
			: 'font-heading text-lg font-bold text-foreground'}
	>
		{projectDisplayTitle(workspace)}
	</p>
	<div class="mt-auto flex items-center gap-3 text-label text-muted-foreground">
		{#if workspace.deadline != null}
			<span>Tenggat {formatDeadline(workspace.deadline)}</span>
		{/if}
		<span class="ml-auto">Diperbarui {formatRelativeToNow(workspace.updatedAt)}</span>
	</div>
</a>
