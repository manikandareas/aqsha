<script lang="ts">
	import { Icon, AlertCircleIcon, NotebookIcon, getArtifactTypeIcon } from '$lib/icons';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		artifactTypeLabel,
		formatArtifactYear,
		provenanceLabel,
		type ArtifactSource
	} from './artifact-presentation';
	import LibraryCardFrame from './LibraryCardFrame.svelte';

	/** Tall library card face for workspace artifacts. */
	let {
		title,
		artifactType,
		source,
		createdAt,
		isSelected,
		isProcessing = false,
		processingFailed = false,
		onClick,
		onDoubleClick
	}: {
		title: string;
		artifactType?: string;
		source?: ArtifactSource;
		createdAt: number;
		isSelected: boolean;
		isProcessing?: boolean;
		processingFailed?: boolean;
		onClick: () => void;
		onDoubleClick?: () => void;
	} = $props();

	const label = $derived(artifactTypeLabel(artifactType));
	const year = $derived(formatArtifactYear(createdAt));
	// Agent output gets the accented "Artifact" badge; other provenance (manual
	// "Catatan") keeps the quiet outline chip. Uploads/URLs stay unlabelled — their
	// type chip already conveys origin.
	const isArtifact = $derived(source === 'agent');
	const provenance = $derived(isArtifact ? null : provenanceLabel(source));
</script>

{#snippet header()}
	<div class="flex items-center gap-2">
		<span
			class="inline-flex h-7 shrink-0 items-center justify-center rounded-[8px] bg-muted px-2 text-[12px] font-semibold leading-none text-muted-foreground"
		>
			{year}
		</span>
		{#if isArtifact}
			<span
				class="inline-flex h-7 shrink-0 items-center gap-1 rounded-[8px] bg-primary/15 px-2 text-[11px] font-semibold leading-none text-primary"
			>
				<Icon icon={NotebookIcon} class="size-3" />
				Artifact
			</span>
		{:else if provenance}
			<span
				class="inline-flex h-7 shrink-0 items-center justify-center rounded-[8px] border border-border px-2 text-[11px] font-medium leading-none text-muted-foreground"
			>
				{provenance}
			</span>
		{/if}
	</div>
{/snippet}

{#if isProcessing && processingFailed}
	<LibraryCardFrame selected={false}>
		<div
			aria-label={`${title}. Gagal memproses.`}
			class="flex size-full min-h-0 cursor-default flex-col p-5 text-left opacity-80"
		>
			{@render header()}
			<h3 class="mt-5 line-clamp-7 text-[20px] font-semibold leading-[1.22] text-muted-foreground">
				{title}
			</h3>
			<div class="mt-auto flex items-center gap-1.5 pt-8 text-destructive">
				<Icon icon={AlertCircleIcon} class="size-3.5" />
				<span class="text-[12px] font-semibold leading-none">Gagal memproses</span>
			</div>
		</div>
	</LibraryCardFrame>
{:else if isProcessing}
	<LibraryCardFrame selected={false}>
		<div
			aria-busy="true"
			aria-label={`${title}. Sedang diproses…`}
			class="flex size-full min-h-0 cursor-default flex-col p-5"
		>
			<div class="flex items-center gap-2">
				<Skeleton class="h-7 w-12 rounded-[8px]" />
				<Skeleton class="h-7 w-16 rounded-[8px]" />
			</div>
			<div class="mt-5 space-y-2.5">
				<Skeleton class="h-4 w-[85%]" />
				<Skeleton class="h-4 w-[68%]" />
				<Skeleton class="h-4 w-[52%]" />
			</div>
			<div class="mt-auto flex items-center gap-2 pt-8">
				<Skeleton class="size-3.5 rounded-[4px]" />
				<Skeleton class="h-3 w-16 rounded-md" />
			</div>
		</div>
	</LibraryCardFrame>
{:else}
	<LibraryCardFrame selected={isSelected}>
		<button
			type="button"
			onclick={onClick}
			ondblclick={onDoubleClick}
			aria-pressed={isSelected}
			aria-label={`${title}. Klik untuk ${isSelected ? 'hapus dari' : 'tambah ke'} konteks.`}
			class="flex size-full min-h-0 flex-col p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
		>
			{@render header()}
			<h3 class="mt-5 line-clamp-7 text-[20px] font-semibold leading-[1.22] text-foreground">
				{title}
			</h3>
			<div class="mt-auto flex items-center gap-1.5 pt-8 text-muted-foreground">
				<span class="relative inline-flex size-4 shrink-0 items-end justify-end">
					<span
						class="absolute left-0 top-0.5 size-3 rotate-[-14deg] rounded-[4px] bg-muted-foreground/45"
					></span>
					<span class="relative size-3.5 rounded-[4px] border border-card bg-muted-foreground/70"
					></span>
				</span>
				<span class="text-[12px] font-semibold leading-none">{label}</span>
				<Icon
					icon={getArtifactTypeIcon(artifactType)}
					class="ml-auto size-3.5 text-muted-foreground"
				/>
			</div>
		</button>
	</LibraryCardFrame>
{/if}
