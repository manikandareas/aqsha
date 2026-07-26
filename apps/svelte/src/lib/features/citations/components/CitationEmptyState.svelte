<script lang="ts">
	import {
		FileTextIcon,
		FolderIcon,
		Icon,
		LinkIcon,
		PenLineIcon,
		Quote,
		UploadIcon
	} from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { resolve } from '$app/paths';
	import type { LibraryScope } from '../library-scope';

	/**
	 * Empty state Perpustakaan — anatomi board library (badge pill → title + deskripsi →
	 * hairline → stacked pill actions). CTAs pendek agar mirip toolbar create di workspace.
	 * Scope proyek memprioritaskan menautkan referensi yang sudah ada sebelum membuat baru.
	 */
	let {
		scope,
		onAddFromLibrary,
		onUploadPdf,
		onImportFile,
		onAddByDoi,
		onAddManual
	}: {
		scope: LibraryScope;
		onAddFromLibrary?: () => void;
		onUploadPdf: () => void;
		onImportFile: () => void;
		onAddByDoi: () => void;
		onAddManual: () => void;
	} = $props();

	const isProject = $derived(scope.kind === 'project');
	const integrationsHref = resolve('/app/(console)/settings/integrations');
</script>

<div class="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
	<div
		class="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-background/70 py-2 pr-5 pl-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-sm"
	>
		<span
			class="grid size-7 place-items-center rounded-full bg-lavender-soft text-lavender-foreground ring-1 ring-lavender-soft-border ring-inset"
		>
			<Icon icon={Quote} class="size-4" />
		</span>
		<span class="font-heading text-base font-semibold text-foreground">Perpustakaan</span>
	</div>

	<div class="mt-5 grid max-w-[17rem] gap-1.5">
		<p class="text-[15px] font-semibold text-balance text-foreground">
			{isProject ? 'Belum ada referensi di proyek ini' : 'Kumpulkan paper-mu di sini'}
		</p>
		<p class="text-[13px] leading-relaxed font-medium text-pretty text-muted-foreground">
			{isProject
				? 'Tautkan referensi dari perpustakaan atau tambahkan yang baru untuk proyek ini.'
				: 'Simpan DOI, file bibliografi, atau entri manual untuk mulai membangun perpustakaan risetmu.'}
		</p>
	</div>

	<div
		aria-hidden="true"
		class="my-6 h-14 w-px bg-gradient-to-b from-transparent via-border to-transparent"
	></div>

	<div class="flex flex-col items-center gap-2">
		{#if isProject}
			<Button type="button" class="rounded-full px-4" onclick={onAddFromLibrary}>
				<Icon icon={FolderIcon} class="size-4" />
				Tambah dari Perpustakaan
			</Button>
			<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onUploadPdf}>
				<Icon icon={UploadIcon} class="size-4" />
				Unggah PDF
			</Button>
			<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onImportFile}>
				<Icon icon={FileTextIcon} class="size-4" />
				Import
			</Button>
			<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onAddByDoi}>
				<Icon icon={LinkIcon} class="size-4" />
				DOI
			</Button>
			<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onAddManual}>
				<Icon icon={PenLineIcon} class="size-4" />
				Manual
			</Button>
		{:else}
			<Button type="button" class="rounded-full px-4" onclick={onUploadPdf}>
				<Icon icon={UploadIcon} class="size-4" />
				Unggah PDF
			</Button>
			<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onImportFile}>
				<Icon icon={FileTextIcon} class="size-4" />
				Import
			</Button>
			<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onAddByDoi}>
				<Icon icon={LinkIcon} class="size-4" />
				DOI
			</Button>
			<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onAddManual}>
				<Icon icon={PenLineIcon} class="size-4" />
				Manual
			</Button>
		{/if}
	</div>

	<p class="mt-8 max-w-[19rem] text-[12px] font-medium text-muted-foreground/80">
		<Icon icon={FileTextIcon} class="mr-1 inline size-3 align-[-1px]" />
		Hubungkan Mendeley atau Zotero di
		<a
			href={integrationsHref}
			class="font-semibold text-foreground underline-offset-2 hover:underline"
		>
			Pengaturan → Integrasi
		</a>
	</p>
</div>
