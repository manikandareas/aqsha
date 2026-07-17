<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import AppLoadingOverlay from '$lib/components/layout/AppLoadingOverlay.svelte';
	import Response from '$lib/components/ai-elements/Response.svelte';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import PanelTitleLabel from '$lib/components/layout/PanelTitleLabel.svelte';
	import type { ArtifactRenderPayload } from '$lib/features/artifacts/types';
	import type { PaperExtractionStatus } from '$lib/features/workspaces/utils/paper-metadata-model';
	import { useCreateCitationFromArtifact } from '$lib/features/citations/api';
	import type { useArtifactDetailData } from '$lib/features/workspaces/api/use-workspaces-data';
	import ArtifactDetailHeader from './ArtifactDetailHeader.svelte';
	import ArtifactReadingColumn from './ArtifactRenderPanels.svelte';
	import ArtifactHeaderActions from './ArtifactHeaderActions.svelte';
	import ArtifactMissingState from './ArtifactMissingState.svelte';
	import ArtifactMetadataPopover from './ArtifactMetadataPopover.svelte';
	import ArtifactPanelActions from './ArtifactPanelActions.svelte';
	import ArtifactDeleteDialog from './ArtifactDeleteDialog.svelte';
	import MarkdownArtifactDetails from './MarkdownArtifactDetails.svelte';
	import MarkdownArtifactInfo from './MarkdownArtifactInfo.svelte';
	import ArtifactDetailSidebar, {
		type ArtifactSidebarRecord
	} from './ArtifactDetailSidebar.svelte';

	/**
	 * The artifact reader orchestrator. Header + reading column + metadata sidebar; dispatches the body
	 * by `artifactType`. Unlike a self-fetching variant, this component receives the `useArtifactDetailData`
	 * result as a prop — the page shell owns the fetch and passes data DOWN. Shared by the full route
	 * (`variant="page"`) and the thread-detail artifact side panel (`variant="panel"`); only the chrome differs.
	 *
	 * Document editing is deferred to the post-cutover editor redesign. Both variants render markdown
	 * read-only as prose; the page variant adds a small read-only note. Render-error / autosave surfaces
	 * are not modelled (they belong to the editor redesign).
	 */
	type ArtifactDetailData = ReturnType<typeof useArtifactDetailData>;
	type ArtifactDetailVariant = 'page' | 'panel';

	let {
		data,
		artifactId,
		workspaceId,
		variant,
		embedded = false,
		onClose
	}: {
		data: ArtifactDetailData;
		artifactId: string;
		/** Required for the page route; the panel derives it from the loaded artifact. */
		workspaceId?: string;
		variant: ArtifactDetailVariant;
		/**
		 * Panel only: the host already renders a panel header + close (e.g. the thread `DetailPanel`),
		 * so skip this view's own `PanelCardToolbar` to avoid a double toolbar. Renders body-only.
		 */
		embedded?: boolean;
		/** Panel only: close the side panel. */
		onClose?: () => void;
	} = $props();

	// Content-first reading measure (markdown docs, pdf pages, url/plain-text readers).
	const proseColumnClass = 'mx-auto w-full max-w-[860px] px-4 pb-16 pt-3 @2xl:px-6';
	// Roomier column for framed embedded viewers (html/svg/diagram/data/code).
	const mediaColumnClass = 'mx-auto w-full max-w-[1040px] px-4 pb-16 pt-3 @2xl:px-6';
	const contentFirstTypes = ['markdown', 'plain_text', 'url', 'pdf', 'docx'];

	const detail = $derived(data.artifact);
	const detailIsMarkdown = $derived(detail?.artifact?.artifactType === 'markdown');
	const resolvedWorkspaceId = $derived(workspaceId ?? detail?.artifact?.workspaceId ?? '');
	const activeRenderPayload = $derived(
		(data.renderPayload ?? null) as ArtifactRenderPayload | null
	);

	// The page route guards against a workspace/artifact mismatch in the URL; the panel always shows
	// the artifact's own workspace, so there is nothing to mismatch against.
	const workspaceMismatch = $derived(
		variant === 'page' && detail?.artifact != null && detail.artifact.workspaceId !== workspaceId
	);
	const ready = $derived(Boolean(detail?.artifact) && !workspaceMismatch);
	const isMarkdown = $derived(detailIsMarkdown);
	const workspaceName = $derived(
		data.workspaces.find((workspace) => workspace._id === resolvedWorkspaceId)?.name
	);

	const bodyColumnClass = $derived(
		!activeRenderPayload || contentFirstTypes.includes(activeRenderPayload.artifactType)
			? proseColumnClass
			: mediaColumnClass
	);

	let deleteOpen = $state(false);

	// "Tambahkan ke Sitasi" is a paper-only page bridge (createFromArtifact reads paper metadata).
	const addToCitations = useCreateCitationFromArtifact(() => resolvedWorkspaceId);
	const canAddToCitations = $derived(
		variant === 'page' &&
			Boolean(resolvedWorkspaceId) &&
			detail?.artifact?.detectedDocumentKind === 'scholarly_paper'
	);

	function handleAddToCitations() {
		void addToCitations.mutateAsync({ artifactId }).then(
			(result) => toast.success(result.created ? 'Ditambahkan ke Sitasi' : 'Sudah ada di Sitasi'),
			() => {
				/* error toast owned by the hook */
			}
		);
	}

	function renameArtifact(name: string) {
		return data.renameArtifact({ artifactId, title: name });
	}

	function openDelete() {
		deleteOpen = true;
	}

	async function handleDeleteConfirm() {
		await data.removeArtifact({ artifactId });
		if (variant === 'panel') {
			onClose?.();
		} else {
			await goto(
				resolve('/app/(product)/projects/[projectId]', { projectId: resolvedWorkspaceId })
			);
		}
	}
