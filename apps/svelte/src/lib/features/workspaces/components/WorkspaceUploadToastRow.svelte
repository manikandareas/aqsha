<script lang="ts">
	import { cn } from '$lib/utils';
	import {
		getStatusText,
		type UploadQueueItem
	} from '$lib/features/workspaces/components/workspace-upload-toast-model';
	import WorkspaceUploadToastStatusIcon from './WorkspaceUploadToastStatusIcon.svelte';

	let { item }: { item: UploadQueueItem } = $props();

	const statusText = $derived(getStatusText(item));
</script>

<div class="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5">
	<WorkspaceUploadToastStatusIcon status={item.status} class="size-3.5" />
	<span class="min-w-0 flex-1 truncate text-[12px] font-medium leading-4">
		{item.file.name}
	</span>
	<span
		title={statusText}
		class={cn(
			'max-w-[42%] shrink-0 truncate text-[11px] leading-4 text-muted-foreground',
			item.status === 'failed' && 'text-coral-foreground'
		)}
	>
		{statusText}
	</span>
</div>
