<script lang="ts">
	import { onDestroy } from 'svelte';
	import { mode } from 'mode-watcher';
	import { EditorState, Compartment, type Extension } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import {
		latexEditorExtensions,
		themeReconfigureEffect,
		editableReconfigureEffect,
		ExternalSync,
		type LatexEditorHandle
	} from '../lib/latex-editor';

	/**
	 * Editor sumber LaTeX bab (CodeMirror 6). Buffer = source-of-truth: `value` HANYA dipakai
	 * untuk seed awal dan reset saat `docKey` berganti (ganti bab / versi termuat baru), bukan
	 * disinkron tiap keystroke. `onChange` melapor edit user (reset programatik disaring).
	 */
	let {
		value,
		docKey,
		editable = true,
		onChange,
		onReady
	}: {
		value: string;
		docKey: string;
		editable?: boolean;
		onChange: (next: string) => void;
		onReady?: (handle: LatexEditorHandle) => void;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let view: EditorView | null = null;
	const editableCompartment = new Compartment();
	const themeCompartment = new Compartment();
	const isDark = $derived(mode.current === 'dark');

	function handleOf(v: EditorView): LatexEditorHandle {
		return {
			setDoc(next) {
				if (next === v.state.doc.toString()) return;
				v.dispatch({
					changes: { from: 0, to: v.state.doc.length, insert: next },
					annotations: ExternalSync.of(true)
				});
			},
			scrollToLine(line) {
				const total = v.state.doc.lines;
				const clamped = Math.min(Math.max(1, Math.round(line)), total);
				const pos = v.state.doc.line(clamped).from;
				v.dispatch({
					selection: { anchor: pos },
					effects: EditorView.scrollIntoView(pos, { y: 'center' })
				});
				v.focus();
			},
			getCursorLine() {
				return v.state.doc.lineAt(v.state.selection.main.head).number;
			},
			focus() {
				v.focus();
			},
			destroy() {
				v.destroy();
			}
		};
	}

	// Mount sekali saat host siap.
	$effect(() => {
		const parent = host;
		if (!parent || view) return;
		const extensions: Extension[] = latexEditorExtensions({
			editable,
			dark: isDark,
			onChange,
			editableCompartment,
			themeCompartment
		});
		view = new EditorView({ parent, state: EditorState.create({ doc: value, extensions }) });
		onReady?.(handleOf(view));
	});

	// Reset buffer HANYA saat docKey berganti (bukan tiap perubahan value).
	let mountedKey = $state<string | null>(null);
	$effect(() => {
		const key = docKey;
		if (!view) return;
		if (mountedKey === null) {
			mountedKey = key;
			return;
		}
		if (key !== mountedKey) {
			mountedKey = key;
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value },
				annotations: ExternalSync.of(true)
			});
		}
	});

	// Reconfigure gelap/terang + editable tanpa membangun ulang state.
	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: themeReconfigureEffect(themeCompartment, isDark) });
	});
	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: editableReconfigureEffect(editableCompartment, editable) });
	});

	onDestroy(() => {
		view?.destroy();
		view = null;
	});
</script>

<div bind:this={host} class="h-full min-h-0 overflow-hidden bg-card"></div>
