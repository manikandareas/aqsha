<script lang="ts">
	import { FileTextIcon, Icon, LinkIcon, PenLineIcon, Quote, UploadIcon } from '$lib/icons';
	import { Button } from '$lib/components/ui/button';

	/**
	 * Empty state tab Sitasi — anatomi `WorkspaceLibraryEmpty` (badge pill → title +
	 * deskripsi → hairline connector → stacked pill actions). Footnote koneksi provider
	 * kini tautan ke Settings → Integrasi (Fase 5 live).
	 */
	let {
		onImportFile,
		onAddByDoi,
		onAddManual
	}: {
		onImportFile: () => void;
		onAddByDoi: () => void;
		onAddManual: () => void;
	} = $props();
</script>

<div class="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
	<div
		class="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-background/70 py-2 pl-3.5 pr-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-sm"
	>
		<span
			class="grid size-7 place-items-center rounded-full bg-lavender-soft text-lavender-foreground ring-1 ring-inset ring-lavender-soft-border"
		>
			<Icon icon={Quote} class="size-4" />
		</span>
		<span class="font-heading text-base font-semibold text-foreground">Sitasi</span>
	</div>

	<div class="mt-5 grid max-w-[17rem] gap-1.5">
		<p class="text-[15px] font-semibold text-foreground">Belum ada referensi</p>
		<p class="text-[13px] font-medium leading-relaxed text-muted-foreground">
			Kumpulkan referensi workspace ini untuk dikelola dan diekspor sebagai daftar pustaka.
		</p>
	</div>

	<div
		aria-hidden="true"
		class="my-6 h-14 w-px bg-gradient-to-b from-transparent via-border to-transparent"
	></div>
	<div class="flex flex-col items-center gap-2">
		<Button type="button" class="rounded-full px-4" onclick={onImportFile}>
			<Icon icon={UploadIcon} class="size-4" />
			Import dari Mendeley/Zotero (.bib/.ris)
		</Button>
		<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onAddByDoi}>
			<Icon icon={LinkIcon} class="size-4" />
			Tambah dari DOI
		</Button>
		<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onAddManual}>
			<Icon icon={PenLineIcon} class="size-4" />
			Tambah manual
		</Button>
	</div>

	<p class="mt-8 max-w-[19rem] text-[12px] font-medium text-muted-foreground/80">
		<Icon icon={FileTextIcon} class="mr-1 inline size-3 align-[-1px]" />
		Hubungkan akun Mendeley atau Zotero di
		<a
			href="/app/settings/integrations"
			class="font-semibold text-foreground underline-offset-2 hover:underline"
		>
			Pengaturan → Integrasi
		</a>
	</p>
</div>
