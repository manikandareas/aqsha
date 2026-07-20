import { browser } from '$app/environment';
import { type Component } from 'svelte';
import { readableApiErrorMessage } from '$lib/errors/api-error';
import { AutosaveController } from '$lib/features/document/lib/autosave-controller.svelte';
import {
	parseDocumentOutline,
	type DocumentOutlineEntry
} from '$lib/features/document/lib/outline';
import type { AnnotationDraft } from '$lib/features/document/lib/annotation-selection';
import type { SaveWorkspaceDocumentResult } from '$lib/features/document/api';
import type { TypstClient } from '$lib/features/document/typst/client';
import type { Cm6Diagnostic } from '$lib/features/document/typst/diagnostics';

type EditorHandle = { applyUserEdit(next: string): void; scrollToLine(line: number): void };
type PreviewHandle = { scrollToHeading(title: string): void };
type EditorComponent = Component<
	{
		value: string;
		docKey: string;
		editable?: boolean;
		diagnostics?: Cm6Diagnostic[];
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
		outlineTitles?: string[];
		onAnnotate?: (draft: AnnotationDraft) => void;
		onSelectAnnotation?: (id: string) => void;
		onActiveHeading?: (index: number) => void;
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

	#clientCtor = $state<(new () => TypstClient) | null>(null);
	#client = $state<TypstClient | null>(null);
	#moduleLoadPromise: Promise<void> | null = null;
	#workspaceId: () => string;
	#save: (input: {
		source: string;
		baseVersion: number;
	}) => Promise<SaveWorkspaceDocumentResult>;

	constructor(opts: {
		workspaceId: () => string;
		save: (input: {
			source: string;
			baseVersion: number;
		}) => Promise<SaveWorkspaceDocumentResult>;
	}) {
		this.#workspaceId = opts.workspaceId;
		this.#save = opts.save;
	}

	// $derived.by (bukan template inline) — #workspaceId baru terisi di constructor.
	docKey = $derived.by(() => `${this.#workspaceId()}:${this.reloadNonce}`);
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
			import('$lib/features/document/typst/client')
		])
			.then(([editorModule, previewModule, clientModule]) => {
				this.Editor = editorModule.default;
				this.Preview = previewModule.default;
				this.#clientCtor = clientModule.TypstClient;
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

	/** Mount the Typst worker client. Call from `$effect`; return value is the disposer. */
	mountClient(active: boolean, docReady: boolean): (() => void) | undefined {
		const Client = this.#clientCtor;
		if (!browser || !active || !docReady || !Client) return;
		const client = new Client();
		client.onCompiled((r) => {
			if (r.svg) {
				this.previewSvg = r.svg;
				this.previewError = null;
			} else if (!this.previewSvg) {
				this.previewError = 'Preview belum dapat disusun. Periksa diagnostik dokumen.';
			}
			this.diagnostics = r.diagnostics;
		});
		client.onError((message) => {
			console.error('[typst-worker] gagal menyusun preview', message);
			this.previewError = 'Runtime preview gagal. Coba muat ulang preview.';
		});
		this.#client = client;
		return () => {
			client.dispose();
			this.#client = null;
		};
	}

	pushSource(bib: string): void {
		const client = this.#client;
		if (!client) return;
		this.previewError = null;
		client.update(this.source, bib);
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
		if (this.#client) {
			this.#client.update(this.source, bib);
			return;
		}
		void fallback();
	}

	async flushAndDispose(): Promise<void> {
		const controller = this.autosave;
		if (controller) await controller.flush().finally(() => controller.dispose());
	}
}
