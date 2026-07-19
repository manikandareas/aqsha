import type { SaveSectionDocumentResult } from '../api';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'stale' | 'error';

/**
 * Autosave debounced untuk sumber bab. Memegang `baseVersion` sendiri (buffer editor =
 * source-of-truth; respons save tidak me-refetch dokumen). `stale_write` bukan error keras —
 * dipetakan ke status `stale` supaya UI bisa menawarkan muat ulang.
 */
export class AutosaveController {
	status = $state<SaveStatus>('idle');
	version = $state(0);
	savedAt = $state<number | null>(null);

	#save: (input: { source: string; baseVersion: number }) => Promise<SaveSectionDocumentResult>;
	#debounceMs: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#pending: string | null = null;
	#inFlight = false;

	constructor(opts: {
		initialVersion: number;
		debounceMs?: number;
		save: (input: { source: string; baseVersion: number }) => Promise<SaveSectionDocumentResult>;
	}) {
		this.version = opts.initialVersion;
		this.#debounceMs = opts.debounceMs ?? 800;
		this.#save = opts.save;
	}

	edit(source: string): void {
		this.#pending = source;
		this.status = 'dirty';
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.#run(), this.#debounceMs);
	}

	async flush(): Promise<void> {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		await this.#run();
	}

	reset(version: number): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		this.#pending = null;
		this.version = version;
		this.status = 'idle';
	}

	dispose(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}

	async #run(): Promise<void> {
		if (this.#inFlight) {
			// Coba lagi setelah in-flight selesai — jaga urutan simpan.
			return;
		}
		const source = this.#pending;
		if (source === null) return;
		this.#pending = null;
		this.#inFlight = true;
		this.status = 'saving';
		try {
			const result = await this.#save({ source, baseVersion: this.version });
			if (result.status === 'saved') {
				this.version = result.contentVersion;
				this.savedAt = Date.now();
				this.status = this.#pending !== null ? 'dirty' : 'saved';
			} else {
				this.version = result.currentVersion;
				this.status = 'stale';
			}
		} catch {
			this.status = 'error';
		} finally {
			this.#inFlight = false;
			// Ada edit menumpuk saat in-flight → jadwalkan simpan lagi.
			if (this.#pending !== null && this.status !== 'stale') {
				this.edit(this.#pending);
			}
		}
	}
}
