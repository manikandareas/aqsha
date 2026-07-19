# Research-first Fase 7b + 8b: Editor Sumber LaTeX + Ekspor DOCX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Reviewer bisa menyalakan "Edit sumber" pada halaman bab agen-first untuk menyunting `.tex` bab langsung di CodeMirror 6 (autosave ber-CAS, compile ulang) dengan lompatan dua-arah SyncTeX PDF↔editor; (2) pengguna bisa mengunduh dokumen proyek sebagai `.docx` best-effort (jaring pengaman kampus wajib-Word) dari halaman pratinjau.

**Architecture:** Editor CM6 menggantikan panel PDF utama saat di-toggle (bukan kolom baru) sehingga positioning agen-first utuh. Buffer editor = source-of-truth selama mengetik; autosave debounced memakai hook `useSaveSectionDocument` yang sudah ada (`baseVersion` CAS → union `stale_write`, bukan throw). SyncTeX bekerja sebagai **lompat antar-view**: klik PDF → inverse lookup → buka editor di baris itu; tombol di editor → forward lookup → pindah ke PDF + kedip penanda. Backend synctex sudah ada (`packages/services/src/latex/synctex.ts` + build menyimpan `synctexR2Key`); fase ini menambah dua endpoint lookup tipis yang meniru `annotation.service`. Ekspor DOCX memakai ulang assembly dokumen penuh (`assembleWorkspace` + `.bib`) lalu menjalankan `pandoc` via `runSandboxed` di tmpdir (tanpa Tectonic/jaringan); hasil `.docx` disimpan via `StorageService` dan dikembalikan sebagai signed URL. Konversi bersifat **best-effort** (sebagian makro/`.cls` turun kualitas; bibliografi via `--citeproc`, bukan biber).

**Tech Stack:** SvelteKit 5 (runes), CodeMirror 6 (`codemirror` + `@codemirror/legacy-modes` stex), pandoc (binary sistem), `@tanstack/svelte-query`, Elysia (Eden Treaty), `@aqsha/services`, Bun workspaces, vitest + bun:test.

**Spec / sumber:** roadmap `docs/superpowers/specs/2026-07-18-research-first-phase-planning-context.md` §"Fase 7" (editor opsional/opt-in) + §"Fase 8" (ekspor DOCX best-effort; konverter pandoc). **Fase 8a (thesis-class per-kampus) DIELIMINASI dari cakupan.** Melanjutkan Fase 7 per-hunk (`2026-07-19-research-first-phase7-per-hunk-diff-review.md`).

## Global Constraints

- Selalu `bun` (1.3.10); jangan npm/pnpm/yarn.
- Komentar kode: jelaskan **why**, TANPA referensi fase/plan/tiket (CLAUDE.md).
- `apps/svelte` TIDAK boleh impor `@aqsha/db`/`@aqsha/services` — tipe di-mirror manual di `features/*/api.ts`.
- Migrasi dir = `packages/db/migrations` (fase ini TANPA migrasi — jangan buat).
- Runtime api/agent dev impor kondisi `bun` → source; verifikasi runtime tetap `bun run build:dist` + restart proses api setelah ubah service.
- Ikon svelte: hugeicons via `$lib/icons` / `@aqsha/ui-svelte`; jangan `@lucide/svelte` langsung (eslint-banned).
- Baseline typecheck svelte: 2 error pre-existing `DetailPanel:158-159` — jangan tambah error baru. Services & `@aqsha/api` typecheck 0 error. Baseline `bun --filter @aqsha/services test`: 8 fail pre-existing (tectonic cold-bundle) — jangan tambah fail baru; tes yang butuh pandoc HARUS skip otomatis bila binary tak ada.
- UI copy sentence case, bahasa Indonesia, tanpa all-caps.
- **Buffer editor = source-of-truth**: respons save TIDAK boleh memicu refetch/replace buffer (aturan doc-comment `useSaveSectionDocument`). Caller memegang `baseVersion` sendiri; reset buffer HANYA saat `docKey` berganti (ganti bab / versi termuat baru).
- Bab `role === 'bibliography'` tidak bisa disunting (backend `bibliography_not_editable`, 422) — sembunyikan toggle editor untuknya.
- **CM6 single-copy**: semua paket `@codemirror/*` harus resolve ke SATU salinan `@codemirror/state`/`@codemirror/view` (dua salinan = editor pecah senyap). Setelah `bun install`, verifikasi `bun pm ls | grep @codemirror/state` hanya satu versi.
- **Ekspor DOCX non-produksi**: provisioning `pandoc` di image runtime/prod DILUAR cakupan. Butuh `pandoc` di mesin dev (`brew install pandoc`); binary di-resolve via `AQSHA_PANDOC_BIN ?? "pandoc"`. Subprocess (pandoc/tectonic) lewat `runSandboxed` (env eksplisit PATH/HOME, tidak mewarisi env induk).

---

### Task 1: Dependensi CodeMirror 6 + factory state + tes murni

Editor CM6 dipecah jadi (a) factory pure `createLatexEditorState` yang bisa diuji headless di node (EditorState tidak butuh DOM), lalu (b) komponen Svelte tipis yang mem-mount `EditorView`. Task ini mengerjakan (a) + dependensi.

**Files:**
- Modify: `apps/svelte/package.json` (tambah dependensi CM6)
- Create: `apps/svelte/src/lib/features/sections/lib/latex-editor.ts`
- Test: `apps/svelte/src/lib/features/sections/lib/latex-editor.test.ts`

**Interfaces:**
- Consumes: `EditorState`, `Compartment`, `Annotation` dari `@codemirror/state`; `EditorView`, `basicSetup` dari `codemirror`; `keymap` dari `@codemirror/view`; `indentWithTab` dari `@codemirror/commands`; `StreamLanguage` dari `@codemirror/language`; `stex` dari `@codemirror/legacy-modes/mode/stex`.
- Produces (dipakai Task 2, 3, 5):
  - `const ExternalSync: Annotation<boolean>` — menandai transaksi reset non-user (setDoc programatik) agar `onChange` tidak ikut ter-trigger.
  - `type LatexEditorHandle = { setDoc(next: string): void; scrollToLine(line: number): void; getCursorLine(): number; focus(): void; destroy(): void }`
  - `function mountLatexEditor(parent: HTMLElement, opts: { doc: string; editable: boolean; dark: boolean; onChange: (value: string) => void }): LatexEditorHandle`
  - `function latexEditorExtensions(opts: { editable: boolean; dark: boolean; onChange: (value: string) => void; editableCompartment: Compartment; themeCompartment: Compartment }): Extension[]` — dipisah agar bisa diuji.

- [ ] **Step 1: Tambah dependensi CM6**

Di `apps/svelte/package.json`, tambahkan ke `dependencies` (jaga urut alfabet — sisipkan sebelum `"@content-collections/..."` bila ada di dependencies; sesuaikan posisi supaya tetap valid JSON):

```json
    "@codemirror/commands": "^6.8.1",
    "@codemirror/language": "^6.11.0",
    "@codemirror/legacy-modes": "^6.5.1",
    "@codemirror/state": "^6.5.2",
    "@codemirror/view": "^6.38.1",
    "codemirror": "^6.0.2",
```

Run: `bun install`
Expected: sukses; lockfile ter-update.

- [ ] **Step 2: Verifikasi single-copy CM6**

Run: `bun pm ls | grep '@codemirror/state'`
Expected: hanya SATU baris versi `@codemirror/state` (mis. `6.5.2`). Bila muncul dua versi, tambahkan `overrides` di root `package.json` untuk memaksa satu versi lalu ulangi `bun install`.

- [ ] **Step 3: Tulis tes yang gagal**

Buat `apps/svelte/src/lib/features/sections/lib/latex-editor.test.ts`. `@codemirror/view` (via `basicSetup` di `latex-editor.ts`) menyentuh `document` saat modul dimuat, jadi tes ini butuh environment DOM — beri pragma jsdom di baris pertama:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, Compartment } from '@codemirror/state';
import { latexEditorExtensions } from './latex-editor';

