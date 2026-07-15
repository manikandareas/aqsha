<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Icon, ArrowLeftIcon, FileIcon } from '$lib/icons';

	/**
	 * Empty state when the requested artifact isn't available in the open workspace — port of web
	 * `artifact-render-panels.tsx` `ArtifactMissingState`.
	 */
	let { workspaceId }: { workspaceId: string } = $props();
</script>

<section>
	<Button
		href={resolve('/app/(product)/workspaces/[workspaceId]', { workspaceId })}
		variant="ghost"
		size="sm"
		class="-ml-2 mb-5 text-muted-foreground"
	>
		<Icon icon={ArrowLeftIcon} class="size-4" />
		Back to workspace
	</Button>
	<div
		class="grid min-h-[48svh] place-items-center rounded-[8px] border border-border/80 bg-card/30 p-6 text-center"
	>
		<div>
			<Icon icon={FileIcon} class="mx-auto size-8 text-muted-foreground" />
			<h1 class="mt-4 text-xl font-semibold text-foreground">This artifact isn't available.</h1>
			<p class="mt-2 max-w-md text-[14px] leading-6 font-medium text-muted-foreground">
				We couldn't find this artifact in the workspace you have open.
			</p>
		</div>
	</div>
</section>
