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
	| { type: 'update'; seq: number; source: string; bib: string | null }
	| { type: 'dispose' };

/** Pesan worker → main. `vector` = artifact vektor typst (di-render renderer di main thread). */
export type TypstWorkerResponse =
	| { type: 'ready' }
	| {
			type: 'compiled';
			seq: number;
			vector: Uint8Array | null;
			diagnostics: TypstRawDiagnostic[];
	  }
	| { type: 'error'; seq: number; message: string };