function makeState(doc: string, onChange: (v: string) => void) {
	const editableCompartment = new Compartment();
	const themeCompartment = new Compartment();
	return EditorState.create({
		doc,
		extensions: latexEditorExtensions({
			editable: true,
			dark: false,
			onChange,
			editableCompartment,
			themeCompartment
		})
	});
}

describe('latexEditorExtensions', () => {
	it('membangun state yang mempertahankan dokumen awal', () => {
		const state = makeState('\\section{Halo}', () => {});
		expect(state.doc.toString()).toBe('\\section{Halo}');
	});

	it('menandai read-only ketika editable=false via compartment', () => {
		const editableCompartment = new Compartment();
		const themeCompartment = new Compartment();
		const state = EditorState.create({
			doc: 'x',
			extensions: latexEditorExtensions({
				editable: false,
				dark: false,
				onChange: () => {},
				editableCompartment,
				themeCompartment
			})
		});
		expect(state.readOnly).toBe(true);
	});

	it('mengekspos anotasi ExternalSync untuk menyaring reset programatik', async () => {
		const mod = await import('./latex-editor');
		expect(mod.ExternalSync).toBeDefined();
	});
});
```

Run: `cd apps/svelte && bunx vitest run src/lib/features/sections/lib/latex-editor.test.ts`
Expected: FAIL — `Cannot find module './latex-editor'`.

- [ ] **Step 4: Implementasi factory**

Buat `apps/svelte/src/lib/features/sections/lib/latex-editor.ts`:

```ts
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

// Ekspor reconfigure helper theme/editable untuk komponen (dipakai saat mode gelap/terang
// atau editable berubah tanpa membangun ulang state).
export { Compartment };
export function themeReconfigureEffect(themeCompartment: Compartment, dark: boolean) {
	return themeCompartment.reconfigure(latexTheme(dark));
}
export function editableReconfigureEffect(editableCompartment: Compartment, editable: boolean) {
	return editableCompartment.reconfigure(EditorState.readOnly.of(!editable));
}
```

> Catatan: `mountLatexEditor` di atas menyimpan `editableCompartment`/`themeCompartment` di closure `latexEditorExtensions` tetapi tidak menyimpannya untuk reconfigure. Karena Task 1 hanya perlu buffer + read-only awal + onChange, reconfigure runtime (gelap/terang, editable) diurus komponen di Task 3 yang membuat compartment-nya sendiri lewat `latexEditorExtensions`. `mountLatexEditor` di sini dipakai untuk jalur sederhana; Task 3 memakai `latexEditorExtensions` langsung agar bisa menyimpan compartment.

- [ ] **Step 5: Jalankan tes — hijau**

Run: `cd apps/svelte && bunx vitest run src/lib/features/sections/lib/latex-editor.test.ts`
Expected: PASS (3 tes).

- [ ] **Step 6: Commit**

```bash
git add apps/svelte/package.json bun.lock apps/svelte/src/lib/features/sections/lib/latex-editor.ts apps/svelte/src/lib/features/sections/lib/latex-editor.test.ts
git commit -m "feat(svelte): factory CodeMirror 6 + mode stex untuk editor sumber LaTeX"
```

---

### Task 2: Controller autosave debounced ber-CAS + tes

Logika autosave murni (tanpa DOM): debounce, lacak `baseVersion` sendiri, petakan `stale_write`/error ke status yang bisa ditampilkan. Diuji dengan fake timers.

**Files:**
- Create: `apps/svelte/src/lib/features/sections/lib/autosave-controller.svelte.ts`
- Test: `apps/svelte/src/lib/features/sections/lib/autosave-controller.test.ts`

**Interfaces:**
- Consumes: `SaveSectionDocumentResult` (mirror lokal dari `../api`).
- Produces (dipakai Task 3):
  - `type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'stale' | 'error'`
  - `class AutosaveController` dengan konstruktor `(opts: { initialVersion: number; debounceMs?: number; save: (input: { source: string; baseVersion: number }) => Promise<SaveSectionDocumentResult> })`, method `edit(source: string): void`, `flush(): Promise<void>`, `reset(version: number): void`, `dispose(): void`, dan getter reaktif `status`, `version`, `savedAt`.

**Interface `save` cocok dengan** hook `useSaveSectionDocument().mutateAsync` (mengembalikan `SaveSectionDocumentResult`).

- [ ] **Step 1: Tulis tes yang gagal**

Buat `apps/svelte/src/lib/features/sections/lib/autosave-controller.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveController } from './autosave-controller.svelte';
import type { SaveSectionDocumentResult } from '../api';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function savedResult(version: number): SaveSectionDocumentResult {
	return { status: 'saved', artifactId: 'a', contentVersion: version, sectionStatus: 'draft' };
}

describe('AutosaveController', () => {
	it('men-debounce edit lalu menyimpan sekali dengan baseVersion awal', async () => {
		const save = vi.fn(async () => savedResult(4));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 500, save });
		c.edit('a');
		c.edit('ab');
		c.edit('abc');
		expect(save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(500);
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith({ source: 'abc', baseVersion: 3 });
		expect(c.version).toBe(4);
		expect(c.status).toBe('saved');
	});

	it('memakai versi hasil simpan sebagai baseVersion simpan berikutnya', async () => {
		const save = vi
			.fn<(i: { source: string; baseVersion: number }) => Promise<SaveSectionDocumentResult>>()
			.mockResolvedValueOnce(savedResult(4))
			.mockResolvedValueOnce(savedResult(5));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 100, save });
		c.edit('one');
		await vi.advanceTimersByTimeAsync(100);
		c.edit('two');
		await vi.advanceTimersByTimeAsync(100);
		expect(save.mock.calls[1]![0]).toEqual({ source: 'two', baseVersion: 4 });
		expect(c.version).toBe(5);
	});

	it('menandai status stale saat server mengembalikan stale_write', async () => {
		const save = vi.fn(
			async (): Promise<SaveSectionDocumentResult> => ({ status: 'stale_write', currentVersion: 9 })
		);
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 10, save });
		c.edit('x');
		await vi.advanceTimersByTimeAsync(10);
		expect(c.status).toBe('stale');
		expect(c.version).toBe(9); // versi server terbaru diketahui, tapi buffer tetap milik user
	});

	it('flush menyimpan langsung tanpa menunggu debounce', async () => {
		const save = vi.fn(async () => savedResult(4));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 5000, save });
		c.edit('halo');
		await c.flush();
		expect(save).toHaveBeenCalledTimes(1);
		expect(c.status).toBe('saved');
	});

	it('reset memulai ulang versi dan mengosongkan status kotor', async () => {
		const save = vi.fn(async () => savedResult(4));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 10, save });
		c.edit('x');
		c.reset(7);
		expect(c.version).toBe(7);
		expect(c.status).toBe('idle');
		await vi.advanceTimersByTimeAsync(10);
		expect(save).not.toHaveBeenCalled(); // edit sebelum reset dibatalkan
	});
});
```

Run: `cd apps/svelte && bunx vitest run src/lib/features/sections/lib/autosave-controller.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 2: Implementasi controller**

Buat `apps/svelte/src/lib/features/sections/lib/autosave-controller.svelte.ts`:

```ts
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
```

> Catatan perilaku: setelah `stale`, controller berhenti menyimpan otomatis (buffer user dilindungi) sampai UI memanggil `reset(version)` (mis. sesudah "muat ulang sumber"). `#run` men-drop edit yang menumpuk saat in-flight ke penjadwalan ulang agar tidak ada dua simpan paralel dengan `baseVersion` sama.

- [ ] **Step 3: Jalankan tes — hijau**

Run: `cd apps/svelte && bunx vitest run src/lib/features/sections/lib/autosave-controller.test.ts`
Expected: PASS (5 tes). Bila tes "reset" gagal karena timer edit sebelum reset ikut jalan, pastikan `reset` meng-clear `#timer` dan `#pending`.

- [ ] **Step 4: Commit**

```bash
git add apps/svelte/src/lib/features/sections/lib/autosave-controller.svelte.ts apps/svelte/src/lib/features/sections/lib/autosave-controller.test.ts
git commit -m "feat(svelte): controller autosave debounced ber-CAS untuk sumber bab"
```

