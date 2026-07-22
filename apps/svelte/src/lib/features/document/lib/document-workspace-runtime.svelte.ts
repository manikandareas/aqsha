import { browser } from '$app/environment';
import { type Component } from 'svelte';
import type { TypstProject } from '@vedivad/codemirror-typst';
import { readableApiErrorMessage } from '$lib/errors/api-error';
import { AutosaveController } from '$lib/features/document/lib/autosave-controller.svelte';
import {
	parseDocumentOutline,
	type DocumentOutlineEntry
} from '$lib/features/document/lib/outline';
import type { AnnotationDraft } from '$lib/features/document/lib/annotation-selection';
import type { SaveWorkspaceDocumentResult } from '$lib/features/document/api';
import type { Cm6Diagnostic } from '$lib/features/document/typst/diagnostics';
import type {
	DocumentTypstEngine,
	VedivadDocumentTypstEngine
} from '$lib/features/document/typst/document-typst-engine';

type EditorHandle = { applyUserEdit(next: string): void; scrollToLine(line: number): void };
type PreviewHandle = { scrollToHeading(title: string): void };
type EditorComponent = Component<
	{
		value: string;
		docKey: string;
		editable?: boolean;
		diagnostics?: Cm6Diagnostic[];
		mainFilePath?: string;
		project: TypstProject | null;
		onChange: (next: string) => void;
	},
	EditorHandle
>;
type PreviewComponent = Component<
	{
		svg: string | null;
		annotations?: Array<{
			id: string;
			page: number;
			rects: AnnotationDraft['rects'];
			status: string;
		}>;
		activeAnnotationId?: string | null;
		selectedAnnotationIds?: ReadonlySet<string>;
		outlineTitles?: string[];
		onCreateAnnotation?: (draft: AnnotationDraft, note: string, elementLabel: string) => void;
		onSelectAnnotation?: (id: string) => void;
		onActiveHeading?: (index: number) => void;
		proposalHunkCount?: number;
		onReviewProposal?: () => void;
		annotationMode?: boolean;
	},
	PreviewHandle
>;

type DocumentSeed = { source: string; contentVersion: number };

/**
 * Owns Typst module load, client lifecycle, editor buffer, autosave, and preview SVG/diagnostics.
 * The project page keeps layout/activation/annotations and only wires reactive inputs.
 */
export class DocumentWorkspaceRuntime {
	source = $state('');
	autosave = $state<AutosaveController | null>(null);
	reloadNonce = $state(0);
	Editor = $state<EditorComponent | null>(null);
	Preview = $state<PreviewComponent | null>(null);
	loadError = $state<string | null>(null);
	previewSvg = $state<string | null>(null);
	previewError = $state<string | null>(null);
	diagnostics = $state<Cm6Diagnostic[]>([]);
	typstProject = $state<TypstProject | null>(null);

	#engineFactory = $state<typeof VedivadDocumentTypstEngine | null>(null);
	#engine: DocumentTypstEngine | null = null;
	#moduleLoadPromise: Promise<void> | null = null;
	#workspaceId: () => string;
	#mainTypFilename: () => string;
	#save: (input: { source: string; baseVersion: number }) => Promise<SaveWorkspaceDocumentResult>;
	/** Bib terakhir dari pushSource — di-flush saat engine selesai mount (race SSR-first). */
	#lastBib = '';

	constructor(opts: {
		workspaceId: () => string;
		/** Basename berkas utama (mis. `skripsi.typ`), di-derive dari workspace.kind. */
		mainTypFilename: () => string;
		save: (input: { source: string; baseVersion: number }) => Promise<SaveWorkspaceDocumentResult>;
	}) {
		this.#workspaceId = opts.workspaceId;
		this.#mainTypFilename = opts.mainTypFilename;
		this.#save = opts.save;
	}

	// $derived.by (bukan template inline) — getter baru terisi di constructor.
	mainFilePath = $derived.by(() => `/${this.#mainTypFilename()}`);
	docKey = $derived.by(
		() => `${this.#workspaceId()}:${this.reloadNonce}:${this.#mainTypFilename()}`
	);
	outline = $derived(parseDocumentOutline(this.source));
	editable = $derived(this.autosave?.status !== 'stale');
	saveStatusLabel = $derived.by(() => {
		switch (this.autosave?.status) {
			case 'saving':
				return 'Menyimpan…';
			case 'saved':
				return 'Tersimpan';
			case 'dirty':
				return 'Belum disimpan';
			case 'stale':
				return 'Berubah di tempat lain';
			case 'error':
				return 'Gagal menyimpan';
			default:
				return '';
		}
	});

