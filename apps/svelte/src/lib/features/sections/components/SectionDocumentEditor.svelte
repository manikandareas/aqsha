<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { toast } from 'svelte-sonner';
	import {
		generateStructuredContentId,
		mountSectionEditor,
		type SectionEditorHandle
	} from '../superdoc-client';

	/** Frame SuperDoc: mount async client-only, destroy saat unmount. Logika save/citation milik pemanggil via `onHandle`. */
	let {
		documentUrl,
		fileName,
		onHandle,
		onUpdate
	}: {
		documentUrl: string | null;
		fileName: string;
		onHandle: (h: SectionEditorHandle) => void;
		onUpdate: () => void;
	} = $props();

	let handle = $state<SectionEditorHandle | null>(null);
	let mountError = $state<string | null>(null);
	let ready = $state(false);
	let toolbarEl = $state<HTMLElement | null>(null);

	// DEV-only: file lokal (uji template kampus) menimpa `documentUrl` sampai file lain dipilih.
	let devDocumentUrl = $state<string | null>(null);
	const activeDocumentUrl = $derived(devDocumentUrl ?? documentUrl);

	function devLoadFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		mountError = null;
		devDocumentUrl = URL.createObjectURL(file);
	}

	// Sisip sitasi uji, ekspor, lalu muat hasil ekspor ke instance probe tersembunyi untuk
	// memastikan atribut SDT (id + alias) selamat lewat siklus DOCX penuh. `probe`/`probeReady`
	// ditampung terpisah karena `onReady` bisa menembak sebelum `mountSectionEditor` resolve.
	async function devRoundTrip() {
		if (!handle) return;
		const nodeId = generateStructuredContentId();
		handle.insertCitation(nodeId, { citationIds: ['dev-citation'] }, '(Uji, 2026)');
		const blob = await handle.exportDocx();

		const probeEl = document.createElement('div');
		probeEl.style.display = 'none';
		document.body.appendChild(probeEl);

		let probe: SectionEditorHandle | null = null;
		let probeReady = false;

		function checkRoundTrip() {
			if (!probe || !probeReady) return;
			const found = probe.listCitations().some((c) => c.nodeId === nodeId);
			toast[found ? 'success' : 'error'](
				found ? 'Round-trip SDT utuh' : 'Round-trip SDT GAGAL — attrs hilang'
			);
			probe.destroy();
			probeEl.remove();
		}

		probe = await mountSectionEditor({
			editorEl: probeEl,
			toolbarEl: null,
			documentUrl: URL.createObjectURL(blob),
			fileName: 'roundtrip.docx',
			onReady: () => {
				probeReady = true;
				checkRoundTrip();
			},
			onUpdate: () => {}
		});
		checkRoundTrip();
	}

	function attachEditor(el: HTMLElement) {
		// Read the reactive dep synchronously so this attachment re-runs (tearing down the old
		// SuperDoc instance first) whenever the dev file picker swaps in a new document.
		const url = activeDocumentUrl;
		let disposed = false;
		ready = false;
		void mountSectionEditor({
			editorEl: el,
			toolbarEl,
			documentUrl: url,
			fileName,
			onReady: () => {
				if (disposed) return;
				ready = true;
			},
			onUpdate
		})
			.then((h) => {
				if (disposed) {
					h.destroy();
					return;
				}
				handle = h;
				onHandle(h);
			})
			.catch((err: unknown) => {
				mountError = err instanceof Error ? err.message : 'Editor gagal dimuat.';
			});
		return () => {
			disposed = true;
			handle?.destroy();
			handle = null;
		};
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	{#if dev}
		<div class="flex items-center gap-2 border-b border-border px-3 py-1.5 text-label">
			<input type="file" accept=".docx" onchange={devLoadFile} aria-label="Muat DOCX uji" />
			<Button type="button" variant="outline" size="sm" onclick={devRoundTrip} disabled={!ready}>
				Uji round-trip SDT
			</Button>
		</div>
	{/if}
	<div bind:this={toolbarEl} class="shrink-0 border-b-2 border-border"></div>
	{#if mountError}
		<p class="p-6 text-sm text-destructive">{mountError}</p>
	{:else if browser}
		<div class="min-h-0 flex-1 overflow-y-auto bg-muted/30" {@attach attachEditor}></div>
	{/if}
</div>