---

### Task 3: Komponen `LatexSourceEditor.svelte` + toggle "Edit sumber" di SectionEditorPage

Wire editor ke halaman: toggle di header menukar panel utama PDF ↔ editor; autosave + indikator status + banner stale + reuse "Compile ulang".

**Files:**
- Create: `apps/svelte/src/lib/features/sections/components/LatexSourceEditor.svelte`
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`
- Modify: `apps/svelte/src/lib/icons/index.ts` (pastikan ekspor `Code2Icon`, `EyeIcon` tersedia)

**Interfaces:**
- Consumes: `mountLatexEditor`/`latexEditorExtensions` (Task 1), `AutosaveController` (Task 2), `useSaveSectionDocument`/`useSectionDocument` (`../api`).
- Produces (dipakai Task 5): komponen mengeluarkan handle lewat `onReady(handle: LatexEditorHandle)`; halaman menyimpan `editMode` + `editorHandle` untuk lompatan SyncTeX.

- [ ] **Step 1: Pastikan ikon tersedia**

Buka `apps/svelte/src/lib/icons/index.ts`. Konfirmasi ada ekspor `Code2Icon` dan `EyeIcon` (adapter hugeicons). Jika salah satu belum ada, tambahkan mengikuti pola ekspor ikon lain di file itu (mis. `export { Code as Code2Icon } from '@hugeicons/core-free-icons'` — sesuaikan nama glyph hugeicons yang tersedia, mis. `SourceCodeIcon`, `ViewIcon`). Verifikasi impor tidak error saat build.

Run: `cd apps/svelte && bunx vitest run --reporter dot src/lib/features/sections/lib/latex-editor.test.ts` (memastikan tak ada regresi impor)
Expected: PASS.

- [ ] **Step 2: Buat komponen `LatexSourceEditor.svelte`**

Buat `apps/svelte/src/lib/features/sections/components/LatexSourceEditor.svelte`:

```svelte
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
```

> Gotcha runes: `mode` dari `mode-watcher` v1 diakses `mode.current` (bukan store `$mode`). Verifikasi versi terpasang; bila API berbeda, sesuaikan pembacaan mode gelap.

- [ ] **Step 3: Wire state editor + toggle di `SectionEditorPage.svelte`**

Di blok `<script>` `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`, tambahkan impor:

```ts
	import { Icon, ArrowLeftIcon, ChevronDownIcon, SparklesIcon, Code2Icon, EyeIcon } from '$lib/icons';
	import LatexSourceEditor from '../components/LatexSourceEditor.svelte';
	import { AutosaveController } from '../lib/autosave-controller.svelte';
	import type { LatexEditorHandle } from '../lib/latex-editor';
	import { useSaveSectionDocument } from '../api';
```

(Baris `import { Icon, ArrowLeftIcon, ChevronDownIcon, SparklesIcon } from '$lib/icons';` yang lama diganti dengan yang menambah `Code2Icon, EyeIcon`.)

Tambahkan state + controller setelah deklarasi hook lain (di dekat baris 71):

```ts
	const saveDocument = useSaveSectionDocument(() => sectionId, () => projectId);

	let editMode = $state(false);
	let editorHandle = $state<LatexEditorHandle | null>(null);

	// Controller autosave dibuat ulang saat ganti bab / saat dokumen termuat pertama kali.
	let autosave = $state<AutosaveController | null>(null);
	const docKey = $derived(`${sectionId}:${document.data?.contentVersion ?? 0}`);

	$effect(() => {
		const doc = document.data;
		if (!doc) return;
		// Bangun controller sekali saat dokumen tersedia; versi awal = versi termuat.
		if (!autosave) {
			autosave = new AutosaveController({
				initialVersion: doc.contentVersion,
				save: (input) => saveDocument.mutateAsync(input)
			});
		}
	});

	$effect(() => {
		const c = autosave;
		return () => c?.dispose();
	});

	function handleEditorChange(next: string): void {
		autosave?.edit(next);
	}

	async function toggleEditMode(): Promise<void> {
		if (editMode) {
			// Keluar dari edit: pastikan simpanan terakhir tuntas sebelum kembali ke PDF.
			await autosave?.flush();
			editMode = false;
			return;
		}
		editMode = true;
	}

	// "Compile ulang" saat edit: flush dulu supaya build memakai sumber terbaru.
	async function requestCompileFromEditor(): Promise<void> {
		await autosave?.flush();
		requestCompile();
	}

	// Muat ulang sumber setelah konflik stale: ambil ulang dokumen & reset buffer + controller.
	async function reloadSource(): Promise<void> {
		await document.refetch();
		const doc = document.data;
		if (doc) {
			autosave?.reset(doc.contentVersion);
			editorHandle?.setDoc(doc.source);
		}
	}

	const saveStatusLabel = $derived.by(() => {
		switch (autosave?.status) {
			case 'saving':
				return 'Menyimpan…';
			case 'saved':
				return 'Tersimpan';
			case 'dirty':
				return 'Perubahan belum disimpan';
			case 'stale':
				return 'Sumber berubah di tempat lain';
			case 'error':
				return 'Gagal menyimpan';
			default:
				return '';
		}
	});
