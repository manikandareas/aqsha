<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Textarea } from '@aqsha/ui-svelte/components/textarea';

	/**
	 * Dialog konfirmasi setelah seleksi teks di preview: catatan opsional sebelum anotasi disimpan.
	 * `open` dikontrol halaman; menutup lewat Escape/backdrop = batal (draft dibuang).
	 */
	let {
		open,
		excerpt,
		onSubmit,
		onCancel
	}: {
		open: boolean;
		excerpt: string | null;
		onSubmit: (note: string) => void;
		onCancel: () => void;
	} = $props();

	let note = $state('');

	// Catatan direset tiap dialog dibuka untuk draft baru.
	$effect(() => {
		if (open) note = '';
	});
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) onCancel();
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Tandai teks</Dialog.Title>
			<Dialog.Description>
				Tambahkan catatan opsional. Anotasi tersimpan di dokumen dan bisa dikirim ke Astra nanti.
			</Dialog.Description>
		</Dialog.Header>
		{#if excerpt}
			<p
				class="line-clamp-3 rounded-md border-2 border-border bg-muted/40 px-3 py-2 text-label text-muted-foreground"
			>
				“{excerpt}”
			</p>
		{/if}
		<Textarea
			bind:value={note}
			rows={3}
			placeholder="Catatan (opsional) — mis. perjelas alasannya"
		/>
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={onCancel}>Batal</Button>
			<Button type="button" onclick={() => onSubmit(note.trim())}>Simpan anotasi</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
