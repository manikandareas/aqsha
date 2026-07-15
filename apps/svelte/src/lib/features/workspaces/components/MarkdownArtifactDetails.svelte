<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Icon, InfoIcon } from '$lib/icons';
	import MarkdownArtifactInfo from './MarkdownArtifactInfo.svelte';
	import { type ArtifactSidebarRecord } from './ArtifactDetailSidebar.svelte';

	/**
	 * Header "Details" trigger + popover for a markdown document — port of web
	 * `artifact-detail-sidebar.tsx` `MarkdownArtifactDetails`.
	 */
	let { artifact }: { artifact: ArtifactSidebarRecord } = $props();
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Details"
				title="Details"
			>
				<Icon icon={InfoIcon} class="size-4" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="end"
		class="max-h-[72svh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-4"
	>
		<MarkdownArtifactInfo {artifact} />
	</Popover.Content>
</Popover.Root>