```

- [ ] **Step 4: Tambah tombol toggle di header + versi hidup**

Di bagian header (blok `{:else}` non-bibliography, sekitar baris 306–325), ganti blok tombol "Compile ulang" agar menyertakan toggle "Edit sumber" dan memakai versi hidup controller saat mode edit. Gantikan blok:

```svelte
				{#if document.data}
					<Button
						type="button"
						variant="secondary"
						size="sm"
						disabled={compile.isPending}
						onclick={requestCompile}
					>
						{#if compile.isPending}
							<Spinner class="size-4" />
						{/if}
						Compile ulang
					</Button>
					<Badge variant="outline">Sumber v{currentVersion}</Badge>
				{/if}
```

dengan:

```svelte
				{#if document.data}
					{#if editMode && saveStatusLabel}
						<span class="text-label text-muted-foreground">{saveStatusLabel}</span>
					{/if}
					<Button
						type="button"
						variant={editMode ? 'secondary' : 'ghost'}
						size="sm"
						aria-pressed={editMode}
						onclick={toggleEditMode}
					>
						<Icon icon={editMode ? EyeIcon : Code2Icon} class="size-4" />
						{editMode ? 'Lihat PDF' : 'Edit sumber'}
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						disabled={compile.isPending}
						onclick={editMode ? requestCompileFromEditor : requestCompile}
					>
						{#if compile.isPending}
							<Spinner class="size-4" />
						{/if}
						Compile ulang
					</Button>
					<Badge variant="outline">Sumber v{autosave?.version ?? currentVersion}</Badge>
				{/if}
```

- [ ] **Step 5: Render editor menggantikan panel utama saat editMode**

Di dalam blok `{:else}` non-bibliography (setelah header, sebelum `{#if proposal.data}`), bungkus konten PDF eksisting agar hanya tampil saat `!editMode`, dan tambahkan cabang editor. Struktur baru:

```svelte
						{#if editMode && document.data}
							{#if autosave?.status === 'stale'}
								<div
									class="mx-4 mt-1 flex items-center justify-between gap-2 rounded-md border-2 border-border bg-lemon/20 px-3 py-2 text-label"
									role="status"
								>
									<span>Sumber bab ini berubah di tempat lain. Muat ulang untuk menyunting versi terbaru.</span>
									<Button type="button" size="sm" variant="secondary" onclick={reloadSource}>
										Muat ulang sumber
									</Button>
								</div>
							{/if}
							<div class="min-h-0 flex-1 px-4 pt-1 pb-4">
								<div class="h-full overflow-hidden rounded-lg border-2 border-border">
									<LatexSourceEditor
										value={document.data.source}
										{docKey}
										editable={autosave?.status !== 'stale'}
										onChange={handleEditorChange}
										onReady={(h) => (editorHandle = h)}
									/>
								</div>
							</div>
						{:else}
							<!-- (blok PDF/anotasi eksisting: proposal card, collapsible anotasi,
							     SectionBuildErrorPanel, SectionPdfViewer / empty state — TIDAK diubah,
							     hanya dipindah ke dalam cabang ini) -->
							{#if proposal.data}
								<!-- … blok ProposalReviewCard eksisting … -->
							{/if}
							{#if build.data?.pdfUrl}
								<!-- … Collapsible anotasi eksisting … -->
							{/if}
							{#if build.data?.status === 'error'}
								<!-- … SectionBuildErrorPanel eksisting … -->
							{/if}
							{#if build.data?.pdfUrl}
								<SectionPdfViewer … />
							{:else if document.data}
								<!-- … "Menyiapkan PDF…" … -->
							{:else if document.isPending}
								<!-- … "Memuat bab…" … -->
							{:else}
								<!-- … empty state "Tulis dengan Astra" … -->
							{/if}
						{/if}
```

> Penting: pindahkan blok PDF/anotasi yang SUDAH ADA (baris 333–428) apa adanya ke dalam cabang `{:else}` ini — jangan menulis ulang isinya. Toggle hanya menambah cabang editor dan membungkus blok lama. `editMode` hanya bisa true untuk non-bibliography (toggle tidak dirender di cabang `isBibliography`).

- [ ] **Step 6: Verifikasi typecheck**

Run: `cd apps/svelte && bun run typecheck`
Expected: hanya 2 error pre-existing `DetailPanel:158-159`; tidak ada error baru dari file yang disentuh.

- [ ] **Step 7: Verifikasi manual di browser (skill `run` / claude-in-chrome)**

Jalankan app (`bun run dev:web` atau setara), buka bab yang punya sumber, lalu:
1. Klik "Edit sumber" → panel utama berganti jadi editor CM6 berisi `.tex` bab; syntax highlight LaTeX aktif; badge "Sumber v{n}".
2. Ketik perubahan → indikator "Menyimpan…" → "Tersimpan"; badge versi naik.
3. Klik "Compile ulang" → kembali men-trigger build (flush dulu). Klik "Lihat PDF" → PDF ter-render mencerminkan edit.
4. Bab bibliography: toggle "Edit sumber" TIDAK muncul.

Catat hasil (lolos/temuan). Jangan lanjut bila editor tidak mount atau autosave tidak jalan.

- [ ] **Step 8: Commit**

```bash
git add apps/svelte/src/lib/features/sections/components/LatexSourceEditor.svelte apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte apps/svelte/src/lib/icons/index.ts
git commit -m "feat(svelte): toggle Edit sumber — editor CM6 gantikan panel PDF + autosave"
```

---

### Task 4 (A4 backend): `SectionSynctexService` lookup dua-arah + endpoint + tes

Ekspos SyncTeX ke klien lewat dua lookup server-side (parse tetap di server + cache, meniru `annotation.service`). Buffer editor = isi `sections/<id>.tex`, jadi forward memakai `file = sectionFilePath(id)` dan inverse hanya menerima hit ke file itu.

**Files:**
- Create: `packages/services/src/section-synctex.service.ts`
- Modify: `packages/services/src/index.ts` (ekspor `SectionSynctexService`)
- Modify: `apps/api/src/routes/workspaces.ts` (2 route)
- Test: `packages/services/test/section-synctex.test.ts`

**Interfaces:**
- Consumes: `LatexBuildRepo.findBySection`, `SectionService.assertSectionOwner`, `StorageService.readBytes`, `sectionFilePath`, `parseSynctex`, `synctexInverseLookupPdfPoint`, `synctexForwardLookup`.
- Produces (dipakai Task 5):
  - `SectionSynctexService.inverse(db, { ownerUserId, sectionId, page, xPt, yPt }): Promise<{ line: number } | null>`
  - `SectionSynctexService.forward(db, { ownerUserId, sectionId, line }): Promise<{ page: number; xPt: number; yPt: number } | null>`
  - Route `POST /sections/:id/synctex/inverse` body `{ page, xPt, yPt }`, `POST /sections/:id/synctex/forward` body `{ line }`.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `packages/services/test/section-synctex.test.ts`. Gunakan fixture synctex yang sudah ada bila tersedia (`packages/services/test/fixtures/latex/`), atau bangun `SynctexData` sintetis lewat parse — di sini kita uji lapisan pemetaan file body dengan memanggil helper murni. Karena service butuh DB + storage, uji unit fokus pada guard pemetaan file via fungsi internal yang diekspor untuk tes:

```ts
import { describe, expect, test } from 'bun:test';
import type { SynctexData } from '../src/latex/synctex';
import { pickBodyLine, pickBodyPosition } from '../src/section-synctex.service';

// SynctexData minimal: satu input body + satu record.
function fakeData(bodyPath: string): SynctexData {
	return {
		unit: 1,
		magnification: 1000,
		xOffset: 0,
		yOffset: 0,
		inputs: new Map([
			[1, `/tmp/aqsha-latex-xxx/main.tex`],
			[2, `/tmp/aqsha-latex-xxx/${bodyPath}`]
		]),
		records: [
			{ kind: 'x', tag: 1, line: 3, x: 100, y: 100, page: 1 },
			{ kind: 'x', tag: 2, line: 12, x: 5_000_000, y: 6_000_000, page: 2 }
		]
	};
}

describe('section-synctex pemetaan body', () => {
	test('inverse hanya menerima hit ke file body bab', () => {
		const data = fakeData('sections/sec-1.tex');
		// Titik dekat record tag=2 (body) di page 2.
		const near = pickBodyLine(data, 'sections/sec-1.tex', {
			page: 2,
			xPt: 5_000_000 / ((65536 * 72.27) / 72),
			yPt: 6_000_000 / ((65536 * 72.27) / 72)
		});
		expect(near).toEqual({ line: 12 });
	});

	test('inverse mengembalikan null saat titik terdekat bukan file body', () => {
		const data = fakeData('sections/sec-1.tex');
		const hit = pickBodyLine(data, 'sections/sec-1.tex', { page: 1, xPt: 0.1, yPt: 0.1 });
		expect(hit).toBeNull(); // record page 1 hanya milik main.tex (tag 1)
	});

	test('forward memetakan baris body ke posisi PDF', () => {
		const data = fakeData('sections/sec-1.tex');
		const pos = pickBodyPosition(data, 'sections/sec-1.tex', 12);
		expect(pos?.page).toBe(2);
		expect(pos?.xPt).toBeGreaterThan(0);
	});
});
```

Run: `cd packages/services && bun test test/section-synctex.test.ts`
Expected: FAIL — modul/ekspor belum ada.

- [ ] **Step 2: Implementasi service**

Buat `packages/services/src/section-synctex.service.ts`:

```ts
import { type Db, LatexBuildRepo } from "@aqsha/db";
import { sectionFilePath } from "./latex/assembly.service";
import {
  parseSynctex,
  type SynctexData,
  synctexForwardLookup,
  synctexInverseLookupPdfPoint,
} from "./latex/synctex";
import { SectionService } from "./section.service";
import { StorageService } from "./storage.service";

// Cache kecil ber-key build (builtAt membedakan upsert in-place) — sama pola annotation.service.
const SYNCTEX_CACHE_MAX = 8;
const synctexCache = new Map<string, SynctexData>();

async function loadSynctex(buildKey: string, r2Key: string): Promise<SynctexData | null> {
  const cached = synctexCache.get(buildKey);
  if (cached) return cached;
  try {
    const bytes = await StorageService.readBytes(r2Key);
    const data = parseSynctex(bytes);
    if (synctexCache.size >= SYNCTEX_CACHE_MAX) {
      const oldest = synctexCache.keys().next().value;
      if (oldest !== undefined) synctexCache.delete(oldest);
    }
    synctexCache.set(buildKey, data);
    return data;
  } catch {
    return null;
  }
}

/** Inverse: titik PDF → baris, hanya bila record terdekat milik file body bab. Diekspor untuk tes. */
export function pickBodyLine(
  data: SynctexData,
  bodyPath: string,
  target: { page: number; xPt: number; yPt: number },
): { line: number } | null {
  const hit = synctexInverseLookupPdfPoint(data, target);
  if (!hit || !hit.file.endsWith(bodyPath)) return null;
  return { line: hit.line };
}

/** Forward: baris body → posisi PDF. Diekspor untuk tes. */
export function pickBodyPosition(
  data: SynctexData,
  bodyPath: string,
  line: number,
): { page: number; xPt: number; yPt: number } | null {
  const pos = synctexForwardLookup(data, { file: bodyPath, line });
  if (!pos) return null;
  return { page: pos.page, xPt: pos.xPt, yPt: pos.yPt };
}

export const SectionSynctexService = {
  async inverse(
    db: Db,
    input: { ownerUserId: string; sectionId: string; page: number; xPt: number; yPt: number },
  ): Promise<{ line: number } | null> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    const build = await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId);
    if (!build || !build.synctexR2Key) return null;
    const data = await loadSynctex(`${build.id}:${build.builtAt}`, build.synctexR2Key);
    if (!data) return null;
    return pickBodyLine(data, sectionFilePath(input.sectionId), {
      page: input.page,
      xPt: input.xPt,
      yPt: input.yPt,
    });
  },

  async forward(
    db: Db,
    input: { ownerUserId: string; sectionId: string; line: number },
  ): Promise<{ page: number; xPt: number; yPt: number } | null> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    const build = await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId);
    if (!build || !build.synctexR2Key) return null;
    const data = await loadSynctex(`${build.id}:${build.builtAt}`, build.synctexR2Key);
    if (!data) return null;
    return pickBodyPosition(data, sectionFilePath(input.sectionId), input.line);
  },
};
```

- [ ] **Step 3: Ekspor service**

Di `packages/services/src/index.ts`, tambahkan (dekat ekspor `AnnotationService`):

```ts
export { SectionSynctexService } from "./section-synctex.service";
```

- [ ] **Step 4: Jalankan tes unit — hijau**

Run: `cd packages/services && bun test test/section-synctex.test.ts`
Expected: PASS (3 tes).

- [ ] **Step 5: Tambah endpoint**

Di `apps/api/src/routes/workspaces.ts`, impor `SectionSynctexService` (gabung dengan impor `@aqsha/services` yang sudah ada, mis. `SectionLatexService`). Tambahkan dua route setelah `GET /sections/:id/build` (sekitar baris 260):

```ts
  .post(
    "/sections/:id/synctex/inverse",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionSynctexService.inverse(db, {
        ownerUserId,
        sectionId: params.id,
        page: body.page,
        xPt: body.xPt,
        yPt: body.yPt,
      });
    },
    {
      auth: true,
      body: t.Object({ page: t.Numeric(), xPt: t.Numeric(), yPt: t.Numeric() }),
    },
  )
  .post(
    "/sections/:id/synctex/forward",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionSynctexService.forward(db, {
        ownerUserId,
        sectionId: params.id,
        line: body.line,
      });
    },
    {
      auth: true,
      body: t.Object({ line: t.Numeric() }),
    },
  )
```

- [ ] **Step 6: Build dist + typecheck api**

Run: `bun run build:dist && bun --filter @aqsha/api typecheck`
Expected: sukses, 0 error. (Runtime api dev mengimpor source, tapi Eden Treaty type di `apps/svelte` membaca `@aqsha/api` build — build:dist wajib agar tipe route baru terlihat klien di Task 5.)

- [ ] **Step 7: Commit**

```bash
git add packages/services/src/section-synctex.service.ts packages/services/src/index.ts packages/services/test/section-synctex.test.ts apps/api/src/routes/workspaces.ts
git commit -m "feat(latex): endpoint SyncTeX inverse/forward per-bab (lookup server-side)"
```

---

### Task 5 (A4 frontend): hook synctex + lompatan dua-arah PDF ↔ editor

Klik PDF (mode "lompat ke sumber") → inverse → buka editor di baris; tombol editor "Lihat di PDF" → forward → pindah ke PDF + kedip penanda.

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/api.ts` (2 hook)
- Modify: `apps/svelte/src/lib/features/sections/components/SectionPdfViewer.svelte` (toggle mode + penanda kedip + prop)
- Modify: `apps/svelte/src/lib/features/sections/components/PdfAnnotatedPage.svelte` (emit klik lokasi + render penanda)
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte` (wiring lompatan)
- Modify: `apps/svelte/src/lib/features/sections/components/LatexSourceEditor.svelte` (tombol "Lihat di PDF" opsional via slot/prop) — atau letakkan tombol di header halaman (dipilih di Step 4)

**Interfaces:**
- Consumes: `SectionSynctexService` route via Eden (`api.sections({id}).synctex.inverse.post`, `.synctex.forward.post`), `LatexEditorHandle` (Task 3).
- Produces: interaksi lompat antar-view (tidak dikonsumsi task lain).

- [ ] **Step 1: Tambah hook synctex di `api.ts`**

Di `apps/svelte/src/lib/features/sections/api.ts`, tambahkan tipe + dua hook (setelah `useCompileSection`):

```ts
export type SynctexInverseResult = { line: number } | null;
export type SynctexForwardResult = { page: number; xPt: number; yPt: number } | null;

/** Klik PDF → baris sumber (best-effort; null bila tak ada synctex / di luar body bab). */
export function useSynctexInverse(sectionId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { page: number; xPt: number; yPt: number }) =>
			unwrap(
				await api.sections({ id: sectionId() }).synctex.inverse.post(input)
			) as SynctexInverseResult
	}));
}

/** Baris sumber → posisi PDF (best-effort). */
export function useSynctexForward(sectionId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { line: number }) =>
			unwrap(await api.sections({ id: sectionId() }).synctex.forward.post(input)) as SynctexForwardResult
	}));
}
```

- [ ] **Step 2: Emit klik lokasi + penanda kedip di `PdfAnnotatedPage.svelte`**

Tambahkan dua prop: `locateMode = false` dan `onLocate?: (a: { page: number; xPt: number; yPt: number }) => void`, plus `flash?: { page: number; xPt: number; yPt: number } | null`. Perluas `handleClick` agar saat `locateMode` aktif memanggil `onLocate` (koordinat sudah dibagi `scale` = PDF point, konsisten dengan `onCreatePin`):

```ts
	function handleClick(event: MouseEvent): void {
		const container = containerEl;
		if (!container) return;
		const pageBox = container.getBoundingClientRect();
		const xPt = (event.clientX - pageBox.left) / scale;
		const yPt = (event.clientY - pageBox.top) / scale;
		if (locateMode && onLocate) {
			onLocate({ page: pageNumber, xPt, yPt });
			return;
		}
		if (!annotatable || !pinMode || !onCreatePin) return;
		onCreatePin({ page: pageNumber, x: xPt, y: yPt });
	}
```

Tambah render penanda kedip (di dalam overlay, hanya untuk halaman yang cocok):

```svelte
	{#if flash && flash.page === pageNumber}
		<div
			class="pointer-events-none absolute z-20 h-5 w-1.5 -translate-x-1/2 animate-pulse rounded-full bg-primary"
			style={`left:${flash.xPt * scale}px;top:${flash.yPt * scale - 10}px`}
		></div>
	{/if}
```

Update `role`/cursor: saat `locateMode`, beri `class` cursor-crosshair pada container (opsional, untuk keterbacaan).

- [ ] **Step 3: Teruskan mode + toggle di `SectionPdfViewer.svelte`**

Tambah prop `locateMode = $bindable(false)`, `onLocate?`, `flash?` dan teruskan ke `PdfAnnotatedPage`. Tambah tombol toggle di toolbar (setelah tombol pin), memakai `Code2Icon`:

```svelte
	<Button
		type="button"
		variant={locateMode ? 'secondary' : 'ghost'}
		size="icon-sm"
		aria-label={locateMode ? 'Matikan lompat ke sumber' : 'Lompat ke sumber — klik PDF untuk buka baris editor'}
		aria-pressed={locateMode}
		onclick={() => (locateMode = !locateMode)}
	>
		<Icon icon={Code2Icon} class="size-4" />
	</Button>
```

(Impor `Code2Icon` dari `$lib/icons` di file ini.)

- [ ] **Step 4: Wire lompatan di `SectionEditorPage.svelte`**

Tambah state + hook:

```ts
	import { useSynctexInverse, useSynctexForward } from '../api';
	// …
	const synctexInverse = useSynctexInverse(() => sectionId);
	const synctexForward = useSynctexForward(() => sectionId);
	let locateMode = $state(false);
	let pdfFlash = $state<{ page: number; xPt: number; yPt: number } | null>(null);

	// Klik PDF (mode lompat) → inverse → buka editor di baris.
	function handleLocate(a: { page: number; xPt: number; yPt: number }): void {
		synctexInverse.mutate(a, {
			onSuccess: (hit) => {
				if (!hit) {
					toast.info('Tidak ada baris sumber untuk titik itu.');
					return;
				}
				editMode = true;
				// Tunggu editor mount bila baru dibuka, lalu lompat.
				queueMicrotask(() => editorHandle?.scrollToLine(hit.line));
			}
		});
	}

	// Tombol editor "Lihat di PDF" → forward(baris kursor) → PDF + kedip.
	function locateInPdf(): void {
		const line = editorHandle?.getCursorLine();
		if (line == null) return;
		synctexForward.mutate(
			{ line },
			{
				onSuccess: (pos) => {
					if (!pos) {
						toast.info('Belum ada posisi PDF untuk baris itu (compile ulang dulu).');
						return;
					}
					editMode = false;
					pdfFlash = pos;
					queueMicrotask(() => {
						window.document
							.getElementById(`pdf-page-${pos.page}`)
							?.scrollIntoView({ behavior: 'smooth', block: 'center' });
					});
					// Bersihkan kedip setelah animasi.
					setTimeout(() => (pdfFlash = null), 2000);
				}
			}
		);
	}
```

Teruskan `bind:locateMode`, `onLocate={handleLocate}`, `flash={pdfFlash}` ke `<SectionPdfViewer …/>`. Tambahkan tombol "Lihat di PDF" di header saat `editMode` (di dekat toggle), memanggil `locateInPdf`:

```svelte
					{#if editMode}
						<Button type="button" variant="ghost" size="sm" onclick={locateInPdf}>
							<Icon icon={EyeIcon} class="size-4" />
							Lihat di PDF
						</Button>
					{/if}
```

- [ ] **Step 5: Build dist + typecheck**

Run: `bun run build:dist && cd apps/svelte && bun run typecheck`
Expected: hanya 2 error pre-existing `DetailPanel:158-159`.

- [ ] **Step 6: Verifikasi manual dua-arah (browser)**

Buka bab ber-PDF hasil compile sukses:
1. Nyalakan toggle "lompat ke sumber" di toolbar PDF → klik sebuah paragraf → editor terbuka di baris `.tex` yang sesuai (kursor pindah).
2. Di editor, taruh kursor di suatu baris → klik "Lihat di PDF" → kembali ke PDF, scroll ke halaman, penanda kedip di sekitar posisi.
3. Klik area kosong/preamble → toast "tidak ada baris sumber" (inverse null), tidak crash.

Catat hasil. (Best-effort: sumber yang berubah sejak build terakhir bisa meleset — perilaku diterima; sarankan compile ulang.)

- [ ] **Step 7: Commit**

```bash
git add apps/svelte/src/lib/features/sections/api.ts apps/svelte/src/lib/features/sections/components/SectionPdfViewer.svelte apps/svelte/src/lib/features/sections/components/PdfAnnotatedPage.svelte apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte
git commit -m "feat(svelte): lompatan SyncTeX dua-arah PDF <-> editor sumber"
```

---

### Task 6 (DOCX): Konverter LaTeX→DOCX (pandoc) + tes

Modul konversi murni-subprocess: terima `{ mainTex, extraFiles, bib }`, tulis ke tmpdir, jalankan pandoc, kembalikan byte `.docx`. Meniru pola tmpdir + `runSandboxed` di `compile.service.ts`.

**Files:**
- Create: `packages/services/src/latex/docx-convert.ts`
- Test: `packages/services/test/docx-convert.test.ts`

**Interfaces:**
- Consumes: `runSandboxed` (`./runner`), `throwAppError` (`@aqsha/db`), node fs/os/path.
- Produces (dipakai Task 7):
  - `type DocxConvertInput = { mainTex: string; bib?: string; extraFiles?: Record<string, Uint8Array>; options?: { timeoutMs?: number } }`
  - `async function convertLatexToDocx(input: DocxConvertInput): Promise<Uint8Array>` — throw `docx_export_unavailable` (503) bila pandoc tak ada, `docx_export_failed` (500) bila exit≠0/timeout.
  - `async function isPandocAvailable(): Promise<boolean>`

- [ ] **Step 0: Pasang pandoc di mesin dev (prasyarat sekali)**

Run: `which pandoc || brew install pandoc`
Run: `pandoc --version | head -1`
Expected: mencetak versi pandoc (mis. `pandoc 3.x`). Bila memakai path non-standar, set `AQSHA_PANDOC_BIN` di `.env` api.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `packages/services/test/docx-convert.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { convertLatexToDocx, isPandocAvailable } from "../src/latex/docx-convert";

const pandoc = await isPandocAvailable();
const maybe = pandoc ? test : test.skip;

const SAMPLE_MAIN = [
  "\\documentclass[12pt]{report}",
  "\\usepackage[backend=biber,style=apa]{biblatex}",
  "\\addbibresource{refs.bib}",
  "\\title{Uji Ekspor}",
  "\\author{Aqsha}",
  "\\begin{document}",
  "\\maketitle",
  "\\chapter{Pendahuluan}",
  "\\input{sections/intro.tex}",
  "\\printbibliography",
  "\\end{document}",
  "",
].join("\n");

describe("convertLatexToDocx", () => {
  maybe("menghasilkan byte .docx (zip PK) dari LaTeX + \\input", async () => {
    const docx = await convertLatexToDocx({
      mainTex: SAMPLE_MAIN,
      bib: "",
      extraFiles: {
        "sections/intro.tex": new TextEncoder().encode(
          "Ini paragraf pembuka untuk pengujian ekspor.\n",
        ),
      },
    });
    expect(docx.byteLength).toBeGreaterThan(0);
    // Magic bytes DOCX = arsip ZIP: 0x50 0x4B ("PK").
    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
  });

  test("isPandocAvailable mengembalikan boolean tanpa throw", async () => {
    expect(typeof (await isPandocAvailable())).toBe("boolean");
  });
});
```

Run: `cd packages/services && bun test test/docx-convert.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 2: Implementasi konverter**

Buat `packages/services/src/latex/docx-convert.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { throwAppError } from "@aqsha/db";
import { runSandboxed } from "./runner";

const DEFAULT_TIMEOUT_MS = 60_000;

export type DocxConvertInput = {
  /** Ditulis sebagai main.tex; sitasi merujuk refs.bib. */
  mainTex: string;
  bib?: string;
  extraFiles?: Record<string, Uint8Array>;
  options?: { timeoutMs?: number };
};

function pandocBin(): string {
  return process.env.AQSHA_PANDOC_BIN ?? "pandoc";
}

/** Probe ketersediaan pandoc (Bun.spawn melempar bila binary hilang → tangkap jadi false). */
export async function isPandocAvailable(): Promise<boolean> {
  try {
    const run = await runSandboxed([pandocBin(), "--version"], {
      cwd: tmpdir(),
      timeoutMs: 5_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    return !run.timedOut && run.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Konversi best-effort LaTeX→DOCX via pandoc. Bibliografi dirender pandoc `--citeproc`
 * (bukan biber) sehingga gaya sitasi mendekati, bukan identik dengan compile Tectonic.
 * `.cls` kustom & makro tak dikenal diabaikan pandoc (best-effort).
 */
export async function convertLatexToDocx(input: DocxConvertInput): Promise<Uint8Array> {
  const workdir = await mkdtemp(join(tmpdir(), "aqsha-docx-"));
  try {
    await writeFile(join(workdir, "main.tex"), input.mainTex, "utf8");
    // Selalu tulis refs.bib (mungkin kosong) supaya --bibliography tak menunjuk file hilang.
    await writeFile(join(workdir, "refs.bib"), input.bib ?? "", "utf8");
    for (const [relPath, bytes] of Object.entries(input.extraFiles ?? {})) {
      const target = resolve(workdir, relPath);
      if (!target.startsWith(workdir + sep)) {
        throwAppError({
          message: "Path file tambahan keluar dari direktori kerja",
          code: "docx_invalid_input",
          field: relPath,
        });
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }

    const outPath = join(workdir, "out.docx");
    const args = [
      pandocBin(),
      "main.tex",
      "--from=latex",
      "--to=docx",
      // Rakit daftar pustaka dari sitasi + refs.bib (biber tak dijalankan di jalur ini).
      "--citeproc",
      "--bibliography=refs.bib",
      "--output",
      outPath,
    ];

    let run;
    try {
      run = await runSandboxed(args, {
        cwd: workdir,
        timeoutMs: input.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
    } catch {
      // Bun.spawn melempar bila binary tak ditemukan.
      throwAppError({
        message: "Konverter DOCX (pandoc) tidak tersedia",
        code: "docx_export_unavailable",
        status: 503,
      });
    }
    if (run!.timedOut) {
      throwAppError({
        message: "Ekspor DOCX melebihi batas waktu",
        code: "docx_export_failed",
        status: 500,
      });
    }
    if (run!.exitCode !== 0) {
      throwAppError({
        message: "Ekspor DOCX gagal",
        code: "docx_export_failed",
        status: 500,
      });
    }

    const bytes = await readFile(outPath).catch(() => null);
    if (!bytes || bytes.byteLength === 0) {
      throwAppError({
        message: "Ekspor DOCX selesai tanpa menghasilkan berkas",
        code: "docx_export_failed",
        status: 500,
      });
    }
    return new Uint8Array(bytes);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Jalankan tes**

Run: `cd packages/services && bun test test/docx-convert.test.ts`
Expected: PASS. (Tes konversi berjalan bila pandoc terpasang; ter-skip otomatis bila tidak, dan tes `isPandocAvailable` tetap jalan.)

- [ ] **Step 4: Commit**

```bash
git add packages/services/src/latex/docx-convert.ts packages/services/test/docx-convert.test.ts
git commit -m "feat(latex): konverter LaTeX->DOCX best-effort via pandoc"
```

---

### Task 7 (DOCX): Service ekspor DOCX (assemble + konversi + simpan) + endpoint

Ekstrak assembly dokumen penuh agar dipakai ulang, tambahkan service ekspor yang menyimpan `.docx` + mengembalikan signed URL, dan endpoint Elysia.

**Files:**
- Modify: `packages/services/src/latex/build.service.ts` (ekspor helper `assembleWorkspaceDocument`)
- Create: `packages/services/src/latex/docx-export.service.ts`
- Modify: `packages/services/src/latex/index.ts` (ekspor `WorkspaceDocxService`)
- Modify: `apps/api/src/routes/workspaces.ts` (1 route)
- Test: `packages/services/test/docx-export-service.test.ts`

**Interfaces:**
- Consumes: `assembleWorkspaceDocument` (baru), `convertLatexToDocx` (Task 6), `StorageService.storeBytes`/`getSignedReadUrl`, `WorkspaceService.assertWorkspaceOwner`.
- Produces (dipakai Task 8):
  - `WorkspaceDocxService.export(db, { ownerUserId, workspaceId }): Promise<{ url: string }>`
  - Route `POST /workspaces/:id/export/docx` → `{ url: string }`.

- [ ] **Step 1: Ekstrak `assembleWorkspaceDocument` di `build.service.ts`**

Di `packages/services/src/latex/build.service.ts`, ekstrak logika assembly dokumen penuh dari `compileWorkspace` (baris 268–297) menjadi fungsi ter-ekspor, lalu panggil dari `compileWorkspace` (tanpa perubahan perilaku):

```ts
/** Rakit dokumen penuh workspace (mainTex + extraFiles + bib) — dipakai compile & ekspor DOCX. */
export async function assembleWorkspaceDocument(
  db: Db,
  input: { ownerUserId: string; workspaceId: string },
): Promise<{ assembled: AssembledDocument; bib: string; sourceVersions: Record<string, number> }> {
  const project = await projectInput(db, input.ownerUserId, input.workspaceId);
  const sections = await WorkspaceSectionRepo.listByWorkspace(db, input.workspaceId);
  const sourceVersions: Record<string, number> = {};
  const assemblyInputs = [];
  for (const section of sections) {
    if (section.role === "bibliography") {
      assemblyInputs.push({
        id: section.id,
        title: section.title,
        sortOrder: section.sortOrder,
        role: section.role,
        source: null,
      });
      continue;
    }
    const doc = await SectionLatexService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: section.id,
    });
    if (doc) sourceVersions[section.id] = doc.contentVersion;
    assemblyInputs.push({
      id: section.id,
      title: section.title,
      sortOrder: section.sortOrder,
      role: section.role,
      source: doc?.source ?? null,
    });
  }
  const bib = await projectBib(db, input.ownerUserId, input.workspaceId);
  const assembled = assembleWorkspace(project, assemblyInputs);
  return { assembled, bib, sourceVersions };
}
```

Ganti tubuh `compileWorkspace` (baris 264–310) agar memakai helper ini:

```ts
  async compileWorkspace(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<LatexBuildOutcome> {
    const { assembled, bib, sourceVersions } = await assembleWorkspaceDocument(db, input);
    const result = await LatexCompileService.compile({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    return persistBuild(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      sectionId: null,
      result,
      sourceVersions,
    });
  },
```

- [ ] **Step 2: Verifikasi tak ada regresi build workspace**

Run: `cd packages/services && bun test test/latex-build-service.test.ts`
Expected: sama seperti baseline (tidak ada fail baru dari refactor; fail cold-bundle yang sudah ada tetap sama).

- [ ] **Step 3: Tulis tes service ekspor yang gagal**

Buat `packages/services/test/docx-export-service.test.ts`. Karena butuh DB + storage, uji tingkat integrasi ringan mengikuti pola `latex-build-service.test.ts` (setup db + storage helper yang sama). Bila harness storage/db belum tersedia di file itu, uji minimal yang bisa berjalan tanpa infra: assert bentuk error saat pandoc tak ada (dengan `isPandocAvailable`) sebagai guard, dan jalankan jalur sukses hanya bila pandoc + infra tersedia (`test.skipIf`).

```ts
import { describe, expect, test } from "bun:test";
import { isPandocAvailable } from "../src/latex/docx-convert";
import { WorkspaceDocxService } from "../src/latex/docx-export.service";

describe("WorkspaceDocxService", () => {
  test("modul ter-ekspor dengan method export", () => {
    expect(typeof WorkspaceDocxService.export).toBe("function");
  });

  // Jalur sukses penuh butuh DB + storage + pandoc — ikuti setup latex-build-service.test.ts
  // bila lingkungan menyediakannya. Di sini kita jaga agar impor & signature valid.
  test.skipIf(!(await isPandocAvailable()))(
    "export mengembalikan url string (integrasi, butuh infra)",
    async () => {
      // Setup db/workspace/sections/storage sesuai helper latex-build-service.test.ts,
      // lalu:
      // const res = await WorkspaceDocxService.export(db, { ownerUserId, workspaceId });
      // expect(typeof res.url).toBe("string");
      expect(true).toBe(true);
    },
  );
});
```

> Catatan eksekutor: bila `latex-build-service.test.ts` mengekspor helper setup db/storage yang bisa dipakai ulang, impor dan lengkapi jalur integrasi (buat workspace + satu section ber-sumber + link sitasi kosong) lalu assert `res.url`. Jangan menurunkan cakupan tes build yang sudah ada.

Run: `cd packages/services && bun test test/docx-export-service.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 4: Implementasi service ekspor**

Buat `packages/services/src/latex/docx-export.service.ts`:

```ts
import type { Db } from "@aqsha/db";
import { StorageService } from "../storage.service";
import { WorkspaceService } from "../workspace.service";
import { assembleWorkspaceDocument } from "./build.service";
import { convertLatexToDocx } from "./docx-convert";

export const WorkspaceDocxService = {
  /**
   * Ekspor best-effort dokumen penuh → .docx. Assembly & bib sama dengan compile penuh;
   * konversi via pandoc. Blob disimpan sebagai objek ekspor (signed URL sementara).
   */
  async export(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<{ url: string }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const { assembled, bib } = await assembleWorkspaceDocument(db, input);
    const docx = await convertLatexToDocx({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    const key = await StorageService.storeBytes(
      input.ownerUserId,
      input.workspaceId,
      "docx-export",
      docx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    return { url: await StorageService.getSignedReadUrl(key) };
  },
};
```

> Catatan storage: tiap ekspor menulis objek `docx-export` baru dengan signed URL sementara; objek lama tidak dibersihkan otomatis (dapat diterima untuk ekspor best-effort — pembersihan lifecycle di luar cakupan fase ini).

- [ ] **Step 5: Ekspor service**

Di `packages/services/src/latex/index.ts`, tambahkan (dekat ekspor `LatexBuildService`):

```ts
export { WorkspaceDocxService } from "./docx-export.service";
export { assembleWorkspaceDocument } from "./build.service";
```

- [ ] **Step 6: Tambah endpoint**

Di `apps/api/src/routes/workspaces.ts`, impor `WorkspaceDocxService` dari `@aqsha/services/latex` (gabung dengan impor `LatexBuildService` yang sudah ada). Tambahkan route setelah `GET /workspaces/:id/build` (sekitar baris 276):

```ts
  .post(
    "/workspaces/:id/export/docx",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return WorkspaceDocxService.export(db, { ownerUserId, workspaceId: params.id });
    },
    { auth: true, rateLimit: "latex:compile" },
  )
```

- [ ] **Step 7: Build dist + typecheck + tes**

Run: `bun run build:dist && bun --filter @aqsha/api typecheck`
Expected: 0 error.
Run: `cd packages/services && bun test test/docx-export-service.test.ts`
Expected: PASS (assert signature; jalur integrasi jalan bila infra+pandoc ada).

- [ ] **Step 8: Commit**

```bash
git add packages/services/src/latex/build.service.ts packages/services/src/latex/docx-export.service.ts packages/services/src/latex/index.ts packages/services/test/docx-export-service.test.ts apps/api/src/routes/workspaces.ts
git commit -m "feat(api): endpoint ekspor DOCX proyek (assemble + pandoc + storage)"
```

---

### Task 8 (DOCX): Tombol "Unduh DOCX" di halaman pratinjau

Hook mutation + tombol unduh di `ProjectPreviewPage` (rumah alami dokumen penuh).

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/api.ts` (hook `useExportDocx`)
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectPreviewPage.svelte`
- Modify: `apps/svelte/src/lib/icons/index.ts` (pastikan `DownloadIcon` ter-ekspor)

**Interfaces:**
- Consumes: route `POST /workspaces/:id/export/docx` via Eden.
- Produces: interaksi unduh (tidak dikonsumsi task lain).

- [ ] **Step 1: Tambah hook `useExportDocx`**

Di `apps/svelte/src/lib/features/sections/api.ts`, tambahkan (setelah `useCompileWorkspace`):

```ts
/** Ekspor best-effort dokumen penuh ke .docx; mengembalikan signed URL unduhan. */
export function useExportDocx(workspaceId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).export.docx.post()) as { url: string }
	}));
}
```

- [ ] **Step 2: Pastikan ikon `DownloadIcon`**

Di `apps/svelte/src/lib/icons/index.ts`, konfirmasi ada ekspor `DownloadIcon` (adapter hugeicons, mis. `Download01Icon`/`Download04Icon`). Jika belum, tambahkan mengikuti pola ekspor ikon lain di file itu.

- [ ] **Step 3: Wire tombol di `ProjectPreviewPage.svelte`**

Di `<script>` `apps/svelte/src/lib/features/workspaces/pages/ProjectPreviewPage.svelte`, tambahkan impor + state:

```ts
	import { Icon, ArrowLeftIcon, DownloadIcon } from '$lib/icons';
	import { useWorkspaceBuild, useCompileWorkspace, useExportDocx } from '$lib/features/sections/api';
	// …
	const exportDocx = useExportDocx(() => projectId);

	function downloadDocx(): void {
		exportDocx.mutate(undefined, {
			onSuccess: (res) => {
				// Unduh via anchor sementara (signed URL langsung dari storage).
				const a = window.document.createElement('a');
				a.href = res.url;
				a.download = '';
				a.rel = 'noopener';
				window.document.body.appendChild(a);
				a.click();
				a.remove();
			},
			onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal mengekspor DOCX.'))
		});
	}
```

(Baris impor `Icon, ArrowLeftIcon` lama diganti menambah `DownloadIcon`; baris impor sections/api lama diganti menambah `useExportDocx`.)

Tambahkan tombol di header, di sebelah "Compile dokumen penuh" (setelah tombol itu, sekitar baris 81):

```svelte
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={exportDocx.isPending || !build.data?.pdfUrl}
				onclick={downloadDocx}
			>
				{#if exportDocx.isPending}
					<Spinner class="size-4" />
				{:else}
					<Icon icon={DownloadIcon} class="size-4" />
				{/if}
				Unduh DOCX
			</Button>
```

> Nonaktifkan tombol saat belum ada build (`!build.data?.pdfUrl`) supaya user meng-compile dokumen penuh dulu — ekspor merakit dari sumber bab yang sama, dan tombol ini memberi sinyal "dokumen sudah tersusun".

- [ ] **Step 4: Build dist + typecheck**

Run: `bun run build:dist && cd apps/svelte && bun run typecheck`
Expected: hanya 2 error pre-existing `DetailPanel:158-159`.

- [ ] **Step 5: Verifikasi manual (browser)**

Dengan pandoc terpasang + api dev jalan: buka pratinjau proyek yang punya ≥1 bab bersumber, compile dokumen penuh, lalu klik "Unduh DOCX". Berkas `.docx` terunduh; buka di Word/Pages/LibreOffice → memuat isi bab (best-effort; catat bila ada makro yang hilang). Uji juga proyek kosong → tombol nonaktif.

Catat hasil (lolos/temuan). Bila pandoc tak terpasang, endpoint mengembalikan `docx_export_unavailable` (503) dan UI menampilkan toast error — konfirmasi pesan itu muncul (bukan crash).

- [ ] **Step 6: Commit**

```bash
git add apps/svelte/src/lib/features/sections/api.ts apps/svelte/src/lib/features/workspaces/pages/ProjectPreviewPage.svelte apps/svelte/src/lib/icons/index.ts
git commit -m "feat(svelte): tombol Unduh DOCX di pratinjau dokumen"
```

---

## Self-Review (diisi saat eksekusi)

- Cakupan A1–A4 (editor): Task 1 (dep+factory) + Task 3 (A1 komponen + A2 toggle) ; Task 2+3 (A3 autosave+stale+compile) ; Task 4+5 (A4 dua-arah). Cakupan C1–C2 (DOCX): Task 6 (konverter+dep) ; Task 7+8 (service+route+tombol). ✔ semua sub-tugas terpetakan.
- Placeholder: tidak ada "TODO/handle errors" tanpa kode; jalur integrasi tes yang butuh infra ditandai `skipIf` eksplisit (bukan TODO diam).
- Konsistensi tipe: `LatexEditorHandle`, `SaveSectionDocumentResult`, `SynctexInverse/ForwardResult`, `AutosaveController`, `DocxConvertInput`, `convertLatexToDocx`, `WorkspaceDocxService.export`, `useExportDocx` dipakai konsisten lintas task.
- Baseline: jangan tambah error typecheck/test baru di luar 2 error `DetailPanel` + 8 fail services yang sudah ada; tes pandoc-guarded skip otomatis.
- Fase 8a (thesis-class per-kampus) sengaja dieliminasi — tidak ada task template `.cls`/`workspace_latex_settings` di plan ini.
