import {
	TypstProject,
	type CompileResult,
	type Diagnostic,
	type RenderedSvgPage
} from '@vedivad/codemirror-typst';
import type { Cm6Diagnostic } from './diagnostics';

const FONT_URLS = [
	'/fonts/typst/inter-latin-wght-normal.ttf',
	'/fonts/typst/jetbrains-mono-latin-wght-normal.ttf',
	'/fonts/typst/NewCMMath-Regular.otf'
];

export type DocumentTypstCompiledResult = {
	svg: string | null;
	diagnostics: Cm6Diagnostic[];
};

export interface DocumentTypstEngine {
	readonly project: TypstProject;
	onCompiled(callback: (result: DocumentTypstCompiledResult) => void): void;
	onError(callback: (message: string) => void): void;
	update(source: string, bib: string | null, mainFilePath?: string): Promise<void>;
	dispose(): void;
}

function byteOffsetToStringOffset(source: string, byteOffset: number): number {
	const bytes = new TextEncoder().encode(source);
	return new TextDecoder().decode(bytes.slice(0, Math.max(0, byteOffset))).length;
}

function toEditorDiagnostics(
	diagnostics: readonly Diagnostic[],
	source: string,
	mainFilePath: string
): Cm6Diagnostic[] {
	return diagnostics.map((diagnostic) => {
		const location = diagnostic.location;
		const belongsToMain = location?.file === mainFilePath;
		return {
			from: belongsToMain ? byteOffsetToStringOffset(source, location.start) : 0,
			to: belongsToMain ? byteOffsetToStringOffset(source, location.end) : 0,
			severity: diagnostic.severity,
			message: diagnostic.message
		};
	});
}

function previewMarkup(pages: readonly RenderedSvgPage[]): string | null {
	if (pages.length === 0) return null;
	return `<div class="typst-doc">${pages
		.map(
			(page) =>
				`<div class="typst-page" data-page="${page.index + 1}" style="aspect-ratio:${page.width}/${page.height}">${page.svg}</div>`
		)
		.join('')}</div>`;
}

async function loadSelfHostedFonts(project: TypstProject): Promise<void> {
	const fonts = await Promise.all(
		FONT_URLS.map(async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()))
	);
	for (const font of fonts) await project.addFont(font);
}

export class VedivadDocumentTypstEngine implements DocumentTypstEngine {
	readonly project: TypstProject;
	#source = '';
	#mainFilePath: string;
	#version = 0;
	#disposed = false;
	#onCompiled: ((result: DocumentTypstCompiledResult) => void) | null = null;
	#onError: ((message: string) => void) | null = null;
	#unsubscribe: () => void;

	private constructor(project: TypstProject, mainFilePath: string) {
		this.project = project;
		this.#mainFilePath = mainFilePath;
		this.#unsubscribe = project.onCompile((result) => {
			const version = this.#version;
			void this.#publish(result, version);
		});
	}

	static async create(
		options: { mainFilePath?: string; loadFonts?: boolean } = {}
	): Promise<VedivadDocumentTypstEngine> {
		const mainFilePath = options.mainFilePath ?? '/main.typ';
		const project = await TypstProject.create({
			entry: mainFilePath,
			autoCompile: { debounceMs: 300, maxWaitMs: 1500 }
		});
		try {
			if (options.loadFonts !== false) {
				await loadSelfHostedFonts(project);
			}
			return new VedivadDocumentTypstEngine(project, mainFilePath);
		} catch (error) {
			project.destroy();
			throw error;
		}
	}

	onCompiled(callback: (result: DocumentTypstCompiledResult) => void): void {
		this.#onCompiled = callback;
	}

	onError(callback: (message: string) => void): void {
		this.#onError = callback;
	}

	async update(source: string, bib: string | null = '', mainFilePath?: string): Promise<void> {
		if (this.#disposed) return;
		this.#version += 1;
		this.#source = source;
		if (mainFilePath && mainFilePath !== this.#mainFilePath) {
			this.#mainFilePath = mainFilePath;
			this.project.entry = mainFilePath;
		}
		try {
			await this.project.setMany({
				[this.#mainFilePath]: source,
				'/refs.bib': bib ?? ''
			});
		} catch {
			this.#onError?.('Runtime Typst gagal memperbarui dokumen.');
		}
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		this.#version += 1;
		this.#unsubscribe();
		this.project.destroy();
		this.#onCompiled = null;
		this.#onError = null;
	}

	async #publish(result: CompileResult, version: number): Promise<void> {
		try {
			const pages = await this.project.renderedPages(0, result.pages.length);
			if (this.#disposed || version !== this.#version) return;
			this.#onCompiled?.({
				svg: previewMarkup(pages),
				diagnostics: toEditorDiagnostics(result.diagnostics, this.#source, this.#mainFilePath)
			});
		} catch {
			if (!this.#disposed && version === this.#version) {
				this.#onError?.('Runtime Typst gagal merender preview.');
			}
		}
	}
}
