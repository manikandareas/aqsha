import type { SaveSectionDocumentResult } from './api';

type SavedResult = Extract<SaveSectionDocumentResult, { status: 'saved' }>;

/**
 * Scheduler autosave dokumen bab: debounce ketikan + langit-langit interval
 * (sesi mengetik panjang tetap tersimpan berkala). Satu save in-flight; dirty
 * saat saving → save ulang setelahnya. `stale_write` menghentikan penjadwalan
 * (menulis lagi hanya menimpa pekerjaan tab lain) sampai user memuat ulang.
 */
export class SectionAutosave {
	state = $state<'idle' | 'dirty' | 'saving' | 'error' | 'stale'>('idle');

	#debounceMs: number;
	#maxIntervalMs: number;
	#save: (file: File, baseVersion?: number) => Promise<SaveSectionDocumentResult>;
	#buildFile: () => Promise<File>;
	#onSaved: (r: SavedResult) => void;
	#onStale: (currentVersion: number) => void;

	#baseVersion: number | undefined;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#oldestDirtyAt: number | null = null;
	#inFlight = false;
	#dirtyDuringFlight = false;
	#disposed = false;

	constructor(opts: {
		debounceMs?: number;
		maxIntervalMs?: number;
		save: (file: File, baseVersion?: number) => Promise<SaveSectionDocumentResult>;
		buildFile: () => Promise<File>;
		onSaved: (r: SavedResult) => void;
		onStale: (currentVersion: number) => void;
	}) {
		this.#debounceMs = opts.debounceMs ?? 2000;
		this.#maxIntervalMs = opts.maxIntervalMs ?? 15000;
		this.#save = opts.save;
		this.#buildFile = opts.buildFile;
		this.#onSaved = opts.onSaved;
		this.#onStale = opts.onStale;
	}

	get hasUnsaved(): boolean {
		return this.state === 'dirty' || this.state === 'saving' || this.state === 'error';
	}

	setBaseVersion(v: number | undefined): void {
		this.#baseVersion = v;
	}

	markDirty(): void {
		if (this.#disposed || this.state === 'stale') return;
		if (this.#inFlight) {
			this.#dirtyDuringFlight = true;
			return;
		}
		this.state = 'dirty';
		this.#oldestDirtyAt ??= Date.now();
		const overdue = Date.now() - this.#oldestDirtyAt >= this.#maxIntervalMs;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), overdue ? 0 : this.#debounceMs);
	}

	async flush(): Promise<void> {
		if (this.#disposed || this.#inFlight || this.state === 'stale') return;
		if (this.state !== 'dirty' && this.state !== 'error') return;
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		this.#inFlight = true;
		this.state = 'saving';
		try {
			const file = await this.#buildFile();
			const result = await this.#save(file, this.#baseVersion);
			if (result.status === 'stale_write') {
				this.state = 'stale';
				this.#onStale(result.currentVersion);
				return;
			}
			this.#baseVersion = result.contentVersion;
			this.#onSaved(result);
			this.#oldestDirtyAt = null;
			// Clear in-flight before the re-arm check below: markDirty()'s guard
			// treats #inFlight as "already saving" and would otherwise swallow the
			// edit that arrived while this save was running, silently dropping it.
			// (The finally still clears it again for the catch path — harmless.)
			this.#inFlight = false;
			if (this.#dirtyDuringFlight) {
				this.#dirtyDuringFlight = false;
				this.state = 'idle';
				this.markDirty();
			} else {
				this.state = 'idle';
			}
		} catch {
			this.state = 'error';
		} finally {
			this.#inFlight = false;
		}
	}

	retry(): void {
		if (this.state !== 'error') return;
		this.state = 'dirty';
		void this.flush();
	}

	dispose(): void {
		this.#disposed = true;
		if (this.#timer) clearTimeout(this.#timer);
	}
}
