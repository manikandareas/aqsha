<script lang="ts">
	import * as ContextMenu from '@aqsha/ui-svelte/components/context-menu';
	import { FileTextIcon, Icon, LinkIcon, PenLineIcon, UploadIcon } from '$lib/icons';
	import { extractDoiFromText } from '../../clipboard-doi';

	/**
	 * Menu latar grid — bukan seluruh dokumen, supaya klik kanan di header, teks, dan
	 * tautan tetap memberi menu asli browser.
	 */
	let {
		onUploadPdf,
		onAddByDoi,
		onAddManual,
		onImportFile,
		onSelectMany,
		children
	}: {
		onUploadPdf: () => void;
		onAddByDoi: (doi: string | null) => void;
		onAddManual: () => void;
		onImportFile: () => void;
		onSelectMany: () => void;
		children: import('svelte').Snippet;
	} = $props();

	// Clipboard dibaca saat aksi dipilih, bukan saat menu dibuka: izin clipboard tidak
	// seragam antar-browser, dan menu yang isinya berubah tanpa sebab sulit dipahami.
	async function pasteDoi() {
		try {
			const text = await navigator.clipboard.readText();
			onAddByDoi(extractDoiFromText(text));
		} catch {
			onAddByDoi(null);
		}
	}
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="block min-h-full">
		{@render children()}
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-52">
		<ContextMenu.Item onSelect={onUploadPdf}>
			<Icon icon={UploadIcon} class="size-4" />
			Unggah PDF
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => onAddByDoi(null)}>
			<Icon icon={LinkIcon} class="size-4" />
			Tambah dari DOI
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={pasteDoi}>Tempel DOI</ContextMenu.Item>
		<ContextMenu.Item onSelect={onAddManual}>
			<Icon icon={PenLineIcon} class="size-4" />
			Isi manual
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={onImportFile}>
			<Icon icon={FileTextIcon} class="size-4" />
			Import file
		</ContextMenu.Item>
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={onSelectMany}>Pilih beberapa</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
