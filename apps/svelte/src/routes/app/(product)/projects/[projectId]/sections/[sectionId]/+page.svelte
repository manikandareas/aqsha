<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { PageTitle } from '$lib/seo';
	import { Spinner } from '$lib/components/ui/spinner';
	import SectionDocumentEditor from '$lib/features/sections/components/SectionDocumentEditor.svelte';
	import { useSections } from '$lib/features/workspaces/api';
	import { SECTION_STATUS_LABELS } from '$lib/features/workspaces/labels';

	const projectId = $derived(page.params.projectId!);
	const sectionId = $derived(page.params.sectionId!);
	const sections = useSections(() => projectId);
	const section = $derived(sections.data?.find((s) => s.id === sectionId) ?? null);
</script>

<PageTitle title={section?.title ?? 'Bab'} />

<div
	class="mx-auto flex h-svh min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden px-6 py-8"
>
	{#if sections.isPending}
		<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Memuat bab…</span>
		</div>
	{:else if !section}
		<p class="text-muted-foreground">Bab tidak ditemukan.</p>
	{:else}
		<div class="flex shrink-0 items-center gap-2">
			<h1 class="font-heading text-2xl font-bold">{section.title}</h1>
			{#if section.role === 'bibliography'}
				<Badge variant="outline">otomatis</Badge>
			{:else}
				<Badge variant="secondary">{SECTION_STATUS_LABELS[section.status]}</Badge>
			{/if}
		</div>
		{#if section.role === 'bibliography'}
			<div
				class="rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground"
			>
				<p>
					Daftar pustaka digenerate otomatis dari sitasi yang terpakai di bab-bab — hadir bersama
					editor.
				</p>
			</div>
		{:else}
			<div class="flex min-h-0 flex-1 flex-col rounded-lg border-2 border-border bg-card">
				<SectionDocumentEditor
					documentUrl={null}
					fileName={`${section.title}.docx`}
					onHandle={() => {}}
					onUpdate={() => {}}
				/>
			</div>
		{/if}
		<Button
			href={resolve('/app/(product)/projects/[projectId]', { projectId })}
			variant="outline"
			class="w-fit shrink-0"
		>
			Kembali ke proyek
		</Button>
	{/if}
</div>
