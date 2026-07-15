<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Icon, InfoIcon } from '$lib/icons';
	import type { ArtifactRenderPayload } from '$lib/features/artifacts/types';
	import type { PaperExtractionStatus } from '$lib/features/workspaces/utils/paper-metadata-model';
	import ArtifactDetailSidebar, {
		type ArtifactSidebarRecord
	} from './ArtifactDetailSidebar.svelte';

	type NonMarkdownPayload = Exclude<ArtifactRenderPayload, { artifactType: 'markdown' }>;

	/**
	 * Header "Details" trigger + popover holding the full artifact metadata panel — port of web
	 * `artifact-detail-sidebar.tsx` `ArtifactMetadataPopover`. Keeps the reading column flush.
	 */
	let {
		artifact,
		payload,
		title,
		paperExtraction,
		retryGrobidExtraction,
		retryUrlExtraction
	}: {
		artifact: ArtifactSidebarRecord;
		payload: NonMarkdownPayload;
		title: string;
		paperExtraction?: PaperExtractionStatus;
		retryGrobidExtraction: () => Promise<unknown>;
		retryUrlExtraction: () => Promise<unknown>;
	} = $props();
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
		<ArtifactDetailSidebar
			{artifact}
			{payload}
			{title}
			{paperExtraction}
			{retryGrobidExtraction}
			{retryUrlExtraction}
		/>
	</Popover.Content>
</Popover.Root>
