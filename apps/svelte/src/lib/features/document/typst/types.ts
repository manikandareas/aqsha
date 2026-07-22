/** Diagnostik mentah dari typst.ts (format 'full') yang di-post worker → main thread. */
export type TypstRawDiagnostic = {
	package: string;
	path: string;
	/** 'error' | 'warning' (mengikuti severity LSP). */
	severity: string;
	/** `line:col-line:col` (1-based). */
	range: string;
	message: string;
};

/** Pesan main → worker. */
export type TypstWorkerRequest =
	| {
			type: 'update';
			seq: number;
			source: string;
			bib: string | null;
			/** Path virtual utama, mis. `/skripsi.typ` (harus leading `/`). */
			mainFilePath: string;
	  }
	| { type: 'dispose' };

/** Pesan worker → main. SVG sudah selesai dirender agar WASM tidak memblokir main thread. */
export type TypstWorkerResponse =
	| { type: 'ready' }
	| {
			type: 'compiled';
			seq: number;
			svg: string | null;
			diagnostics: TypstRawDiagnostic[];
	  }
	| { type: 'error'; seq: number; message: string };
