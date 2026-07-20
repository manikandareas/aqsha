<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { mode } from 'mode-watcher';
	import { Icon, Loader2Icon } from '$lib/icons';
	import type { Cm6Diagnostic } from '../typst/diagnostics';
	import type { TypstEditorHandle } from '../lib/typst-editor';

	/**
	 * Editor sumber Typst (CodeMirror 6 + engine bahasa vedivad: highlight/autocomplete/hover).
	 * Buffer = source-of-truth: `value` HANYA untuk seed awal + reset saat `docKey` berganti (proposal
	 * diterima / versi termuat baru), bukan disinkron tiap keystroke. Diagnostik lint berasal dari
	 * worker preview (@myriaddreamin), didorong via `diagnostics`. Engine dimuat asinkron di browser.
	 */
	let {
		value,
		docKey,
		editable = true,
		diagnostics = [],
		onChange
	}: {
		value: string;
		docKey: string;
		editable?: boolean;
		diagnostics?: Cm6Diagnostic[];
		onChange: (next: string) => void;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let handle = $state<TypstEditorHandle | null>(null);
	let mountedKey = $state<string | null>(null);
	const isDark = $derived(mode.current === 'dark');

	// Mount sekali saat host siap. Nilai prop dibaca di dalam closure asinkron (setelah await) →
	// tidak dilacak sebagai dependency, jadi efek hanya bergantung pada `host` (tak remount saat mengetik).
	$effect(() => {
		if (!browser || !host) return;
		const parent = host;
		let disposed = false;
		let local: TypstEditorHandle | null = null;
		void (async () => {
			const { mountTypstEditor } = await import('../lib/typst-editor');
			if (disposed) return;
			local = await mountTypstEditor(parent, {
				doc: value,
				editable,
				dark: isDark,
				onChange
			});
			if (disposed) {
				local.destroy();
				return;
			}
			local.setDiagnostics(diagnostics);
			mountedKey = docKey;
			handle = local;
		})();
		return () => {
			disposed = true;
			local?.destroy();
			handle = null;
			mountedKey = null;
		};
	});

	// Reset buffer HANYA saat docKey berganti (bukan tiap perubahan value).
	$effect(() => {
		const key = docKey;
		if (!handle) return;
		if (mountedKey === null) {
			mountedKey = key;
			return;
		}
		if (key !== mountedKey) {
			mountedKey = key;
			handle.setDoc(untrack(() => value));
		}
	});

	$effect(() => {
		const d = diagnostics;
		handle?.setDiagnostics(d);
	});
	$effect(() => {
		const dark = isDark;
		handle?.setDark(dark);
	});
	$effect(() => {
		const e = editable;
		handle?.setEditable(e);
	});

	export function scrollToLine(line: number): void {
		handle?.scrollToLine(line);
	}
	/** Terapkan sumber baru sebagai edit user (memicu autosave + recompile) — dipakai manajemen bab TOC. */
	export function applyUserEdit(next: string): void {
		handle?.applyUserEdit(next);
	}
	export function focus(): void {
		handle?.focus();
	}
</script>

<div class="relative h-full min-h-0 overflow-hidden bg-card">
	<div bind:this={host} class="h-full min-h-0"></div>
	{#if browser && !handle}
		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
		>
			<Icon icon={Loader2Icon} class="size-4 animate-spin" /> Menyiapkan editor…
		</div>
	{/if}
</div>
