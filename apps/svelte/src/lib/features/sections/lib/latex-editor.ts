import { EditorState, Compartment, Annotation, type Extension } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';

// Menandai transaksi reset non-user (setDoc programatik saat ganti bab / muat ulang versi)
// supaya updateListener tidak melaporkannya sebagai edit user → autosave tidak ikut terpicu.
export const ExternalSync = Annotation.define<boolean>();

function latexTheme(dark: boolean): Extension {
	return EditorView.theme(
		{
			'&': { fontSize: '13px', height: '100%' },
			'.cm-scroller': {
				fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
				lineHeight: '1.6'
			},
			'.cm-content': { padding: '12px 0' }
		},
		{ dark }
	);
}

export function latexEditorExtensions(opts: {
	editable: boolean;
	dark: boolean;
	onChange: (value: string) => void;
	editableCompartment: Compartment;
	themeCompartment: Compartment;
}): Extension[] {
	return [
		basicSetup,
		StreamLanguage.define(stex),
		keymap.of([indentWithTab]),
		EditorView.lineWrapping,
		opts.themeCompartment.of(latexTheme(opts.dark)),
		opts.editableCompartment.of(EditorState.readOnly.of(!opts.editable)),
		EditorView.updateListener.of((u) => {
			if (!u.docChanged) return;
			// Lewati reset programatik — hanya edit user yang jadi sinyal autosave.
			if (u.transactions.some((t) => t.annotation(ExternalSync))) return;
			opts.onChange(u.state.doc.toString());
		})
	];
}

export type LatexEditorHandle = {
	setDoc(next: string): void;
	scrollToLine(line: number): void;
	getCursorLine(): number;
	focus(): void;
	destroy(): void;
};

export function mountLatexEditor(
	parent: HTMLElement,
	opts: { doc: string; editable: boolean; dark: boolean; onChange: (value: string) => void }
): LatexEditorHandle {
	const editableCompartment = new Compartment();
	const themeCompartment = new Compartment();
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc: opts.doc,
			extensions: latexEditorExtensions({
				editable: opts.editable,
				dark: opts.dark,
				onChange: opts.onChange,
				editableCompartment,
				themeCompartment
			})
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
		scrollToLine(line) {
			const total = view.state.doc.lines;
			const clamped = Math.min(Math.max(1, Math.round(line)), total);
			const pos = view.state.doc.line(clamped).from;
			view.dispatch({
				selection: { anchor: pos },
				effects: EditorView.scrollIntoView(pos, { y: 'center' })
			});
			view.focus();
		},
		getCursorLine() {
			return view.state.doc.lineAt(view.state.selection.main.head).number;
		},
		focus() {
			view.focus();
		},
		destroy() {
			view.destroy();
		}
	};
}

// Reconfigure helper theme/editable untuk komponen (dipakai saat mode gelap/terang atau
// editable berubah tanpa membangun ulang state).
export { Compartment };
export function themeReconfigureEffect(themeCompartment: Compartment, dark: boolean) {
	return themeCompartment.reconfigure(latexTheme(dark));
}
export function editableReconfigureEffect(editableCompartment: Compartment, editable: boolean) {
	return editableCompartment.reconfigure(EditorState.readOnly.of(!editable));
}
