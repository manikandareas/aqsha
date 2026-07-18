<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors/api-error';
	import SectionPdfViewer from '$lib/features/sections/components/SectionPdfViewer.svelte';
	import { useWorkspaceBuild, useCompileWorkspace } from '$lib/features/sections/api';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';

	/**
	 * Pratinjau dokumen penuh: PDF hasil compile seluruh bab + daftar pustaka, tanpa anotasi.
	 * Compile full lebih mahal dari per-bab, jadi TIDAK auto-compile — user memicu eksplisit.
	 */
	let { projectId }: { projectId: string } = $props();

	const workspace = useWorkspace(() => projectId);
	const sections = useSections(() => projectId);
	const build = useWorkspaceBuild(() => projectId);
	const compile = useCompileWorkspace(() => projectId);

	// Heuristik basi indikatif: build lebih tua dari perubahan bab terbaru. Cukup untuk
	// pratinjau — bukan pemetaan versi per-bab seperti di halaman bab.
	const maybeStale = $derived.by(() => {
		const b = build.data;
		const secs = sections.data;
		if (!b || !secs || secs.length === 0) return false;
		return b.builtAt < Math.max(...secs.map((s) => s.updatedAt));
	});

	function compileFull(): void {
		compile.mutate(undefined, {
			onSuccess: (res) => {
				if (res.status === 'error') {
					toast.warning(
						'Dokumen tersusun dengan galat compile. Menampilkan versi terakhir yang berhasil.'
					);
				}
			},
			onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menyusun dokumen.'))
		});
	}
</script>

<PageTitle title="Pratinjau dokumen" />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<header class="flex shrink-0 flex-wrap items-center gap-3 border-b-2 border-border px-4 py-3">
		<Button
			href={resolve('/app/(product)/projects/[projectId]', { projectId })}
			variant="ghost"
			size="icon"
			aria-label="Kembali ke proyek"
		>
			<Icon icon={ArrowLeftIcon} class="size-4" />
		</Button>
		<div class="min-w-0 flex-1">
			<h1 class="truncate font-heading text-xl font-bold">Pratinjau dokumen</h1>
			<p class="truncate text-label text-muted-foreground">
				{workspace.data ? projectDisplayTitle(workspace.data) : ''}
			</p>
		</div>
		{#if maybeStale}
			<Badge variant="outline">mungkin belum termutakhir</Badge>
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
			Compile dokumen penuh
		</Button>
	</header>

	{#if build.isPending}
		<div class="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Memuat pratinjau…</span>
		</div>
	{:else if build.data?.pdfUrl}
		<SectionPdfViewer url={build.data.pdfUrl} annotatable={false} />
	{:else}
		<div class="flex min-h-0 flex-1 items-center justify-center p-4">
			<div
				class="flex max-w-sm flex-col items-center gap-3 rounded-lg border-2 border-border bg-card p-8 text-center"
			>
				<p class="text-sm font-medium text-foreground">Dokumen penuh belum pernah disusun.</p>
				<p class="text-label text-muted-foreground">
					Compile untuk menggabungkan semua bab dan daftar pustaka jadi satu PDF.
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
