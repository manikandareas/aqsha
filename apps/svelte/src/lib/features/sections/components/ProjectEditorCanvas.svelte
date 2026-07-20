<script lang="ts">
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { cn } from '@aqsha/ui-svelte/utils';
	import type { WorkspaceSection } from '$lib/features/workspaces/types';
	import BibliographyView from './BibliographyView.svelte';
	import ProjectSectionEditorBlock from './ProjectSectionEditorBlock.svelte';

	let {
		workspaceId,
		sections,
		activeSectionId,
		onActiveSectionChange
	}: {
		workspaceId: string;
		sections: WorkspaceSection[];
		activeSectionId: string | null;
		onActiveSectionChange: (sectionId: string) => void;
	} = $props();

	const orderedSections = $derived([...sections].sort((a, b) => a.sortOrder - b.sortOrder));

	function activate(sectionId: string): void {
		onActiveSectionChange(sectionId);
		window.document
			.getElementById(`workspace-section-${sectionId}`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
	<nav
		class="flex shrink-0 items-center gap-1 overflow-x-auto border-b-2 border-border bg-card px-3 py-2"
		aria-label="Pindah bab"
	>
		<span class="mr-1 shrink-0 font-heading text-sm font-bold">Naskah</span>
		{#each orderedSections as section (section.id)}
			<button
				type="button"
				class={cn(
					'shrink-0 rounded-sm border-2 px-2.5 py-1 text-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
					activeSectionId === section.id
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
				)}
				aria-current={activeSectionId === section.id ? 'page' : undefined}
				onclick={() => activate(section.id)}
			>
				{section.title}
			</button>
		{/each}
	</nav>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if orderedSections.length === 0}
			<div class="flex min-h-full items-center justify-center p-6">
				<div
					class="max-w-sm rounded-lg border-2 border-dashed border-border bg-card p-8 text-center"
				>
					<p class="font-medium">Belum ada bab untuk ditulis.</p>
					<p class="mt-2 text-label text-muted-foreground">
						Tambahkan bab dari Kerangka, lalu naskahnya akan muncul di kanvas ini.
					</p>
				</div>
			</div>
		{:else}
			{#each orderedSections as section (section.id)}
				{#if section.role === 'bibliography'}
					<section
						id={`workspace-section-${section.id}`}
						data-section-id={section.id}
						class="scroll-mt-12 border-b border-border bg-background px-4 py-4 last:border-b-0"
						aria-labelledby={`workspace-section-heading-${section.id}`}
					>
						<header class="mb-3 flex flex-wrap items-center gap-2">
							<button
								type="button"
								class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
								onclick={() => onActiveSectionChange(section.id)}
							>
								<h2
									id={`workspace-section-heading-${section.id}`}
									class="truncate font-heading text-base font-bold"
								>
									{section.title}
								</h2>
							</button>
							<Badge variant="outline">Otomatis · hanya baca</Badge>
						</header>
						<BibliographyView {workspaceId} />
					</section>
				{:else}
					<ProjectSectionEditorBlock
						{workspaceId}
						{section}
						active={activeSectionId === section.id}
						onActivate={onActiveSectionChange}
					/>
				{/if}
			{/each}
		{/if}
	</div>
</div>
