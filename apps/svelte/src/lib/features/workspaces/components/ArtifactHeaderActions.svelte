<script lang="ts">
	import * as Tooltip from '@aqsha/ui-svelte/components/tooltip';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import {
		Icon,
		BookmarkIcon,
		DownloadIcon,
		ExternalLinkIcon,
		MoreHorizontalIcon,
		Trash2Icon,
		type IconSvgElement
	} from '$lib/icons';
	import type { ArtifactRenderPayload } from '$lib/features/artifacts/types';
	import {
		resolveArtifactDownload,
		triggerArtifactDownload
	} from '$lib/features/threads/lib/artifact-download';

	/**
	 * Reader header action cluster (open link/file, download, More menu). `onAddToCitations` is a Citation
	 * Manager bridge — only supplied for a scholarly paper.
	 */
	let {
		payload,
		title,
		onDelete,
		onAddToCitations
	}: {
		payload: ArtifactRenderPayload;
		title: string;
		onDelete: () => void;
		onAddToCitations?: () => void;
	} = $props();

	const download = $derived(resolveArtifactDownload(payload, title));
</script>

{#snippet headerLink(
	label: string,
	href: string,
	downloadName: string | undefined,
	iconDef: IconSvgElement
)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					{href}
					variant="ghost"
					size="icon-sm"
					target={downloadName ? undefined : '_blank'}
					rel="noreferrer"
					download={downloadName}
					aria-label={label}
				>
					<Icon icon={iconDef} class="size-4" />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{label}</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Tooltip.Provider>
	<div class="flex items-center gap-1">
		{#if payload.artifactType === 'url'}
			{@render headerLink('Open link', payload.normalizedUrl, undefined, ExternalLinkIcon)}
		{/if}
		{#if payload.artifactType === 'pdf' || payload.artifactType === 'docx' || payload.artifactType === 'image'}
			{@render headerLink('Open file', payload.url, undefined, ExternalLinkIcon)}
		{/if}

		{#if download.kind === 'url'}
			{@render headerLink('Download', download.href, download.fileName, DownloadIcon)}
		{:else}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Download"
							onclick={() => triggerArtifactDownload(download)}
						>
							<Icon icon={DownloadIcon} class="size-4" />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Download</Tooltip.Content>
			</Tooltip.Root>
		{/if}

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} type="button" variant="ghost" size="icon-sm" aria-label="More actions">
						<Icon icon={MoreHorizontalIcon} class="size-4" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-56">
				{#if onAddToCitations}
					<DropdownMenu.Item onclick={onAddToCitations}>
						<Icon icon={BookmarkIcon} class="size-4" />
						Tambahkan ke Sitasi
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
				{/if}
				<DropdownMenu.Item variant="destructive" onclick={onDelete}>
					<Icon icon={Trash2Icon} class="size-4" />
					Delete artifact
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</Tooltip.Provider>