	preloadModules(): void {
		void this.loadModules();
	}

	loadModules(): Promise<void> {
		if (this.#moduleLoadPromise) return this.#moduleLoadPromise;
		this.loadError = null;
		this.#moduleLoadPromise = Promise.all([
			import('$lib/features/document/components/TypstSourceEditor.svelte'),
			import('$lib/features/document/components/TypstPreview.svelte'),
			import('$lib/features/document/typst/document-typst-engine')
		])
			.then(([editorModule, previewModule, clientModule]) => {
				this.Editor = editorModule.default;
				this.Preview = previewModule.default;
				this.#engineFactory = clientModule.VedivadDocumentTypstEngine;
			})
			.catch((error: unknown) => {
				this.#moduleLoadPromise = null;
				this.loadError = readableApiErrorMessage(error, 'Runtime dokumen gagal dimuat.');
			});
		return this.#moduleLoadPromise;
	}

	seedIfNeeded(doc: DocumentSeed | null | undefined, isSuccess: boolean): void {
		if (!isSuccess || this.autosave || !doc) return;
		this.source = doc.source ?? '';
		this.autosave = new AutosaveController({
			initialVersion: doc.contentVersion ?? 0,
			save: (input) => this.#save(input)
		});
	}

	/** Mount satu TypstProject untuk preview, diagnostics, dan editor intelligence. */
	mountEngine(active: boolean, docReady: boolean): (() => void) | undefined {
		const Engine = this.#engineFactory;
		if (!browser || !active || !docReady || !Engine) return;
		let cancelled = false;
		let mounted: DocumentTypstEngine | null = null;
		void Engine.create({ mainFilePath: this.mainFilePath })
			.then((engine) => {
				if (cancelled) {
					engine.dispose();
					return;
				}
				mounted = engine;
				this.#engine = engine;
				this.typstProject = engine.project;
				engine.onCompiled((result) => {
					if (result.svg) {
						this.previewSvg = result.svg;
						this.previewError = null;
					} else if (!this.previewSvg) {
						this.previewError = 'Preview belum dapat disusun. Periksa diagnostik dokumen.';
					}
					this.diagnostics = result.diagnostics;
				});
				engine.onError(() => {
					this.previewError = 'Runtime preview gagal. Coba muat ulang preview.';
				});
				// pushSource sering jalan sebelum create() selesai — flush buffer sekarang.
				this.previewError = null;
				void engine.update(this.source, this.#lastBib, this.mainFilePath);
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					this.loadError = readableApiErrorMessage(error, 'Runtime dokumen gagal dimuat.');
				}
			});
		return () => {
			cancelled = true;
			mounted?.dispose();
			if (this.#engine === mounted) {
				this.#engine = null;
				this.typstProject = null;
			}
		};
	}

	pushSource(bib: string): void {
		this.#lastBib = bib;
		const engine = this.#engine;
		if (!engine) return;
		this.previewError = null;
		void engine.update(this.source, bib, this.mainFilePath);
	}

	onEditorChange(next: string): void {
		this.source = next;
		this.autosave?.edit(next);
	}

	applyTransform(next: string, editor: EditorHandle | null): void {
		if (editor) editor.applyUserEdit(next);
		else {
			this.source = next;
			this.autosave?.edit(next);
		}
	}

	navigateOutline(
		entry: DocumentOutlineEntry,
		editor: EditorHandle | null,
		preview: PreviewHandle | null
	): void {
		preview?.scrollToHeading(entry.title);
		editor?.scrollToLine(entry.sourceLine);
	}

	applyServerDocument(doc: DocumentSeed): void {
		this.source = doc.source;
		this.autosave?.reset(doc.contentVersion);
		this.reloadNonce += 1;
	}

	async retryModules(
		refetchDocument: () => Promise<unknown>,
		refetchBib: () => Promise<unknown>
	): Promise<void> {
		this.loadError = null;
		this.#moduleLoadPromise = null;
		await Promise.all([this.loadModules(), refetchDocument(), refetchBib()]);
	}

	retryPreview(bib: string, fallback: () => Promise<void>): void {
		this.previewError = null;
		if (this.#engine) {
			void this.#engine.update(this.source, bib, this.mainFilePath);
			return;
		}
		void fallback();
	}

	async flushAndDispose(): Promise<void> {
		const controller = this.autosave;
		if (controller) await controller.flush().finally(() => controller.dispose());
	}
}