</script>

{#snippet headerActions()}
	{#if ready && detail && activeRenderPayload}
		<ArtifactHeaderActions
			payload={activeRenderPayload}
			title={detail.artifact.title}
			onDelete={openDelete}
			onAddToCitations={canAddToCitations ? handleAddToCitations : undefined}
		/>
	{/if}
{/snippet}

{#snippet trailingContent()}
	{#if ready && detail}
		{#if isMarkdown}
			<div class="flex items-center gap-1">
				<MarkdownArtifactDetails artifact={detail.artifact as ArtifactSidebarRecord} />
				{@render headerActions()}
			</div>
		{:else if activeRenderPayload}
			<div class="flex items-center gap-1">
				{#if activeRenderPayload.artifactType !== 'markdown'}
					<ArtifactMetadataPopover
						artifact={detail.artifact as ArtifactSidebarRecord}
						payload={activeRenderPayload}
						title={detail.artifact.title}
						paperExtraction={data.paperExtraction as PaperExtractionStatus}
						retryGrobidExtraction={data.retryGrobidExtraction}
						retryUrlExtraction={data.retryUrlExtraction}
					/>
				{/if}
				{@render headerActions()}
			</div>
		{/if}
	{/if}
{/snippet}

{#snippet infoContent()}
	{#if ready && detail && activeRenderPayload}
		{#if activeRenderPayload.artifactType === 'markdown'}
			<MarkdownArtifactInfo artifact={detail.artifact as ArtifactSidebarRecord} />
		{:else}
			<ArtifactDetailSidebar
				artifact={detail.artifact as ArtifactSidebarRecord}
				payload={activeRenderPayload}
				title={detail.artifact.title}
				paperExtraction={data.paperExtraction as PaperExtractionStatus}
				retryGrobidExtraction={data.retryGrobidExtraction}
				retryUrlExtraction={data.retryUrlExtraction}
			/>
		{/if}
	{/if}
{/snippet}

{#snippet panelTitle()}
	{#if ready && detail}
		<PanelTitleLabel>{detail.artifact.title}</PanelTitleLabel>
	{/if}
{/snippet}

{#snippet panelActions()}
	{#if ready && detail && activeRenderPayload}
		<ArtifactPanelActions
			payload={activeRenderPayload}
			title={detail.artifact.title}
			{infoContent}
			onDelete={openDelete}
		/>
	{/if}
{/snippet}

{#snippet header()}
	{#if ready && detail && variant === 'page'}
		<ArtifactDetailHeader
			artifactTitle={detail.artifact.title}
			workspaceId={resolvedWorkspaceId}
			{workspaceName}
			onRenameArtifact={renameArtifact}
		>
			{#snippet trailing()}
				{@render trailingContent()}
			{/snippet}
		</ArtifactDetailHeader>
	{:else if variant === 'panel'}
		<PanelCardToolbar title={panelTitle} actions={ready && detail ? panelActions : undefined} />
	{/if}
{/snippet}

{#snippet body()}
	<div class={bodyColumnClass}>
		{#if data.isLoading}
			<AppLoadingOverlay variant="absolute" />
		{:else if !ready || !detail}
			<ArtifactMissingState workspaceId={resolvedWorkspaceId} />
		{:else if !activeRenderPayload}
			<AppLoadingOverlay variant="absolute" />
		{:else if activeRenderPayload.artifactType === 'markdown'}
			<div class="mx-auto w-full max-w-[820px]">
				{#if variant === 'panel'}
					<!-- Panel is a read-only viewer: render markdown as prose (keyed on updatedAt upstream). -->
					<Response
						text={activeRenderPayload.markdown}
						class="aqsha-prose aqsha-prose-message min-w-0"
					/>
				{:else}
					<!-- Document editing is deferred to the post-cutover editor redesign; no fixed
					     timeline is promised. For now the document renders read-only as prose. -->
					<div class="grid gap-3">
						<h1
							class="px-1 pt-2 text-[2rem] leading-[1.15] font-bold tracking-tight text-foreground sm:text-[2.25rem]"
						>
							{detail.artifact.title}
						</h1>
						<div
							class="rounded-[10px] border border-border/80 bg-card/40 px-4 py-3 text-[13px] leading-6 font-medium text-muted-foreground"
						>
							Dokumen ini tampil read-only untuk saat ini.
						</div>
						<Response
							text={activeRenderPayload.markdown}
							class="aqsha-prose aqsha-prose-message min-w-0"
						/>
					</div>
				{/if}
			</div>
		{:else}
			<div class="min-w-0">
				<ArtifactReadingColumn payload={activeRenderPayload} title={detail.artifact.title} />
			</div>
		{/if}
	</div>
{/snippet}

{#snippet deleteDialog()}
	{#if ready && detail}
		<ArtifactDeleteDialog
			open={deleteOpen}
			title={detail.artifact.title}
			onOpenChange={(open) => (deleteOpen = open)}
			onConfirm={handleDeleteConfirm}
		/>
	{/if}
{/snippet}

{#if variant === 'panel'}
	{#if !embedded}
		{@render header()}
	{/if}
	<div class="relative min-h-0 flex-1 overflow-y-auto">{@render body()}</div>
	{@render deleteDialog()}
{:else}
	<div class="min-h-full bg-background text-foreground">
		{@render header()}
		{@render body()}
		{@render deleteDialog()}
	</div>
{/if}
