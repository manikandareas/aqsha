<script lang="ts">
	import { page } from '$app/state';
	import { Spinner } from '$lib/components/ui/spinner';
	import ThreadDetailShell from '$lib/features/thread-experience/components/ThreadDetailShell.svelte';
	import { useWorkspace } from '$lib/features/workspaces/api';
	import { projectDisplayTitle } from '$lib/features/workspaces/types';

	const projectId = $derived(page.params.projectId!);
	const threadId = $derived(page.params.threadId!);
	const workspace = useWorkspace(() => projectId);
</script>

{#if workspace.data}
	{#key threadId}
		<ThreadDetailShell
			{threadId}
			workspace={{ id: workspace.data.id, name: projectDisplayTitle(workspace.data) }}
		/>
	{/key}
{:else if workspace.isPending}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat proyek…</span>
	</div>
{:else}
	<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
		<p>Proyek tidak ditemukan.</p>
	</div>
{/if}
