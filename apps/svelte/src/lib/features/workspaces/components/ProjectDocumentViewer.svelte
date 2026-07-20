<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { readableApiErrorMessage } from '$lib/errors/api-error';
	import {
		useCompileWorkspace,
		useExportDocx,
		useWorkspaceBuild
	} from '$lib/features/sections/api';
	import SectionPdfViewer from '$lib/features/sections/components/SectionPdfViewer.svelte';
	import { Icon, ArrowLeftIcon, DownloadIcon } from '$lib/icons';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';

	let {
		projectId,
		backHref = null,
		heading = 'Dokumen penuh'
	}: {
		projectId: string;
		backHref?: string | null;
		heading?: string;
	} = $props();

	const workspace = useWorkspace(() => projectId);
	const sections = useSections(() => projectId);
	const build = useWorkspaceBuild(() => projectId);
	const compile = useCompileWorkspace(() => projectId);
	const exportDocx = useExportDocx(() => projectId);

	const maybeStale = $derived.by(() => {
		const currentBuild = build.data;
		const currentSections = sections.data;
		if (!currentBuild || !currentSections || currentSections.length === 0) return false;
		return currentBuild.builtAt < Math.max(...currentSections.map((section) => section.updatedAt));
	});

	function compileFull(): void {
		compile.mutate(undefined, {
			onSuccess: (result) => {
				if (result.status === 'error') {
					toast.warning(
						'Dokumen tersusun dengan galat compile. Menampilkan versi terakhir yang berhasil.'
					);
				}
			},
			onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menyusun dokumen.'))
		});
	}

	function downloadDocx(): void {
		exportDocx.mutate(undefined, {
			onSuccess: (result) => {
				const anchor = window.document.createElement('a');
				anchor.href = result.url;
				anchor.download = '';
				anchor.rel = 'noopener';
				window.document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
			},
			onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal mengekspor DOCX.'))
		});
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
	<header
		class="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b-2 border-border bg-card px-3 py-2"
	>
		{#if backHref}
			<Button href={backHref} variant="ghost" size="icon" aria-label="Kembali ke proyek">
				<Icon icon={ArrowLeftIcon} class="size-4" />
			</Button>
		{/if}
		<div class="min-w-32 flex-1">
			<h1 class="truncate font-heading text-base font-bold">{heading}</h1>
			<p class="truncate text-label text-muted-foreground">
				{workspace.data ? projectDisplayTitle(workspace.data) : 'Memuat proyek…'}
			</p>
		</div>
		{#if maybeStale}
			<Badge variant="outline">Perlu compile ulang</Badge>
		{:else if build.data?.status === 'error'}
			<Badge variant="outline">Compile terakhir bermasalah</Badge>
		{/if}
		<Button
			type="button"
			variant="secondary"
			size="sm"
			disabled={compile.isPending}
			onclick={compileFull}
		>
			{#if compile.isPending}
				<Spinner class="size-4" />
			{/if}
			Compile penuh
		</Button>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			disabled={exportDocx.isPending || !build.data?.pdfUrl}
			onclick={downloadDocx}
		>
			{#if exportDocx.isPending}
				<Spinner class="size-4" />
			{:else}
				<Icon icon={DownloadIcon} class="size-4" />
			{/if}
			DOCX
		</Button>
	</header>

	{#if build.isPending}
		<div class="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Memuat pratinjau…</span>
		</div>
	{:else if build.isError}
		<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
			<p class="text-sm text-muted-foreground">Pratinjau dokumen tidak dapat dimuat.</p>
			<Button type="button" variant="outline" size="sm" onclick={() => build.refetch()}>
				Coba lagi
			</Button>
		</div>
	{:else if build.data?.pdfUrl}
		<SectionPdfViewer url={build.data.pdfUrl} annotatable={false} stale={maybeStale} />
	{:else if compile.data?.status === 'error'}
		<div class="flex min-h-0 flex-1 items-center justify-center p-4">
			<div
				class="grid max-w-md gap-3 rounded-lg border-2 border-border bg-lemon/20 p-6 text-center"
			>
				<p class="font-medium">Dokumen belum berhasil disusun.</p>
				<p class="text-label text-muted-foreground">
					Periksa sumber bab yang bermasalah, lalu compile dokumen penuh lagi.
				</p>
				<Button
					type="button"
					variant="secondary"
					disabled={compile.isPending}
					onclick={compileFull}
				>
					Compile ulang
				</Button>
			</div>
		</div>
	{:else}
		<div class="flex min-h-0 flex-1 items-center justify-center p-4">
			<div
				class="flex max-w-sm flex-col items-center gap-3 rounded-lg border-2 border-border bg-card p-8 text-center"
			>
				<p class="text-sm font-medium text-foreground">Dokumen penuh belum pernah disusun.</p>
				<p class="text-label text-muted-foreground">
					Compile untuk menggabungkan semua bab dan daftar pustaka menjadi satu PDF.
				</p>
				<Button type="button" disabled={compile.isPending} onclick={compileFull}>
					{#if compile.isPending}
						<Spinner class="size-4" />
					{/if}
					Compile dokumen penuh
				</Button>
			</div>
		</div>
	{/if}
</div>
