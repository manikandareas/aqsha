<script lang="ts">
	import { Icon, AlertCircleIcon, CheckCircle2Icon, ClockIcon, Loader2Icon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import type { WorkspaceUploadStatus } from '$lib/features/workspaces/utils/workspace-file-upload';

	let {
		status,
		class: className
	}: {
		status: WorkspaceUploadStatus;
		class?: string;
	} = $props();

	const base = $derived(cn('shrink-0', className ?? 'size-4'));
</script>

{#if status === 'complete'}
	<Icon icon={CheckCircle2Icon} class={cn(base, 'text-mint-foreground')} />
{:else if status === 'failed'}
	<Icon icon={AlertCircleIcon} class={cn(base, 'text-coral-foreground')} />
{:else if status === 'queued'}
	<Icon icon={ClockIcon} class={cn(base, 'text-muted-foreground')} />
{:else}
	<!-- uploading / processing -->
	<Icon icon={Loader2Icon} class={cn(base, 'animate-spin text-primary')} />
{/if}
