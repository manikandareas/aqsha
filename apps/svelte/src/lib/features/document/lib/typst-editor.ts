import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { setDiagnostics as setLintDiagnostics, type Diagnostic as LintDiagnostic } from '@codemirror/lint';
import {
	TypstProject,
	createTypstSetup,
	defaultDarkTheme,
	defaultLightTheme,
	typstFilePath,
	typstThemes
} from '@vedivad/codemirror-typst';
import type { Cm6Diagnostic } from '../typst/diagnostics';

// Menandai transaksi reset non-user (setDoc programatik saat proposal diterima / muat ulang versi)
// supaya updateListener tidak melaporkannya sebagai edit user → autosave tak ikut terpicu.
export const ExternalSync = Annotation.define<boolean>();

/**
 * Engine bahasa Typst untuk editor (highlight/autocomplete/hover) dari @vedivad/codemirror-typst,
 * terpisah dari worker preview @myriaddreamin. Singleton modul: satu worker+WASM, reuse lintas mount
 * + tahan HMR. `null` = engine gagal dimuat → editor jatuh ke mode polos (tetap bisa mengetik).
 */
let projectPromise: Promise<TypstProject | null> | null = null;
function getTypstProject(): Promise<TypstProject | null> {
	if (!projectPromise) {
		projectPromise = TypstProject.create().catch((err) => {
			console.error('[typst-editor] gagal memuat engine bahasa; editor mode polos', err);
			return null;
		});
	}
	return projectPromise;
}

function chromeTheme(dark: boolean): Extension {
	return EditorView.theme(
		{
			'&': { fontSize: '13px', height: '100%', backgroundColor: 'transparent' },
			'.cm-scroller': {
				fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
				lineHeight: '1.6'
			},
			'.cm-content': { padding: '12px 0' },
			'.cm-gutters': { backgroundColor: 'transparent', border: 'none' }
		},
		{ dark }
	);
}

function toLintDiagnostics(diags: Cm6Diagnostic[]): LintDiagnostic[] {
	return diags.map((d) => ({
		from: d.from,
		to: d.to,
		severity: d.severity,
		message: d.message,
		source: 'typst'
	}));
}

export type TypstEditorHandle = {
	setDoc(next: string): void;
	applyUserEdit(next: string): void;
	setDiagnostics(diags: Cm6Diagnostic[]): void;
	scrollToLine(line: number): void;
	setEditable(editable: boolean): void;
	setDark(dark: boolean): void;
	focus(): void;
	destroy(): void;
};

export async function mountTypstEditor(
	parent: HTMLElement,
	opts: {
		doc: string;
		editable: boolean;
		dark: boolean;
		onChange: (value: string) => void;
		/** Path virtual utama, mis. `/skripsi.typ`. */
		mainFilePath?: string;
	}
): Promise<TypstEditorHandle> {
	const project = await getTypstProject();
	const editableCompartment = new Compartment();
	// Bila engine tak tersedia, pakai compartment tema sendiri (mode polos) — jika ada, tema ikut
	// bundle vedivad (chrome + token) dan berpindah via themes.set.
	const themes = project
		? typstThemes(
				{
					light: { editor: chromeTheme(false), tokens: defaultLightTheme },
					dark: { editor: chromeTheme(true), tokens: defaultDarkTheme }
				},
				opts.dark ? 'dark' : 'light'
			)
		: null;
	const plainThemeCompartment = new Compartment();

	const languageExtensions: Extension[] = project
		? createTypstSetup({ project, sync: 'external', theme: themes!.extension })
		: [plainThemeCompartment.of(chromeTheme(opts.dark))];

	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc: opts.doc,
			extensions: [
				basicSetup,
				...languageExtensions,
				typstFilePath.of(opts.mainFilePath ?? '/main.typ'),
				keymap.of([indentWithTab]),
				EditorView.lineWrapping,
				editableCompartment.of(EditorState.readOnly.of(!opts.editable)),
				EditorView.updateListener.of((u) => {
					if (!u.docChanged) return;
					// Lewati reset programatik — hanya edit user yang jadi sinyal autosave.
					if (u.transactions.some((t) => t.annotation(ExternalSync))) return;
					opts.onChange(u.state.doc.toString());
				})
			]
		})
	});

	return {
		setDoc(next) {
			if (next === view.state.doc.toString()) return;
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: next },
				annotations: ExternalSync.of(true)
			});
		},
		applyUserEdit(next) {
			// Tanpa ExternalSync → dilaporkan sebagai edit user (memicu autosave + recompile). Dipakai
			// manajemen bab lewat TOC: hasil transformasi teks diterapkan sebagai satu edit.
			if (next === view.state.doc.toString()) return;
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
		},
		setDiagnostics(diags) {
			view.dispatch(setLintDiagnostics(view.state, toLintDiagnostics(diags)));
		},
		scrollToLine(line) {
			const total = view.state.doc.lines;
			const clamped = Math.min(Math.max(1, Math.round(line)), total);
			const pos = view.state.doc.line(clamped).from;
			view.dispatch({
				selection: { anchor: pos },
				effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 24 })
			});
			view.focus();
		},
		setEditable(editable) {
			view.dispatch({
				effects: editableCompartment.reconfigure(EditorState.readOnly.of(!editable))
			});
		},
		setDark(dark) {
			if (themes) themes.set(view, dark ? 'dark' : 'light');
			else view.dispatch({ effects: plainThemeCompartment.reconfigure(chromeTheme(dark)) });
		},
		focus() {
			view.focus();
		},
		destroy() {
			view.destroy();
		}
	};
}
