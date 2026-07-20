<script lang="ts">
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import * as Resizable from '@aqsha/ui-svelte/components/resizable';
	import * as Sheet from '@aqsha/ui-svelte/components/sheet';
	import * as ToggleGroup from '@aqsha/ui-svelte/components/toggle-group';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { PageTitle } from '$lib/seo';
	import { Spinner } from '$lib/components/ui/spinner';
	import ProjectEditorCanvas from '$lib/features/sections/components/ProjectEditorCanvas.svelte';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import {
		Icon,
		Code2Icon,
		FileTextIcon,
		FolderTreeIcon,
		Library,
		MessageSquareIcon,
		MoreHorizontalIcon
	} from '$lib/icons';
	import ProjectChatPane from '../components/ProjectChatPane.svelte';
	import ProjectDocumentViewer from '../components/ProjectDocumentViewer.svelte';
	import ProjectHeader from '../components/ProjectHeader.svelte';
	import ProjectSourcesPanel from '../components/ProjectSourcesPanel.svelte';
	import SectionOutline from '../components/SectionOutline.svelte';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle, type WorkspaceSection } from '../types';

	let { workspaceId }: { workspaceId: string } = $props();

	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	const workspace = useWorkspace(
		() => workspaceId,
		() => enabled
	);
	const sections = useSections(
		() => workspaceId,
		() => enabled
	);

	$effect(() => {
		const w = workspace.data;
		if (!w) return;
		mentions.syncAmbientFromPage([
			{ kind: 'workspace', workspaceId: w.id, label: projectDisplayTitle(w) }
		]);
	});

	type LeftMode = 'chat' | 'editor';
	type MobileMode = LeftMode | 'viewer';

	let workspaceHost = $state<HTMLDivElement | null>(null);
	let containerMeasured = $state(false);
	let wideWorkspace = $state(false);
	let leftMode = $state<LeftMode>('chat');
	let mobileMode = $state<MobileMode>('chat');
	let editorVisited = $state(false);
	let viewerVisited = $state(false);
	let outlineOpen = $state(false);
	let sourcesOpen = $state(false);
	let detailsOpen = $state(false);

	// The breakpoint follows the workspace container after the app rail, not the viewport.
	$effect(() => {
		if (!browser) return;
		const host = workspaceHost;
		if (!host) return;
		const measure = () => {
			wideWorkspace = host.clientWidth >= 880;
			if (wideWorkspace) viewerVisited = true;
			containerMeasured = true;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(host);
		return () => observer.disconnect();
	});

	const activeSectionId = $derived.by(() => {
		const available = sections.data ?? [];
		const requested = page.url.searchParams.get('section');
		if (requested && available.some((section) => section.id === requested)) return requested;
		return available.find((section) => section.role !== 'bibliography')?.id ?? null;
	});

	$effect(() => {
		if (!browser || !activeSectionId) return;
		if (page.url.searchParams.get('section') === activeSectionId) return;
		const nextUrl = new URL(page.url);
		nextUrl.searchParams.set('section', activeSectionId);
		replaceState(nextUrl, page.state);
	});

	function setActiveSection(sectionId: string): void {
		const nextUrl = new URL(page.url);
		nextUrl.searchParams.set('section', sectionId);
		replaceState(nextUrl, page.state);
	}

	function selectLeftMode(value: string): void {
		if (value !== 'chat' && value !== 'editor') return;
		leftMode = value;
		mobileMode = value;
		if (value === 'editor') editorVisited = true;
	}

	function selectMobileMode(value: string): void {
		if (value !== 'chat' && value !== 'editor' && value !== 'viewer') return;
		mobileMode = value;
		if (value !== 'viewer') leftMode = value;
		if (value === 'editor') editorVisited = true;
		if (value === 'viewer') viewerVisited = true;
	}

	function writeWithAstra(section: WorkspaceSection) {
		mentions.setComposerDraft(
			`Bantu saya menulis bab "${section.title}". Mulai dari kerangka dan poin utama berdasarkan sumber yang sudah ada di proyek ini.`
		);
		leftMode = 'chat';
		mobileMode = 'chat';
		outlineOpen = false;
	}
</script>

{#if workspace.data}
	<PageTitle title={projectDisplayTitle(workspace.data)} />
{/if}

{#if workspace.isPending || sections.isPending}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat proyek…</span>
	</div>
{:else if !workspace.data}
	<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
		<p>Proyek tidak ditemukan.</p>
	</div>
{:else}
	<div
		bind:this={workspaceHost}
		class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background"
	>
		<header
			class="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-border bg-card px-3 py-2"
		>
			<span aria-hidden="true" class="text-lg leading-none">
				{workspace.data.emoji?.trim() || '📚'}
			</span>
			<div class="mr-auto min-w-0">
				<h1 class="max-w-72 truncate font-heading text-base font-bold">
					{projectDisplayTitle(workspace.data)}
				</h1>
				<p class="text-label text-muted-foreground">Workspace proyek</p>
			</div>

			{#if containerMeasured}
				{#if wideWorkspace}
					<ToggleGroup.Root
						type="single"
						value={leftMode}
						onValueChange={selectLeftMode}
						aria-label="Panel kerja kiri"
					>
						<ToggleGroup.Item value="chat">
							<Icon icon={MessageSquareIcon} class="size-3.5" />
							Chat
						</ToggleGroup.Item>
						<ToggleGroup.Item value="editor">
							<Icon icon={Code2Icon} class="size-3.5" />
							Editor
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				{:else}
					<ToggleGroup.Root
						type="single"
						value={mobileMode}
						onValueChange={selectMobileMode}
						aria-label="Panel workspace"
					>
						<ToggleGroup.Item value="chat">
							<Icon icon={MessageSquareIcon} class="size-3.5" />
							Chat
						</ToggleGroup.Item>
						<ToggleGroup.Item value="editor">
							<Icon icon={Code2Icon} class="size-3.5" />
							Editor
						</ToggleGroup.Item>
						<ToggleGroup.Item value="viewer">
							<Icon icon={FileTextIcon} class="size-3.5" />
							Viewer
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				{/if}
			{/if}

			<Button type="button" variant="outline" size="sm" onclick={() => (outlineOpen = true)}>
				<Icon icon={FolderTreeIcon} class="size-4" />
				<span class="hidden sm:inline">Kerangka</span>
			</Button>
			<Button type="button" variant="outline" size="sm" onclick={() => (sourcesOpen = true)}>
				<Icon icon={Library} class="size-4" />
				<span class="hidden sm:inline">Sumber</span>
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Detail proyek"
				onclick={() => (detailsOpen = true)}
			>
				<Icon icon={MoreHorizontalIcon} class="size-4" />
			</Button>
		</header>

		{#if !containerMeasured}
			<div class="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
				<Spinner class="size-4" />
				<span class="text-sm">Menyiapkan workspace…</span>
			</div>
		{:else if wideWorkspace}
			<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
				<Resizable.Pane defaultSize={42} minSize={28}>
					<div class="flex h-full min-h-0 flex-col overflow-hidden">
						<div
							class={leftMode === 'chat'
								? 'flex min-h-0 flex-1 flex-col overflow-hidden'
								: 'hidden min-h-0 flex-1 flex-col overflow-hidden'}
							aria-hidden={leftMode !== 'chat'}
						>
							<ProjectChatPane {workspaceId} />
						</div>
						{#if editorVisited}
							<div
								class={leftMode === 'editor'
									? 'flex min-h-0 flex-1 flex-col overflow-hidden'
									: 'hidden min-h-0 flex-1 flex-col overflow-hidden'}
								aria-hidden={leftMode !== 'editor'}
							>
								<ProjectEditorCanvas
									{workspaceId}
									sections={sections.data ?? []}
									{activeSectionId}
									onActiveSectionChange={setActiveSection}
								/>
							</div>
						{/if}
					</div>
				</Resizable.Pane>
				<Resizable.Handle withHandle aria-label="Ubah lebar panel kerja dan viewer dokumen" />
				<Resizable.Pane defaultSize={58} minSize={34}>
					<ProjectDocumentViewer projectId={workspaceId} />
				</Resizable.Pane>
			</Resizable.PaneGroup>
		{:else}
			<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
				<div
					class={mobileMode === 'chat'
						? 'flex min-h-0 flex-1 flex-col overflow-hidden'
						: 'hidden min-h-0 flex-1 flex-col overflow-hidden'}
					aria-hidden={mobileMode !== 'chat'}
				>
					<ProjectChatPane {workspaceId} />
				</div>
				{#if editorVisited}
					<div
						class={mobileMode === 'editor'
							? 'flex min-h-0 flex-1 flex-col overflow-hidden'
							: 'hidden min-h-0 flex-1 flex-col overflow-hidden'}
						aria-hidden={mobileMode !== 'editor'}
					>
						<ProjectEditorCanvas
							{workspaceId}
							sections={sections.data ?? []}
							{activeSectionId}
							onActiveSectionChange={setActiveSection}
						/>
					</div>
				{/if}
				{#if viewerVisited}
					<div
						class={mobileMode === 'viewer'
							? 'flex min-h-0 flex-1 flex-col overflow-hidden'
							: 'hidden min-h-0 flex-1 flex-col overflow-hidden'}
						aria-hidden={mobileMode !== 'viewer'}
					>
						<ProjectDocumentViewer projectId={workspaceId} />
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<Sheet.Root bind:open={outlineOpen}>
		<Sheet.Content side="right" class="gap-0 p-0 sm:max-w-[32rem]">
			<Sheet.Header class="sr-only">
				<Sheet.Title>Kerangka proyek</Sheet.Title>
				<Sheet.Description>Kelola urutan, status, dan judul bab.</Sheet.Description>
			</Sheet.Header>
			<div class="min-h-0 flex-1 overflow-y-auto pt-12">
				<SectionOutline
					{workspaceId}
					sections={sections.data ?? []}
					onWriteWithAstra={writeWithAstra}
				/>
			</div>
		</Sheet.Content>
	</Sheet.Root>

	<Sheet.Root bind:open={sourcesOpen}>
		<Sheet.Content side="right" class="gap-0 p-0 sm:max-w-[30rem]">
			<Sheet.Header class="border-b-2 border-border px-5 py-4">
				<Sheet.Title>Sumber proyek</Sheet.Title>
				<Sheet.Description>Sumber yang tertaut ke seluruh proyek atau satu bab.</Sheet.Description>
			</Sheet.Header>
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<ProjectSourcesPanel {workspaceId} sections={sections.data ?? []} />
			</div>
		</Sheet.Content>
	</Sheet.Root>

	<Sheet.Root bind:open={detailsOpen}>
		<Sheet.Content side="right" class="gap-0 p-0 sm:max-w-[32rem]">
			<Sheet.Header class="sr-only">
				<Sheet.Title>Detail proyek</Sheet.Title>
				<Sheet.Description>Ubah judul, tahap, dan tenggat proyek.</Sheet.Description>
			</Sheet.Header>
			<div class="min-h-0 flex-1 overflow-y-auto pt-12">
				<ProjectHeader workspace={workspace.data} />
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
