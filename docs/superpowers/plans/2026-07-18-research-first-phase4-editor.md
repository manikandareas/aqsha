# Research-First Repositioning — Fase 4: Editor Bab SuperDoc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghidupkan loop inti Flow 2: halaman bab `sections/[sectionId]` menjadi editor DOCX SuperDoc — load dari S3 / blank, autosave debounced + `stale_write`, citation pill SDT dari koleksi proyek dengan render citeproc, bibliography read-only, unduh DOCX per bab — plus deliverable kepatuhan AGPL.

**Architecture:** Task 1 = gerbang GO/NO-GO (pasang `superdoc` + wrapper `superdoc-client.ts` + uji template kampus & round-trip SDT — MANUAL GATE user). Backend berikutnya (migration `content_version` → primitives → `SectionDocumentService.saveDocument` union `saved|stale_write` → routes + bibliography → `bun run build:dist`). Lalu frontend svelte: hooks → shell halaman bab → autosave orchestrator → citation pill → deliverables. Semua akses API SuperDoc lewat `superdoc-client.ts` (isolasi API vendor). Spec: `docs/superpowers/specs/2026-07-18-research-first-phase4-editor-design.md`.

**Tech Stack:** Bun 1.3.10, Drizzle ORM, Elysia + t-schema, bun:test (mock/spyOn); SvelteKit (runes-only), Svelte 5, TanStack svelte-query, Eden Treaty, `@aqsha/ui-svelte`, Tailwind v4, `superdoc@1.45.0` (pinned exact).

## Global Constraints

- Selalu `bun` — jangan npm/pnpm/yarn. Migration via `bun run db:generate` + `bun run db:migrate` dari root (gotcha: bila drizzle-kit minta prompt interaktif, jalankan via python pty seperti Fase 1).
- `apps/svelte` TIDAK boleh import `@aqsha/db`/`@aqsha/services` — tipe lokal struktural.
- Sebelum menulis/mengedit file `.svelte`/`.svelte.ts`: invoke skill `svelte-code-writer` dan `svelte-core-bestpractices`. Ikuti pola runes existing (props via `$props()`, getter untuk input reaktif hooks, `$derived`/`$effect` disiplin).
- Navigasi selalu `resolve()` dengan route id ber-group: `resolve('/app/(product)/projects/[projectId]/sections/[sectionId]', { projectId, sectionId })`.
- Error backend: `throwAppError` dari `@aqsha/db` (`code` snake_case + `status`); union return untuk hasil produk disengaja (`stale_write`); frontend: `readableApiErrorMessage`.
- Copy UI bahasa Indonesia sentence case, tanpa all-caps. Enum DB bahasa Inggris.
- Komentar kode: jelaskan *why*, TANPA referensi plan/fase/ticket (aturan `CLAUDE.md`).
- Ikon: pakai export `$lib/icons` existing (daftar di `apps/svelte/src/lib/icons/index.ts`); cek dulu sebelum menambah.
- Grep verifikasi pakai `/usr/bin/grep` (shell `grep` = shim rtk).
- `git add` SELALU per-path eksplisit; review `git status` sebelum tiap commit.
- Verifikasi svelte per task: `cd apps/svelte && bun run check`. **2 error PRE-EXISTING di `DetailPanel.svelte:158-159` — di luar scope, jangan diperbaiki dan jangan dihitung sebagai error task.**
- `bun run typecheck` root: `apps/web` (Next.js) merah by design — jangan diperbaiki.
- Setelah task backend terakhir (Task 4) WAJIB `bun run build:dist` sebelum menyentuh svelte.
- **SuperDoc**: HANYA `superdoc@1.45.0` exact — jangan `2.0.0-next`, jangan `@superdoc-dev/fonts`. API SuperDoc WAJIB diverifikasi terhadap type declarations terpasang (`apps/svelte/node_modules/superdoc/dist/**/*.d.ts`) — jangan mengarang nama API dari ingatan. Seluruh pemakaian SuperDoc lewat `superdoc-client.ts`; komponen/halaman lain tidak boleh import `superdoc` langsung.
- Langkah bertanda **MANUAL GATE** butuh user (browser E2E / file / keputusan) — subagent BERHENTI di situ dan melapor, jangan menandai selesai sendiri.

**Deviasi sadar dari spec (keputusan plan, catat di PR):**
1. **UI locator/prefix/suffix pill DITUNDA** — payload SDT sudah menyimpan slotnya (`CitationFieldPayload`), insert Fase 4 tanpa locator.
2. **`contentVersion` awal dibaca client dari `GET /artifacts/:id`** (kolom baru otomatis ikut `$inferSelect`), bukan dari render-payload.
3. **Editor v0 + gerbang GO/NO-GO dibangun langsung di halaman bab** (bukan route spike terpisah) — hasil gerbang adalah fondasi task berikutnya.
4. **Panel Sumber di halaman bab TIDAK difilter otomatis ke bab** — reuse `ProjectSidePanel` utuh (penandaan bab per sumber sudah ada di panel); filter menyusul.
5. **Endpoint save TANPA rateLimit** — autosave debounced akan tersandung limiter; proteksi = auth + ownership + cap ukuran.
6. **`reconcileDocument` direfactor jadi delegasi `reconcileClusters`** — satu jalur tulis `document_citation_usages` untuk BlockNote lama dan SuperDoc.
7. **"Unduh DOCX" dari dalam editor memakai state terkini** (`export()` client-side), bukan byte S3 tersimpan.

---

### Task 1: Svelte — superdoc + `superdoc-client` + editor v0 + GERBANG GO/NO-GO

**Files:**
- Modify: `apps/svelte/package.json` (dependency baru)
- Create: `apps/svelte/src/lib/features/sections/superdoc-client.ts`
- Create: `apps/svelte/src/lib/features/sections/components/SectionDocumentEditor.svelte`
- Modify: `apps/svelte/src/routes/app/(product)/projects/[projectId]/sections/[sectionId]/+page.svelte`
- Create: `apps/svelte/test-fixtures/template-kampus.docx` (dari user, MANUAL GATE)

**Interfaces:**
- Produces (dipakai Task 6–8):
  - `type CitationFieldPayload = { citationIds: string[]; locator?: string; label?: string; prefix?: string; suffix?: string }`
  - `encodeCitationAlias(payload): string` / `decodeCitationAlias(alias): CitationFieldPayload | null`
  - `mountSectionEditor(opts: { editorEl: HTMLElement; toolbarEl: HTMLElement | null; documentUrl: string | null; fileName: string; onReady: () => void; onUpdate: () => void }): Promise<SectionEditorHandle>`
  - `SectionEditorHandle = { exportDocx(): Promise<Blob>; insertCitation(nodeId: string, payload: CitationFieldPayload, text: string): void; listCitations(): Array<{ nodeId: string; payload: CitationFieldPayload }>; updateCitationText(nodeId: string, text: string): void; destroy(): void }`
  - `SectionDocumentEditor.svelte` props: `{ documentUrl: string | null; fileName: string; onHandle: (h: SectionEditorHandle) => void; onUpdate: () => void }`

- [ ] **Step 1: Install dependency (pinned exact)**

Run: `cd apps/svelte && bun add --exact superdoc@1.45.0 && cd ../..`
Expected: `apps/svelte/package.json` memuat `"superdoc": "1.45.0"` (tanpa `^`).

- [ ] **Step 2: Verifikasi API terpasang (WAJIB sebelum menulis wrapper)**

Run dan CATAT hasilnya (dipakai menyesuaikan Step 3):
```bash
ls apps/svelte/node_modules/superdoc/dist
/usr/bin/grep -rn "documentMode\|onEditorUpdate\|onReady\|pagination\|toolbar" apps/svelte/node_modules/superdoc/dist --include='*.d.ts' -l | head
/usr/bin/grep -rn "insertStructuredContentInline\|updateStructuredContentById\|getStructuredContentTags" apps/svelte/node_modules/superdoc/dist --include='*.d.ts' | head
/usr/bin/grep -rn "export(" apps/svelte/node_modules/superdoc/dist --include='*.d.ts' | head -5
```
Yang harus dikonfirmasi: (a) nama config init (`selector`, `document`, `documentMode`, `toolbar`, `pagination`, callback ready/update); (b) `superdoc.export({ triggerDownload: false })` → `Promise<Blob>`; (c) commands structured content inline + helper `getStructuredContentTags` + shape attrs (`id`, `alias`); (d) init TANPA `document` = dokumen blank. Bila nama di d.ts beda dari kode Step 3, IKUTI d.ts dan sesuaikan — jangan memaksakan nama dari plan.

- [ ] **Step 3: `superdoc-client.ts`**

```ts
/**
 * Satu-satunya modul yang menyentuh API `superdoc` — halaman/komponen lain memakai
 * `SectionEditorHandle` agar perubahan API vendor terkurung di sini. Dimuat dynamic
 * (butuh DOM; chunk besar hanya terunduh di route editor).
 */

export type CitationFieldPayload = {
	citationIds: string[];
	locator?: string;
	label?: string;
	prefix?: string;
	suffix?: string;
};

// Payload sitasi hidup di `alias` SDT (round-trip DOCX native). Prefix membedakan
// pill sitasi dari SDT lain yang mungkin ada di template kampus.
const CITATION_ALIAS_PREFIX = 'aqsha-citation:';

export function encodeCitationAlias(payload: CitationFieldPayload): string {
	return `${CITATION_ALIAS_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeCitationAlias(
	alias: string | null | undefined
): CitationFieldPayload | null {
	if (!alias || !alias.startsWith(CITATION_ALIAS_PREFIX)) return null;
	try {
		const parsed = JSON.parse(alias.slice(CITATION_ALIAS_PREFIX.length)) as CitationFieldPayload;
		return Array.isArray(parsed?.citationIds) && parsed.citationIds.length > 0 ? parsed : null;
	} catch {
		return null;
	}
}

export type SectionEditorHandle = {
	exportDocx(): Promise<Blob>;
	insertCitation(nodeId: string, payload: CitationFieldPayload, text: string): void;
	listCitations(): Array<{ nodeId: string; payload: CitationFieldPayload }>;
	updateCitationText(nodeId: string, text: string): void;
	destroy(): void;
};

export async function mountSectionEditor(opts: {
	editorEl: HTMLElement;
	toolbarEl: HTMLElement | null;
	documentUrl: string | null;
	fileName: string;
	onReady: () => void;
	onUpdate: () => void;
}): Promise<SectionEditorHandle> {
	const { SuperDoc } = await import('superdoc');
	await import('superdoc/style.css');

	const superdoc = new SuperDoc({
		selector: opts.editorEl,
		...(opts.toolbarEl ? { toolbar: opts.toolbarEl } : {}),
		...(opts.documentUrl ? { document: opts.documentUrl } : {}),
		documentMode: 'editing',
		pagination: true,
		onReady: opts.onReady,
		onEditorUpdate: opts.onUpdate
	});

	const editor = () => superdoc.activeEditor;

	return {
		async exportDocx() {
			return (await superdoc.export({ triggerDownload: false })) as Blob;
		},
		insertCitation(nodeId, payload, text) {
			editor()?.commands.insertStructuredContentInline({
				attrs: { id: nodeId, alias: encodeCitationAlias(payload), lockMode: 'contentLocked' },
				text
			});
		},
		listCitations() {
			const ed = editor();
			if (!ed) return [];
			const tags = ed.helpers.structuredContentCommands.getStructuredContentTags(ed.state);
			const out: Array<{ nodeId: string; payload: CitationFieldPayload }> = [];
			for (const tag of tags) {
				const payload = decodeCitationAlias(tag.node?.attrs?.alias);
				const nodeId = tag.node?.attrs?.id;
				if (payload && typeof nodeId === 'string' && nodeId) out.push({ nodeId, payload });
			}
			return out;
		},
		updateCitationText(nodeId, text) {
			editor()?.commands.updateStructuredContentById(nodeId, { text });
		},
		destroy() {
			superdoc.destroy();
		}
	};
}
```

Sesuaikan dengan temuan Step 2: nama option init, `lockMode` yang tersedia (isi pill tidak boleh diedit manual tapi pill harus bisa dihapus utuh — pilih mode yang memenuhi itu), shape return `getStructuredContentTags` (field `node`/`attrs`/posisi), dan cara akses `helpers`. Bila `onEditorUpdate` tidak ada di config, subscribe `superdoc.activeEditor.on('update', opts.onUpdate)` di dalam `onReady`.

- [ ] **Step 4: `SectionDocumentEditor.svelte` (v0)**

Invoke skill `svelte-code-writer` + `svelte-core-bestpractices` dulu.

```svelte
<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { toast } from 'svelte-sonner';
	import {
		mountSectionEditor,
		type SectionEditorHandle
	} from '../superdoc-client';

	/** Frame SuperDoc: mount async client-only, destroy saat unmount. Logika save/citation milik pemanggil via `onHandle`. */
	let {
		documentUrl,
		fileName,
		onHandle,
		onUpdate
	}: {
		documentUrl: string | null;
		fileName: string;
		onHandle: (h: SectionEditorHandle) => void;
		onUpdate: () => void;
	} = $props();

	let handle = $state<SectionEditorHandle | null>(null);
	let mountError = $state<string | null>(null);
	let ready = $state(false);
	let toolbarEl = $state<HTMLElement | null>(null);

	// DEV-only: muat DOCX lokal (uji template kampus) + uji round-trip SDT.
	async function devLoadFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		window.open(URL.createObjectURL(file), '_self');
	}

	async function devRoundTrip() {
		if (!handle) return;
		const nodeId = crypto.randomUUID();
		handle.insertCitation(nodeId, { citationIds: ['dev-citation'] }, '(Uji, 2026)');
		const blob = await handle.exportDocx();
		const probeEl = document.createElement('div');
		probeEl.style.display = 'none';
		document.body.appendChild(probeEl);
		const probe = await mountSectionEditor({
			editorEl: probeEl,
			toolbarEl: null,
			documentUrl: URL.createObjectURL(blob),
			fileName: 'roundtrip.docx',
			onReady: () => {
				const found = probe.listCitations().some((c) => c.nodeId === nodeId);
				toast[found ? 'success' : 'error'](
					found ? 'Round-trip SDT utuh' : 'Round-trip SDT GAGAL — attrs hilang'
				);
				probe.destroy();
				probeEl.remove();
			},
			onUpdate: () => {}
		});
	}

	function attachEditor(el: HTMLElement) {
		let disposed = false;
		void mountSectionEditor({
			editorEl: el,
			toolbarEl,
			documentUrl,
			fileName,
			onReady: () => {
				if (disposed) return;
				ready = true;
			},
			onUpdate
		})
			.then((h) => {
				if (disposed) {
					h.destroy();
					return;
				}
				handle = h;
				onHandle(h);
			})
			.catch((err: unknown) => {
				mountError = err instanceof Error ? err.message : 'Editor gagal dimuat.';
			});
		return () => {
			disposed = true;
			handle?.destroy();
			handle = null;
		};
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	{#if dev}
		<div class="flex items-center gap-2 border-b border-border px-3 py-1.5 text-label">
			<input type="file" accept=".docx" onchange={devLoadFile} aria-label="Muat DOCX uji" />
			<Button type="button" variant="outline" size="sm" onclick={devRoundTrip} disabled={!ready}>
				Uji round-trip SDT
			</Button>
		</div>
	{/if}
	<div bind:this={toolbarEl} class="shrink-0 border-b-2 border-border"></div>
	{#if mountError}
		<p class="p-6 text-sm text-destructive">{mountError}</p>
	{:else if browser}
		<div class="min-h-0 flex-1 overflow-y-auto bg-muted/30" {@attach attachEditor}></div>
	{/if}
</div>
```

Catatan implementasi: `devLoadFile` di atas memakai objectURL + reload — bila canggung saat implementasi, ganti dengan re-mount `SectionDocumentEditor` ber-`documentUrl` objectURL via state di halaman (pilih yang paling sederhana yang jalan; tujuannya HANYA memuat file template uji di dev). Pastikan pola `{@attach}` mengikuti idiom repo (lihat pemakaian existing di composer). Di `devRoundTrip`, callback `onReady` bisa menembak SEBELUM `await mountSectionEditor` resolve (variabel `probe` belum terisi) — bila terjadi, tampung handle via variabel `let probe: SectionEditorHandle | null` yang diisi dari resolve dan lakukan pengecekan round-trip setelah KEDUANYA siap (flag ganda / polling kecil); kode dev-only, kejelasan > keanggunan.

- [ ] **Step 5: Wire halaman bab (minimal, non-bibliography)**

Di `apps/svelte/src/routes/app/(product)/projects/[projectId]/sections/[sectionId]/+page.svelte`, ganti blok placeholder `{:else}` (div dashed "Editor dokumen … hadir di pembaruan berikutnya") menjadi:

```svelte
<div class="flex min-h-0 flex-1 flex-col rounded-lg border-2 border-border bg-card">
	<SectionDocumentEditor
		documentUrl={null}
		fileName={`${section.title}.docx`}
		onHandle={() => {}}
		onUpdate={() => {}}
	/>
</div>
```

- Import `SectionDocumentEditor from '$lib/features/sections/components/SectionDocumentEditor.svelte'`.
- Cabang `role === 'bibliography'` TIDAK berubah di task ini.
- Kontainer halaman butuh tinggi penuh: ganti class root halaman menjadi `class="mx-auto flex h-svh min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden px-6 py-8"` (editor punya scroll internal).
- `documentUrl={null}` = blank doc; load dokumen tersimpan datang di Task 6.

- [ ] **Step 6: Check**

Run: `cd apps/svelte && bun run check && cd ../..`
Expected: bersih (minus 2 pre-existing DetailPanel).

- [ ] **Step 7: MANUAL GATE — GO/NO-GO fidelity + round-trip (user)**

BERHENTI dan minta user menjalankan `bun run dev:web` (atau dev svelte) lalu di halaman satu bab:
1. Sediakan file template skripsi kampus nyata → simpan sebagai `apps/svelte/test-fixtures/template-kampus.docx` (dikomit sebagai fixture regresi).
2. Muat file itu via input dev; periksa: margin halaman, header/footer, nomor halaman, pagination visual, heading/typografi tidak rusak parah.
3. Klik "Uji round-trip SDT" → harus toast "Round-trip SDT utuh".
4. Ekspor (via tombol uji round-trip sudah mencakup export→import); buka hasil export di Word/LibreOffice → dokumen tetap sehat.

Hasil dicatat di sini: `GO / NO-GO + catatan fidelity`. **NO-GO → STOP seluruh plan, eskalasi ke user (fallback OnlyOffice dievaluasi ulang sesuai spec).**

- [ ] **Step 8: Commit**

```bash
git add apps/svelte/package.json bun.lock apps/svelte/src/lib/features/sections apps/svelte/test-fixtures/template-kampus.docx "apps/svelte/src/routes/app/(product)/projects/[projectId]/sections/[sectionId]/+page.svelte"
git commit -m "feat(svelte): mount superdoc section editor v0 behind go/no-go gate"
```

---

### Task 2: Backend — migration `content_version` + primitives storage/usages

**Files:**
- Modify: `packages/db/src/schema/artifacts.ts`
- Create: `packages/db/migrations/00XX_*.sql` (via drizzle-kit)
- Modify: `packages/services/src/storage.service.ts`
- Modify: `packages/services/src/citations/citation-usages.ts`
- Test: create `packages/services/test/citation-usages-clusters.test.ts`

**Interfaces:**
- Produces (dipakai Task 3):
  - Kolom `artifacts.content_version` integer nullable (`contentVersion` di `$inferSelect`).
  - `StorageService.overwriteBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void>`
  - `CitationUsageService.reconcileClusters(db, { ownerUserId, workspaceId, documentArtifactId, clusters: ParsedCitationCluster[] }): Promise<void>` — `ParsedCitationCluster = { nodeId: string; citationIds: string[]; locator: CitationLocator }` (export existing).

- [ ] **Step 1: Schema — kolom versi**

Di `packages/db/src/schema/artifacts.ts`: tambah `integer` ke import `drizzle-orm/pg-core`, lalu setelah kolom `storageR2Key`:

```ts
    // Versi konten dokumen authored (DOCX bab): +1 tiap save, guard stale_write.
    // Null untuk artifact non-authored (upload/url/markdown lama).
    contentVersion: integer("content_version"),
```

- [ ] **Step 2: Generate + migrate**

Run: `bun run db:generate` → BACA SQL: harus `ALTER TABLE "artifacts" ADD COLUMN "content_version" integer;` saja. Lalu `bun run db:migrate` → exit 0.

- [ ] **Step 3: `StorageService.overwriteBytes`**

Di `packages/services/src/storage.service.ts`, setelah `storeBytes`:

```ts
  /** Timpa blob pada key existing (save dokumen bab — pointer artifact tetap stabil). */
  async overwriteBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await s3.putObject(key, bytes, contentType);
  },
```

- [ ] **Step 4: Failing test `reconcileClusters`**

`packages/services/test/citation-usages-clusters.test.ts` (pola mock `artifact-service.test.ts` — tanpa DB nyata):

```ts
import { CitationRepo, DocumentCitationUsageRepo } from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

const { CitationUsageService } = await import("../src/citations/citation-usages");

const fakeDb = {} as never;

afterEach(() => {
  mock.restore();
});

describe("CitationUsageService.reconcileClusters", () => {
  test("menulis usage berurutan hanya untuk citation valid milik owner", async () => {
    spyOn(CitationRepo, "findByIds").mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
    const replace = spyOn(DocumentCitationUsageRepo, "replaceForDocument").mockResolvedValue(
      undefined as never,
    );

    await CitationUsageService.reconcileClusters(fakeDb, {
      ownerUserId: "u",
      workspaceId: "w",
      documentArtifactId: "doc",
      clusters: [
        { nodeId: "n1", citationIds: ["c1", "missing"], locator: { locator: "12" } },
        { nodeId: "n2", citationIds: ["c2"], locator: {} },
      ],
    });

    const arg = replace.mock.calls[0]?.[1] as { rows: Array<Record<string, unknown>> };
    expect(arg.rows.map((r) => [r.citationId, r.inlineNodeId, r.occurrenceOrder])).toEqual([
      ["c1", "n1", 0],
      ["c2", "n2", 1],
    ]);
    expect(arg.rows[0]?.locatorJson).toEqual({ locator: "12" });
    expect(arg.rows[1]?.locatorJson).toBeNull();
  });

  test("clusters kosong tetap replace (menghapus usage lama)", async () => {
    const replace = spyOn(DocumentCitationUsageRepo, "replaceForDocument").mockResolvedValue(
      undefined as never,
    );
    await CitationUsageService.reconcileClusters(fakeDb, {
      ownerUserId: "u",
      workspaceId: "w",
      documentArtifactId: "doc",
      clusters: [],
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
```

Run: `cd packages/services && bun test test/citation-usages-clusters.test.ts && cd ../..`
Expected: FAIL — `reconcileClusters is not a function`.

- [ ] **Step 5: Refactor `citation-usages.ts` — `reconcileClusters` + delegasi**

Ganti body `CitationUsageService` menjadi dua method (logika row-building PINDAH utuh dari `reconcileDocument` — jangan duplikat):

```ts
export const CitationUsageService = {
  /** Rekonsiliasi dari cluster yang SUDAH di-parse (editor DOCX mengirim cluster langsung). */
  async reconcileClusters(
    db: Db | DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      documentArtifactId: string;
      clusters: ParsedCitationCluster[];
    },
  ): Promise<void> {
    const referencedIds = [...new Set(input.clusters.flatMap((c) => c.citationIds))];

    let validIds = new Set<string>();
    if (referencedIds.length > 0) {
      // Perpustakaan global per akun: cukup owner yang cocok (dokumen boleh memakai
      // item mana pun milik owner, koleksi proyek hanyalah view).
      const rows = await CitationRepo.findByIds(db, input.ownerUserId, referencedIds);
      validIds = new Set(rows.map((r) => r.id));
    }

    const now = Date.now();
    const rows: NewDocumentCitationUsage[] = [];
    let order = 0;
    for (const cluster of input.clusters) {
      for (const citationId of cluster.citationIds) {
        if (!validIds.has(citationId)) continue;
        rows.push({
          id: crypto.randomUUID(),
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
          documentArtifactId: input.documentArtifactId,
          citationId,
          inlineNodeId: cluster.nodeId || null,
          occurrenceOrder: order,
          locatorJson: hasLocatorData(cluster.locator) ? cluster.locator : null,
          createdAt: now,
          updatedAt: now,
        });
        order += 1;
      }
    }

    await DocumentCitationUsageRepo.replaceForDocument(db, {
      ownerUserId: input.ownerUserId,
      documentArtifactId: input.documentArtifactId,
      rows,
    });
  },

  /** Jalur BlockNote lama: parse blocksJson lalu delegasi ke reconcileClusters. */
  async reconcileDocument(
    db: Db | DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      documentArtifactId: string;
      blocksJson: string | null | undefined;
    },
  ): Promise<void> {
    await this.reconcileClusters(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      documentArtifactId: input.documentArtifactId,
      clusters: extractCitationClusters(input.blocksJson),
    });
  },
};
```

Doc comment lama `reconcileDocument` (idempotent replace-all, FK aman) pindah ke `reconcileClusters`.

- [ ] **Step 6: Test + typecheck + commit**

Run:
```bash
cd packages/db && bunx tsc --noEmit -p tsconfig.json && cd ../..
cd packages/services && bunx tsc --noEmit -p tsconfig.json && bun test test/citation-usages-clusters.test.ts && bun test && cd ../..
```
Expected: PASS semua (suite lain tak tersentuh perilakunya).

```bash
git add packages/db/src/schema/artifacts.ts packages/db/migrations packages/services/src/storage.service.ts packages/services/src/citations/citation-usages.ts packages/services/test/citation-usages-clusters.test.ts
git commit -m "feat(db): artifact content_version + cluster-level citation usage reconcile"
```

---

### Task 3: Backend — `SectionDocumentService.saveDocument` (TDD)

**Files:**
- Create: `packages/services/src/section-document.service.ts`
- Modify: `packages/services/src/index.ts` (export barrel — cek dulu pola exportnya)
- Test: create `packages/services/test/section-document.test.ts`

**Interfaces:**
- Consumes: Task 2 (`overwriteBytes`, `reconcileClusters`, `contentVersion`); existing `SectionService.assertSectionOwner`, `StorageService.storeBytes`, `extractStoredDocument` (`packages/services/src/artifacts/extract.ts:117`), `previewFromText` + `MAX_UPLOAD_BYTES` (`packages/services/src/artifacts/model.ts`), repo `ArtifactRepo`/`ArtifactContentRepo`/`WorkspaceSectionRepo`.
- Produces (dipakai Task 4):
  - `type SaveSectionDocumentResult = { status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: SectionStatus } | { status: 'stale_write'; currentVersion: number }`
  - `SectionDocumentService.saveDocument(db: Db, input: { ownerUserId: string; sectionId: string; bytes: Uint8Array; fileName: string; baseVersion?: number; clusters: ParsedCitationCluster[] }): Promise<SaveSectionDocumentResult>`
  - `parseClustersJson(raw: string | undefined): ParsedCitationCluster[]` (throw `document_clusters_invalid` 422 bila JSON/shape rusak — jangan diam-diam `[]`, itu akan MENGHAPUS semua usages).

- [ ] **Step 1: Failing tests**

`packages/services/test/section-document.test.ts` — pola mock `artifact-service.test.ts` (fakeDb + spyOn, tanpa DB/S3 nyata):

```ts
import {
  ArtifactContentRepo,
  ArtifactRepo,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

const { SectionDocumentService, parseClustersJson } = await import(
  "../src/section-document.service"
);
const { SectionService } = await import("../src/section.service");
const { StorageService } = await import("../src/storage.service");
const { CitationUsageService } = await import("../src/citations/citation-usages");

const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;

const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function makeSection(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    workspaceId: "w1",
    title: "Bab 1",
    sortOrder: 0,
    status: "empty",
    role: null,
    documentArtifactId: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as never;
}

function makeDocArtifact(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    ownerUserId: "u1",
    workspaceId: "w1",
    artifactType: "docx",
    status: "active",
    storageR2Key: "artifacts/u1/a1/docx-x",
    contentVersion: 3,
    ...over,
  } as never;
}

afterEach(() => {
  mock.restore();
});

function spyCommon() {
  spyOn(CitationUsageService, "reconcileClusters").mockResolvedValue(undefined as never);
  spyOn(StorageService, "storeBytes").mockResolvedValue("artifacts/u1/new/docx-key" as never);
  spyOn(StorageService, "overwriteBytes").mockResolvedValue(undefined as never);
}

describe("SectionDocumentService.saveDocument", () => {
  test("save pertama: buat artifact docx, link section, empty→draft, versi 1", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(makeSection());
    const artifactInsert = spyOn(ArtifactRepo, "insert").mockResolvedValue(undefined as never);
    spyOn(ArtifactContentRepo, "insert").mockResolvedValue(undefined as never);
    const sectionUpdate = spyOn(WorkspaceSectionRepo, "update").mockResolvedValue(
      undefined as never,
    );

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      clusters: [],
    });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error("unreachable");
    expect(result.contentVersion).toBe(1);
    expect(result.sectionStatus).toBe("draft");
    const inserted = artifactInsert.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(inserted.artifactType).toBe("docx");
    expect(inserted.source).toBe("manual");
    expect(inserted.contentVersion).toBe(1);
    const patch = sectionUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(patch.documentArtifactId).toBe(inserted.id);
    expect(patch.status).toBe("draft");
  });

  test("save pertama pada section non-empty TIDAK mengubah status", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ status: "in_review" }),
    );
    spyOn(ArtifactRepo, "insert").mockResolvedValue(undefined as never);
    spyOn(ArtifactContentRepo, "insert").mockResolvedValue(undefined as never);
    const sectionUpdate = spyOn(WorkspaceSectionRepo, "update").mockResolvedValue(
      undefined as never,
    );

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      clusters: [],
    });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error("unreachable");
    expect(result.sectionStatus).toBe("in_review");
    const patch = sectionUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect("status" in patch).toBe(false);
  });

  test("save berikutnya versi cocok: overwrite + bump versi", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ status: "draft", documentArtifactId: "a1" }),
    );
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeDocArtifact());
    const artifactUpdate = spyOn(ArtifactRepo, "update").mockResolvedValue(undefined as never);
    spyOn(ArtifactContentRepo, "findByArtifact").mockResolvedValue({ id: "ct1" } as never);
    spyOn(ArtifactContentRepo, "update").mockResolvedValue(undefined as never);

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      baseVersion: 3,
      clusters: [],
    });

    expect(result).toMatchObject({ status: "saved", artifactId: "a1", contentVersion: 4 });
    expect(StorageService.overwriteBytes).toHaveBeenCalledWith(
      "artifacts/u1/a1/docx-x",
      DOCX_BYTES,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const patch = artifactUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(patch.contentVersion).toBe(4);
  });

  test("versi tak cocok → stale_write tanpa menulis apa pun", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ status: "draft", documentArtifactId: "a1" }),
    );
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeDocArtifact({ contentVersion: 5 }));

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      baseVersion: 3,
      clusters: [],
    });

    expect(result).toEqual({ status: "stale_write", currentVersion: 5 });
    expect(StorageService.overwriteBytes).not.toHaveBeenCalled();
  });

  test("section punya dokumen tapi baseVersion absen → stale_write (client out of sync)", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ documentArtifactId: "a1" }),
    );
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeDocArtifact({ contentVersion: 2 }));

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      clusters: [],
    });
    expect(result).toEqual({ status: "stale_write", currentVersion: 2 });
  });

  test("section bibliography ditolak", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ role: "bibliography" }),
    );
    await expect(
      SectionDocumentService.saveDocument(fakeDb, {
        ownerUserId: "u1",
        sectionId: "s1",
        bytes: DOCX_BYTES,
        fileName: "x.docx",
        clusters: [],
      }),
    ).rejects.toMatchObject({ payload: { code: "bibliography_not_editable" } });
  });
});

describe("parseClustersJson", () => {
  test("undefined/kosong → []", () => {
    expect(parseClustersJson(undefined)).toEqual([]);
    expect(parseClustersJson("")).toEqual([]);
  });
  test("shape valid → clusters", () => {
    const raw = JSON.stringify([
      { nodeId: "n1", citationIds: ["c1"], locator: { locator: "3" } },
    ]);
    expect(parseClustersJson(raw)).toEqual([
      { nodeId: "n1", citationIds: ["c1"], locator: { locator: "3" } },
    ]);
  });
  test("JSON rusak / shape salah → throw document_clusters_invalid", () => {
    expect(() => parseClustersJson("{not json")).toThrow();
    expect(() => parseClustersJson(JSON.stringify([{ nope: true }]))).toThrow();
  });
});
```

Catatan: bentuk assertion error `rejects.toMatchObject({ payload: ... })` mengikuti bagaimana `AppError` menyimpan payload — cek `packages/db/src/appError.ts` dan pola assertion di `artifact-service.test.ts`, sesuaikan bila beda (mis. `.toThrow(AppError)` + cek `code`).

Run: `cd packages/services && bun test test/section-document.test.ts && cd ../..`
Expected: FAIL — module belum ada.

- [ ] **Step 2: Implementasi `section-document.service.ts`**

```ts
import {
  ArtifactContentRepo,
  ArtifactRepo,
  type Db,
  type SectionStatus,
  throwAppError,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { extractStoredDocument } from "./artifacts/extract";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, previewFromText } from "./artifacts/model";
import { CitationUsageService, type ParsedCitationCluster } from "./citations/citation-usages";
import { SectionService } from "./section.service";
import { StorageService } from "./storage.service";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type SaveSectionDocumentResult =
  | { status: "saved"; artifactId: string; contentVersion: number; sectionStatus: SectionStatus }
  | { status: "stale_write"; currentVersion: number };

/**
 * Parse clusters sitasi kiriman editor. JSON/shape rusak = error keras — fallback []
 * akan MENGHAPUS seluruh usage dokumen secara senyap saat reconcile.
 */
export function parseClustersJson(raw: string | undefined): ParsedCitationCluster[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.every(
      (c) =>
        typeof (c as ParsedCitationCluster)?.nodeId === "string" &&
        Array.isArray((c as ParsedCitationCluster)?.citationIds),
    );
  if (!valid) {
    throwAppError({
      message: "Data sitasi dokumen tidak valid",
      code: "document_clusters_invalid",
      severity: "warning",
      status: 422,
    });
  }
  return (parsed as ParsedCitationCluster[]).map((c) => ({
    nodeId: c.nodeId,
    citationIds: c.citationIds.filter((id) => typeof id === "string" && id),
    locator: c.locator ?? {},
  }));
}

/** Ekstrak plain text DOCX untuk preview/pencarian — kegagalan tidak boleh menggagalkan save. */
async function safeExtractPlainText(bytes: Uint8Array, fileName: string): Promise<string | null> {
  try {
    const extracted = await extractStoredDocument(bytes, fileName, DOCX_MIME);
    return extracted.plainText;
  } catch (err) {
    console.error("[section-document] plain text extraction failed", err);
    return null;
  }
}

export const SectionDocumentService = {
  /**
   * Simpan DOCX satu bab. Lazy-create: artifact baru lahir di save pertama
   * (buka-lalu-pergi tidak meninggalkan artifact kosong). Versi optimistic:
   * `baseVersion` wajib cocok dengan `contentVersion` tersimpan → selain itu
   * `stale_write` (union — tab lain sudah menulis; UI menawarkan muat ulang).
   */
  async saveDocument(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      bytes: Uint8Array;
      fileName: string;
      baseVersion?: number;
      clusters: ParsedCitationCluster[];
    },
  ): Promise<SaveSectionDocumentResult> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (section.role === "bibliography") {
      throwAppError({
        message: "Daftar pustaka digenerate otomatis dan tidak bisa diedit",
        code: "bibliography_not_editable",
        severity: "warning",
        status: 422,
      });
    }
    if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throwAppError({
        message: `Dokumen terlalu besar. Maksimum ${MAX_UPLOAD_MB} MB.`,
        code: "document_too_large",
        severity: "warning",
        status: 413,
      });
    }

    const now = Date.now();
    const plainText = await safeExtractPlainText(input.bytes, input.fileName);

    if (!section.documentArtifactId) {
      // Save pertama — blob ditulis sebelum tx (key butuh artifactId; tx gagal →
      // blob orphan, konsisten dengan pendekatan best-effort deleteStaleR2Keys).
      const artifactId = crypto.randomUUID();
      const key = await StorageService.storeBytes(
        input.ownerUserId,
        artifactId,
        "docx",
        input.bytes,
        DOCX_MIME,
      );
      const nextStatus: SectionStatus = section.status === "empty" ? "draft" : section.status;
      await db.transaction(async (tx) => {
        await ArtifactRepo.insert(tx, {
          id: artifactId,
          ownerUserId: input.ownerUserId,
          workspaceId: section.workspaceId,
          folderId: null,
          threadId: null,
          artifactType: "docx",
          artifactFamily: "file",
          source: "manual",
          title: section.title,
          language: null,
          mimeType: DOCX_MIME,
          fileName: input.fileName,
          byteSize: input.bytes.byteLength,
          indexingStatus: "not_indexed",
          indexingFailureReason: null,
          detectedDocumentKind: null,
          storageR2Key: key,
          ragEntryId: null,
          plainTextPreview: plainText ? previewFromText(plainText) : "",
          indexedAt: null,
          contentVersion: 1,
          status: "active",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await ArtifactContentRepo.insert(tx, {
          id: crypto.randomUUID(),
          ownerUserId: input.ownerUserId,
          workspaceId: section.workspaceId,
          threadId: null,
          artifactId,
          blocksJson: null,
          markdown: "",
          plainText: plainText ?? "",
          contextText: "",
          plainTextR2Key: null,
          blocksJsonR2Key: null,
          markdownR2Key: null,
          createdAt: now,
          updatedAt: now,
        });
        await WorkspaceSectionRepo.update(tx, section.id, {
          documentArtifactId: artifactId,
          updatedAt: now,
          ...(section.status === "empty" ? { status: "draft" as const } : {}),
        });
        await CitationUsageService.reconcileClusters(tx, {
          ownerUserId: input.ownerUserId,
          workspaceId: section.workspaceId,
          documentArtifactId: artifactId,
          clusters: input.clusters,
        });
      });
      return { status: "saved", artifactId, contentVersion: 1, sectionStatus: nextStatus };
    }

    // Save berikutnya — guard versi lalu timpa blob di key yang sama.
    const artifact = await ArtifactRepo.findById(db, section.documentArtifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== input.ownerUserId ||
      artifact.status !== "active" ||
      artifact.artifactType !== "docx" ||
      !artifact.storageR2Key
    ) {
      throwAppError({
        message: "Dokumen bab tidak ditemukan",
        code: "section_document_not_found",
        severity: "error",
        status: 404,
      });
    }
    const currentVersion = artifact.contentVersion ?? 0;
    if (input.baseVersion === undefined || input.baseVersion !== currentVersion) {
      return { status: "stale_write", currentVersion };
    }

    await StorageService.overwriteBytes(artifact.storageR2Key, input.bytes, DOCX_MIME);
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, artifact.id, {
        byteSize: input.bytes.byteLength,
        fileName: input.fileName,
        contentVersion: currentVersion + 1,
        ...(plainText !== null ? { plainTextPreview: previewFromText(plainText) } : {}),
        updatedAt: now,
      });
      if (plainText !== null) {
        const content = await ArtifactContentRepo.findByArtifact(
          tx,
          input.ownerUserId,
          artifact.id,
        );
        if (content) {
          await ArtifactContentRepo.update(tx, content.id, {
            plainText,
            plainTextR2Key: null,
            updatedAt: now,
          });
        }
      }
      await CitationUsageService.reconcileClusters(tx, {
        ownerUserId: input.ownerUserId,
        workspaceId: section.workspaceId,
        documentArtifactId: artifact.id,
        clusters: input.clusters,
      });
    });
    return {
      status: "saved",
      artifactId: artifact.id,
      contentVersion: currentVersion + 1,
      sectionStatus: section.status as SectionStatus,
    };
  },
};
```

Verifikasi dulu signature repo yang dipakai (`/usr/bin/grep -n "async \(update\|findByArtifact\|insert\|findById\)" packages/db/src/repositories/artifactRepo.ts packages/db/src/repositories/artifactContentRepo.ts`) — sesuaikan nama parameter patch bila beda. Bila `plainText` melebihi `ARTIFACT_BODY_INLINE_LIMIT`, ikuti pola offload `maybeOffloadText` seperti di `ArtifactService.updateDocument` (baca L1442+ bila perlu) — tambahkan cabang offload bila `ArtifactContentRepo.update` menolak teks besar; kalau tidak ada constraint, inline apa adanya cukup (kolom text).

- [ ] **Step 3: Export barrel**

Cek: `/usr/bin/grep -n "section.service\|artifact.service" packages/services/src/index.ts` → tambahkan baris export `section-document.service` mengikuti pola file itu (mis. `export * from "./section-document.service";`).

- [ ] **Step 4: Test hijau + commit**

Run:
```bash
cd packages/services && bunx tsc --noEmit -p tsconfig.json && bun test test/section-document.test.ts && bun test && cd ../..
```
Expected: PASS semua.

```bash
git add packages/services/src/section-document.service.ts packages/services/src/index.ts packages/services/test/section-document.test.ts
git commit -m "feat(services): section document save with lazy create and stale-write guard"
```

---

### Task 4: Backend — routes save + bibliography + `build:dist`

**Files:**
- Modify: `apps/api/src/routes/workspaces.ts`
- Modify: `apps/api/src/routes/citations.ts`
- Modify: `packages/db/src/repositories/documentCitationUsageRepo.ts`
- Modify: `packages/services/src/citations/citation.service.ts`
- Test: modify `apps/api/test/*` (file yang meng-cover routes sections/citations — temukan via grep), `packages/services/test/citation-service.test.ts`

**Interfaces:**
- Consumes: Task 3 (`SectionDocumentService`, `parseClustersJson`).
- Produces (dipakai Task 5):
  - `PUT /sections/:id/document` — multipart `{ file, baseVersion?, clustersJson? }` → `SaveSectionDocumentResult` (union apa adanya).
  - `GET /workspaces/:id/bibliography` → `{ styleId: CitationStyleId; entries: Array<{ id: string; text: string }> }`
  - `CitationService.renderWorkspaceBibliography(db, { ownerUserId, workspaceId })`
  - `DocumentCitationUsageRepo.listByWorkspace(db, ownerUserId, workspaceId): Promise<DocumentCitationUsage[]>`

- [ ] **Step 1: Repo `listByWorkspace`**

Di `packages/db/src/repositories/documentCitationUsageRepo.ts`, tambah (ikuti gaya `listByDocument` di file yang sama — cek import `and`/`eq` + nama tabel):

```ts
  async listByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<DocumentCitationUsage[]> {
    return db
      .select()
      .from(documentCitationUsages)
      .where(
        and(
          eq(documentCitationUsages.ownerUserId, ownerUserId),
          eq(documentCitationUsages.workspaceId, workspaceId),
        ),
      );
  },
```

- [ ] **Step 2: `CitationService.renderWorkspaceBibliography`**

Di `packages/services/src/citations/citation.service.ts`, dekat `render` (~L862). Cek dulu import yang sudah ada di file (`DocumentCitationUsageRepo`, `WorkspaceService`) — tambahkan bila belum:

```ts
  /**
   * Daftar pustaka proyek: agregat sitasi yang benar-benar terpakai di dokumen
   * bab-bab (document_citation_usages), dirender dengan gaya proyek. Urutan akhir
   * mengikuti aturan sort gaya (citeproc), bukan urutan kemunculan.
   */
  async renderWorkspaceBibliography(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<{ styleId: CitationStyleId; entries: Array<{ id: string; text: string }> }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const usages = await DocumentCitationUsageRepo.listByWorkspace(
      db,
      input.ownerUserId,
      input.workspaceId,
    );
    const citationIds = [...new Set(usages.map((u) => u.citationId))];
    if (citationIds.length === 0) {
      const settings = await this.getSettings(db, {
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
      });
      return { styleId: settings.defaultStyleId as CitationStyleId, entries: [] };
    }
    const rendered = await this.render(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      citationIds,
    });
    return { styleId: rendered.styleId, entries: rendered.entries };
  },
```

(Cek bentuk return `getSettings` — bila field bukan `defaultStyleId`, ikuti yang ada.)

- [ ] **Step 3: Route save di `workspaces.ts`**

Tambahkan setelah blok `PATCH /sections/:id` (import `SectionDocumentService`, `parseClustersJson` dari `@aqsha/services`; `MAX_UPLOAD_BYTES` ikut diekspor services — cek barrel, bila tidak, pakai literal `50 * 1024 * 1024` dengan komentar sinkron ke `MAX_UPLOAD_MB`):

```ts
  .put(
    "/sections/:id/document",
    async ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionDocumentService.saveDocument(db, {
        ownerUserId,
        sectionId: params.id,
        bytes: new Uint8Array(await body.file.arrayBuffer()),
        fileName: body.file.name,
        baseVersion: body.baseVersion,
        clusters: parseClustersJson(body.clustersJson),
      });
    },
    {
      auth: true,
      // Tanpa rateLimit: dipanggil autosave debounced — limiter akan memutus penyimpanan.
      body: t.Object({
        file: t.File({ maxSize: 50 * 1024 * 1024 }),
        baseVersion: t.Optional(t.Numeric()),
        clustersJson: t.Optional(t.String()),
      }),
    },
  )
```

Gotcha repo: pada schema multipart Elysia, field `t.File` HARUS dideklarasikan pertama di `t.Object`.

- [ ] **Step 4: Route bibliography di `citations.ts`**

Tambahkan berdampingan dengan `POST /workspaces/:id/citations/render` existing:

```ts
  .get(
    "/workspaces/:id/bibliography",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return CitationService.renderWorkspaceBibliography(db, {
        ownerUserId,
        workspaceId: params.id,
      });
    },
    { auth: true },
  )
```

- [ ] **Step 5: Tests**

1. `packages/services/test/citation-service.test.ts`: tambah test mock-style (spyOn `DocumentCitationUsageRepo.listByWorkspace` + `WorkspaceService.assertWorkspaceOwner` + `CitationService.getSettings`) — kasus kosong mengembalikan `entries: []` + styleId settings; ikuti harness file itu (bila file itu DB-gated `itest`, tulis test di file mock yang lebih cocok atau tambah describe mock — konsisten dengan pola yang ADA di file).
2. `apps/api`: temukan file test yang meng-cover routes sections/citations: `/usr/bin/grep -rln "sections\|render-document" apps/api/test`. Tambahkan di file tersebut, mengikuti harness-nya persis: (a) happy-path `PUT /sections/:id/document` dengan `FormData` (file DOCX kecil dummy `new File([bytes], "bab.docx", { type: DOCX_MIME })`) → 200 `{ status: 'saved', contentVersion: 1 }`; (b) save kedua tanpa `baseVersion` → `{ status: 'stale_write' }`; (c) `GET /workspaces/:id/bibliography` proyek tanpa usage → `{ entries: [] }`.

Run:
```bash
cd packages/services && bun test && cd ../..
cd apps/api && bunx tsc --noEmit -p tsconfig.json && bun test && cd ../..
```
Expected: PASS.

- [ ] **Step 6: Gate backend + build dist**

Run (dari root): `bun run build:dist && bun run typecheck && bun run test`
Expected: hijau KECUALI `apps/web` di typecheck (by design).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/repositories/documentCitationUsageRepo.ts packages/services/src/citations/citation.service.ts packages/services/test apps/api/src/routes/workspaces.ts apps/api/src/routes/citations.ts apps/api/test
git commit -m "feat(api): section document save route and workspace bibliography"
```

---

### Task 5: Svelte — hooks + query keys feature sections

**Files:**
- Modify: `apps/svelte/src/lib/query/keys.ts`
- Create: `apps/svelte/src/lib/features/sections/api.ts`

**Interfaces:**
- Consumes: endpoint Task 4; `queryKeys` existing; pola hooks `features/workspaces/api.ts`.
- Produces (dipakai Task 6–8):
  - `queryKeys.citations.bibliography(workspaceId: string)`
  - Tipe lokal struktural: `SaveSectionDocumentResult`, `WorkspaceBibliography = { styleId: string; entries: Array<{ id: string; text: string }> }`
  - `useSaveSectionDocument(sectionId: () => string, workspaceId: () => string)` — mutation `({ file, baseVersion?, clustersJson? }) => SaveSectionDocumentResult`; TANPA toast onError (indikator autosave yang bicara); onSuccess (`status==='saved'`) invalidate `workspaces.sections(workspaceId)` + `artifacts.detail/render(artifactId)` + `citations.bibliography(workspaceId)`.
  - `useWorkspaceBibliography(workspaceId: () => string, enabled?: () => boolean)`

- [ ] **Step 1: Key baru**

Di `keys.ts` object `citations`, tambah:
```ts
		bibliography: (workspaceId: string) => ['citations', 'bibliography', workspaceId] as const,
```

- [ ] **Step 2: `features/sections/api.ts`**

```ts
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';

/**
 * Hooks dokumen bab. Save TIDAK memakai toast onError — autosave punya indikator
 * status sendiri di header editor (toast per retry debounced = spam).
 */

const alwaysTrue = () => true;

export type SaveSectionDocumentResult =
	| { status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: string }
	| { status: 'stale_write'; currentVersion: number };

export type WorkspaceBibliography = {
	styleId: string;
	entries: Array<{ id: string; text: string }>;
};

export function useSaveSectionDocument(sectionId: () => string, workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { file: File; baseVersion?: number; clustersJson?: string }) =>
			unwrap(
				await api.sections({ id: sectionId() }).document.put({
					file: input.file,
					...(input.baseVersion !== undefined ? { baseVersion: input.baseVersion } : {}),
					...(input.clustersJson ? { clustersJson: input.clustersJson } : {})
				})
			) as SaveSectionDocumentResult,
		onSuccess: (result: SaveSectionDocumentResult) => {
			if (result.status !== 'saved') return;
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(workspaceId()) });
			qc.invalidateQueries({ queryKey: queryKeys.artifacts.detail(result.artifactId) });
			qc.invalidateQueries({ queryKey: queryKeys.artifacts.render(result.artifactId) });
			qc.invalidateQueries({ queryKey: queryKeys.citations.bibliography(workspaceId()) });
		}
	}));
}

export function useWorkspaceBibliography(
	workspaceId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.bibliography(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).bibliography.get()
			) as WorkspaceBibliography
	}));
}
```

(Verifikasi path Eden `api.sections({ id }).document.put` dan `api.workspaces({ id }).bibliography.get` terhadap tipe `App` setelah `build:dist` — `bun run check` akan menuntun.)

- [ ] **Step 3: Check + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → bersih (minus pre-existing).

```bash
git add apps/svelte/src/lib/query/keys.ts apps/svelte/src/lib/features/sections/api.ts
git commit -m "feat(svelte): section document save and bibliography hooks"
```

---

### Task 6: Svelte — halaman bab lengkap (shell + load + status + unduh + bibliography)

**Files:**
- Create: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`
- Create: `apps/svelte/src/lib/features/sections/components/BibliographyView.svelte`
- Modify: `apps/svelte/src/routes/app/(product)/projects/[projectId]/sections/[sectionId]/+page.svelte`

**Interfaces:**
- Consumes: `SectionDocumentEditor` + `SectionEditorHandle` (Task 1), `useWorkspaceBibliography` (Task 5), `useSections`/`useWorkspace`/`useUpdateSection` (`features/workspaces/api`), `useArtifactRender` (`features/artifacts/api`), `ProjectSidePanel { workspaceId, workspaceName, sections, activeTab, onTabChange, onClose }`, `DetailSplitLayout`, `SECTION_STATUS_LABELS`, `projectDisplayTitle` (`features/workspaces/types`).
- Produces (dipakai Task 7–8): `SectionEditorPage` menyimpan `editorHandle`, `documentArtifactId`/`baseVersion` state, dan snippet header dengan seam: slot indikator simpan (Task 7) + tombol "Sisipkan sitasi" (Task 8) ditandai komentar seam.

- [ ] **Step 1: `BibliographyView.svelte`**

Invoke skill svelte dulu.

```svelte
<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';
	import { useWorkspaceBibliography } from '../api';

	/** Daftar pustaka proyek — digenerate citeproc dari sitasi terpakai di bab-bab; read-only. */
	let { workspaceId }: { workspaceId: string } = $props();

	const bibliography = useWorkspaceBibliography(() => workspaceId);
</script>

<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-lg border-2 border-border bg-card p-8">
	{#if bibliography.isPending}
		<div class="flex items-center justify-center gap-2 py-12 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Menyusun daftar pustaka…</span>
		</div>
	{:else if (bibliography.data?.entries ?? []).length === 0}
		<p class="py-12 text-center text-sm text-muted-foreground">
			Belum ada sitasi yang terpakai di bab-bab. Sisipkan sitasi dari editor bab, daftar pustaka
			tersusun otomatis di sini.
		</p>
	{:else}
		<p class="text-label text-muted-foreground">
			Tersusun otomatis dari sitasi yang terpakai — selalu sinkron dengan isi bab.
		</p>
		<ol class="grid gap-3">
			{#each bibliography.data?.entries ?? [] as entry (entry.id)}
				<li class="text-sm leading-relaxed">{entry.text}</li>
			{/each}
		</ol>
	{/if}
</div>
```

(`entry.text` dirender sebagai TEKS, bukan `{@html}` — output citeproc bisa membawa markup; plain text aman dan cukup untuk tampilan daftar.)

- [ ] **Step 2: `SectionEditorPage.svelte`**

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, ArrowLeftIcon, DownloadIcon } from '$lib/icons';
	import ProjectSidePanel from '$lib/features/workspaces/components/ProjectSidePanel.svelte';
	import { useSections, useUpdateSection, useWorkspace } from '$lib/features/workspaces/api';
	import {
		SECTION_STATUS_LABELS,
		projectDisplayTitle,
		type SectionStatus
	} from '$lib/features/workspaces/types';
	import { useArtifact, useArtifactRender } from '$lib/features/artifacts/api';
	import BibliographyView from '../components/BibliographyView.svelte';
	import SectionDocumentEditor from '../components/SectionDocumentEditor.svelte';
	import type { SectionEditorHandle } from '../superdoc-client';

	/**
	 * Halaman bab: editor DOCX di kiri, panel proyek (sumber/chat) di kanan.
	 * Bab bibliography = view read-only tanpa editor.
	 */
	let { projectId, sectionId }: { projectId: string; sectionId: string } = $props();

	const workspace = useWorkspace(() => projectId);
	const sections = useSections(() => projectId);
	const updateSection = useUpdateSection();

	const section = $derived(sections.data?.find((s) => s.id === sectionId) ?? null);
	const isBibliography = $derived(section?.role === 'bibliography');

	// documentArtifactId lokal: save pertama mengisinya TANPA remount editor
	// (sections invalidation datang belakangan; sesi mengetik tak boleh terputus).
	let localArtifactId = $state<string | null>(null);
	const documentArtifactId = $derived(localArtifactId ?? section?.documentArtifactId ?? null);

	const artifact = useArtifact(
		() => documentArtifactId ?? '',
		() => documentArtifactId !== null
	);
	const render = useArtifactRender(
		() => documentArtifactId ?? '',
		() => documentArtifactId !== null
	);
	const renderUrl = $derived(
		render.data && 'url' in render.data ? (render.data.url as string) : null
	);
	// Editor dimount SEKALI per dokumen: tunggu render-payload DAN detail artifact
	// (detail membawa contentVersion — baseVersion autosave harus benar sebelum
	// ketikan pertama, kalau tidak save pertama salah terdeteksi stale_write).
	const editorReady = $derived(
		documentArtifactId === null || (renderUrl !== null && artifact.data !== undefined)
	);

	let editorHandle = $state<SectionEditorHandle | null>(null);
	let panelTab = $state<'chat' | 'sources'>('sources');

	async function downloadDocx() {
		if (!editorHandle || !section) return;
		const blob = await editorHandle.exportDocx();
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${section.title}.docx`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<PageTitle title={section?.title ?? 'Bab'} />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout sideOpen={true} onSideOpenChange={() => {}}>
		{#snippet main()}
			<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
				{#if sections.isPending}
					<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat bab…</span>
					</div>
				{:else if !section}
					<p class="text-muted-foreground">Bab tidak ditemukan.</p>
				{:else}
					<header class="flex flex-wrap items-center gap-3">
						<Button
							href={resolve('/app/(product)/projects/[projectId]', { projectId })}
							variant="ghost"
							size="icon"
							aria-label="Kembali ke proyek"
						>
							<Icon icon={ArrowLeftIcon} class="size-4" />
						</Button>
						<div class="min-w-0 flex-1">
							<h1 class="truncate font-heading text-xl font-bold">{section.title}</h1>
							<p class="truncate text-label text-muted-foreground">
								{workspace.data ? projectDisplayTitle(workspace.data) : ''}
							</p>
						</div>
						<!-- seam: indikator autosave (Task 7) -->
						<!-- seam: tombol "Sisipkan sitasi" (Task 8) -->
						{#if isBibliography}
							<Badge variant="outline">otomatis</Badge>
						{:else}
							<Select.Root
								type="single"
								value={section.status}
								onValueChange={(v) =>
									updateSection.mutate({
										id: section.id,
										workspaceId: projectId,
										status: v as SectionStatus
									})}
							>
								<Select.Trigger class="w-32" aria-label="Status bab">
									{SECTION_STATUS_LABELS[section.status]}
								</Select.Trigger>
								<Select.Content>
									{#each Object.entries(SECTION_STATUS_LABELS) as [value, label] (value)}
										<Select.Item {value} {label} />
									{/each}
								</Select.Content>
							</Select.Root>
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="gap-1.5"
								disabled={!editorHandle}
								onclick={downloadDocx}
							>
								<Icon icon={DownloadIcon} class="size-3.5" /> Unduh DOCX
							</Button>
						{/if}
					</header>

					{#if isBibliography}
						<BibliographyView workspaceId={projectId} />
					{:else if !editorReady}
						<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
							<Spinner class="size-4" />
							<span class="text-sm">Memuat dokumen…</span>
						</div>
					{:else}
						<div class="flex min-h-0 flex-1 flex-col rounded-lg border-2 border-border bg-card">
							{#key documentArtifactId}
								<SectionDocumentEditor
									documentUrl={renderUrl}
									fileName={`${section.title}.docx`}
									onHandle={(h) => (editorHandle = h)}
									onUpdate={() => {}}
								/>
							{/key}
						</div>
					{/if}
				{/if}
			</div>
		{/snippet}
		{#snippet side()}
			{#if workspace.data && sections.data}
				<ProjectSidePanel
					workspaceId={projectId}
					workspaceName={projectDisplayTitle(workspace.data)}
					sections={sections.data}
					activeTab={panelTab}
					onTabChange={(t) => (panelTab = t)}
					onClose={() => {}}
				/>
			{/if}
		{/snippet}
	</DetailSplitLayout>
</div>
```

Catatan: `{#key documentArtifactId}` HANYA aman karena `localArtifactId` diisi Task 7 SEBELUM invalidation — pastikan nilai `documentArtifactId` tidak berubah pada save pertama (null → id akan remount! Karena itu `localArtifactId` di-set SINKRON dari response save sebelum `section.documentArtifactId` berubah, dan `{#key}` memakai nilai yang SAMA — verifikasi saat Task 7: set `localArtifactId` TANPA memicu remount berarti key harus stabil; bila remount terjadi, ganti strategi: hapus `{#key}` dan mount editor sekali dengan `documentUrl` awal saja). Cek props persis `DetailSplitLayout`/`ProjectSidePanel`/`Select` terhadap pemakaian existing (`ProjectHomePage.svelte`) dan sesuaikan; cek `DownloadIcon`/`ArrowLeftIcon` ada di `$lib/icons`.

- [ ] **Step 3: Wire route**

Ganti isi `apps/svelte/src/routes/app/(product)/projects/[projectId]/sections/[sectionId]/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import SectionEditorPage from '$lib/features/sections/pages/SectionEditorPage.svelte';
</script>

<SectionEditorPage projectId={page.params.projectId!} sectionId={page.params.sectionId!} />
```

(Wiring editor v0 dari Task 1 Step 5 tergantikan di sini; input dev + tombol round-trip TETAP hidup di `SectionDocumentEditor` di balik `dev`.)

- [ ] **Step 4: Check + verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → bersih (minus pre-existing).
Manual (dev): buka bab tanpa dokumen → editor blank; bab bibliography → view daftar pustaka (kosong dengan copy ajakan); ganti status bab dari header bekerja; "Unduh DOCX" mengunduh file yang terbuka di Word.

```bash
git add apps/svelte/src/lib/features/sections "apps/svelte/src/routes/app/(product)/projects/[projectId]/sections/[sectionId]/+page.svelte"
git commit -m "feat(svelte): section editor page shell with bibliography view and docx download"
```

---

### Task 7: Svelte — autosave + stale_write + guard navigasi

**Files:**
- Create: `apps/svelte/src/lib/features/sections/autosave.svelte.ts`
- Create: `apps/svelte/src/lib/features/sections/autosave.spec.ts`
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`

**Interfaces:**
- Consumes: `useSaveSectionDocument` (Task 5), `SectionEditorHandle.exportDocx/listCitations` (Task 1), state `localArtifactId` (Task 6).
- Produces (dipakai Task 8): class `SectionAutosave`:
  - constructor `({ debounceMs?: number; maxIntervalMs?: number; save: (file: File, baseVersion?: number) => Promise<SaveSectionDocumentResult>; buildFile: () => Promise<File>; onSaved: (r: Extract<SaveSectionDocumentResult, { status: 'saved' }>) => void; onStale: (currentVersion: number) => void })`
  - `state: 'idle' | 'dirty' | 'saving' | 'error' | 'stale'` (`$state`), `markDirty()`, `flush(): Promise<void>`, `retry()`, `setBaseVersion(v: number | undefined)`, `hasUnsaved: boolean`, `dispose()`.

- [ ] **Step 1: Failing test scheduler**

`apps/svelte/src/lib/features/sections/autosave.spec.ts` (vitest, fake timers — logika scheduler diuji murni; jalankan seperti spec existing):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionAutosave } from './autosave.svelte';

function makeSave(results: Array<{ status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: string } | { status: 'stale_write'; currentVersion: number }>) {
	let i = 0;
	return vi.fn(async () => results[Math.min(i++, results.length - 1)]);
}

describe('SectionAutosave', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('debounce: satu save setelah idle', async () => {
		const save = makeSave([
			{ status: 'saved', artifactId: 'a', contentVersion: 1, sectionStatus: 'draft' }
		]);
		const auto = new SectionAutosave({
			debounceMs: 2000,
			maxIntervalMs: 15000,
			save,
			buildFile: async () => new File([1 as never], 'x.docx'),
			onSaved: () => {},
			onStale: () => {}
		});
		auto.markDirty();
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(2100);
		expect(save).toHaveBeenCalledTimes(1);
		expect(auto.state).toBe('idle');
		auto.dispose();
	});

	it('stale_write menghentikan penjadwalan sampai retry', async () => {
		const save = makeSave([{ status: 'stale_write', currentVersion: 7 }]);
		const onStale = vi.fn();
		const auto = new SectionAutosave({
			debounceMs: 100,
			maxIntervalMs: 1000,
			save,
			buildFile: async () => new File([1 as never], 'x.docx'),
			onSaved: () => {},
			onStale
		});
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		expect(onStale).toHaveBeenCalledWith(7);
		expect(auto.state).toBe('stale');
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(2000);
		expect(save).toHaveBeenCalledTimes(1);
		auto.dispose();
	});

	it('save gagal → error, retry menjadwalkan ulang', async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce({
				status: 'saved',
				artifactId: 'a',
				contentVersion: 2,
				sectionStatus: 'draft'
			});
		const auto = new SectionAutosave({
			debounceMs: 100,
			maxIntervalMs: 1000,
			save,
			buildFile: async () => new File([1 as never], 'x.docx'),
			onSaved: () => {},
			onStale: () => {}
		});
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		expect(auto.state).toBe('error');
		auto.retry();
		await vi.advanceTimersByTimeAsync(200);
		expect(auto.state).toBe('idle');
		auto.dispose();
	});
});
```

Run: `cd apps/svelte && bun run test -- autosave && cd ../..` (samakan invocation dengan spec existing).
Expected: FAIL — module belum ada.

- [ ] **Step 2: `autosave.svelte.ts`**

```ts
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
```

Run test lagi → PASS (3 test). (Bila `$state` di class field bermasalah di lingkungan vitest non-svelte, cek pola `.svelte.ts` existing (`use-recent-thread-summaries.svelte.ts`) dan konfigurasi test — file `.svelte.ts` dikompilasi svelte oleh vitest plugin repo.)

- [ ] **Step 3: Wire ke `SectionEditorPage.svelte`**

1. Import `SectionAutosave` + `useSaveSectionDocument` + `AlertDialog` (cek sub-API `@aqsha/ui-svelte/components/alert-dialog` terhadap pemakaian existing) + `beforeNavigate` dari `$app/navigation`.
2. Buat instance per bab (di dalam cabang `section` non-bibliography — inisialisasi di `$effect` saat `editorHandle` siap):

```ts
	const saveDocument = useSaveSectionDocument(
		() => sectionId,
		() => projectId
	);

	let autosave = $state<SectionAutosave | null>(null);
	let staleVersion = $state<number | null>(null);

	// clusters dikirim bersama tiap save — sumber kebenaran usages daftar pustaka.
	function clustersJsonFromEditor(): string | undefined {
		const list = editorHandle?.listCitations() ?? [];
		if (list.length === 0) return undefined;
		return JSON.stringify(
			list.map((c) => ({
				nodeId: c.nodeId,
				citationIds: c.payload.citationIds,
				locator: {
					locator: c.payload.locator,
					label: c.payload.label,
					prefix: c.payload.prefix,
					suffix: c.payload.suffix
				}
			}))
		);
	}

	$effect(() => {
		if (!editorHandle || !section || isBibliography) return;
		const instance = new SectionAutosave({
			save: async (file, baseVersion) =>
				saveDocument.mutateAsync({ file, baseVersion, clustersJson: clustersJsonFromEditor() }),
			buildFile: async () => {
				const blob = await editorHandle!.exportDocx();
				return new File([blob], `${section.title}.docx`, { type: blob.type });
			},
			onSaved: (r) => {
				localArtifactId = r.artifactId;
			},
			onStale: (v) => {
				staleVersion = v;
			}
		});
		instance.setBaseVersion(
			documentArtifactId ? ((artifact.data as { contentVersion?: number } | undefined)?.contentVersion ?? 0) : undefined
		);
		autosave = instance;
		return () => {
			instance.dispose();
			autosave = null;
		};
	});
```

3. `onUpdate` editor → `autosave?.markDirty()` (ganti `onUpdate={() => {}}` di `SectionDocumentEditor`).
4. Indikator di seam header (ganti komentar seam Task 6):

```svelte
						{#if autosave && !isBibliography}
							<span class="text-label text-muted-foreground" aria-live="polite">
								{#if autosave.state === 'saving'}menyimpan…{:else if autosave.state === 'dirty'}belum
									tersimpan{:else if autosave.state === 'error'}gagal menyimpan
									<Button type="button" variant="ghost" size="sm" onclick={() => autosave?.retry()}>
										coba lagi
									</Button>
								{:else if autosave.state === 'stale'}dokumen berubah di tempat lain{:else}tersimpan{/if}
							</span>
						{/if}
```

5. Dialog stale (di bawah shell):

```svelte
{#if staleVersion !== null}
	<AlertDialog.Root open={true}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Dokumen berubah di tempat lain</AlertDialog.Title>
				<AlertDialog.Description>
					Versi tersimpan lebih baru dari yang sedang kamu edit — kemungkinan dari tab lain.
					Muat ulang untuk melanjutkan; perubahan yang belum tersimpan di tab ini hilang.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Action onclick={() => window.location.reload()}>
					Muat ulang dokumen
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}
```

6. Guard navigasi:

```ts
	beforeNavigate((nav) => {
		if (!autosave?.hasUnsaved) return;
		// Simpan sinkron tak mungkin — flush best-effort lalu biarkan navigasi jalan.
		void autosave.flush();
	});

	$effect(() => {
		if (!autosave) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (autosave?.hasUnsaved) e.preventDefault();
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});
```

7. Perhatikan catatan `{#key documentArtifactId}` dari Task 6: setelah `onSaved` men-set `localArtifactId`, `documentArtifactId` berubah `null → id` pada SAVE PERTAMA dan `{#key}` akan me-remount editor (dokumen ter-reload dari S3 — kehilangan fokus tapi bukan data). Bila UX ini terasa mengganggu saat verifikasi manual, hapus `{#key}` dan biarkan editor hidup dengan `documentUrl` mount-awal (URL hanya dipakai saat mount).

- [ ] **Step 4: Check + verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && bun run test -- autosave && cd ../..`
Manual (dev): ketik di bab kosong → indikator "menyimpan…" → "tersimpan"; status bab di rumah proyek berubah kosong→draf; refresh halaman → isi terpulihkan dari S3; buka bab sama di dua tab, ketik di keduanya → tab kedua kena dialog stale; matikan API (stop dev api) → indikator "gagal menyimpan — coba lagi".

```bash
git add apps/svelte/src/lib/features/sections
git commit -m "feat(svelte): debounced section autosave with stale-write recovery"
```

---

### Task 8: Svelte — citation pill (sisipkan + render + ganti gaya)

**Files:**
- Create: `apps/svelte/src/lib/features/sections/components/SectionCitationPicker.svelte`
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`

**Interfaces:**
- Consumes: `useWorkspaceCitations` + `useRenderDocumentCitations` + `useCitationSettings` (`features/citations/api`), `DocumentCitationCluster` (`features/citations/types`), `SectionEditorHandle.insertCitation/listCitations/updateCitationText` + `CitationFieldPayload` (Task 1), `citationMetaLine` (`features/citations/types`).
- Produces: `SectionCitationPicker` props `{ open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string; onPick: (citation: { id: string; title: string }) => void }`.

- [ ] **Step 1: `SectionCitationPicker.svelte`**

Model dari `LibraryPickerDialog.svelte` (baca dulu file itu) tapi sumber list = KOLEKSI PROYEK (`useWorkspaceCitations`), aksi = pilih (bukan tautkan):

```svelte
<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { useWorkspaceCitations } from '$lib/features/citations/api';
	import { citationMetaLine } from '$lib/features/citations/types';

	/** Pilih satu referensi dari koleksi proyek untuk disisipkan sebagai sitasi. */
	let {
		open,
		onOpenChange,
		workspaceId,
		onPick
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		workspaceId: string;
		onPick: (citation: { id: string; title: string }) => void;
	} = $props();

	let q = $state('');
	const linked = useWorkspaceCitations(
		() => workspaceId,
		() => open
	);
	const items = $derived(
		(linked.data?.items ?? []).filter(
			(i) => !q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase())
		)
	);
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>Sisipkan sitasi</Dialog.Title>
				<Dialog.Description>
					Dari koleksi proyek ini — tambah sumber baru lewat panel Sumber.
				</Dialog.Description>
			</Dialog.Header>
			<Input bind:value={q} placeholder="Cari di koleksi proyek…" aria-label="Cari referensi" />
			<div class="max-h-80 min-h-0 overflow-y-auto">
				{#if linked.isPending}
					<div class="flex items-center justify-center gap-2 py-8 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat…</span>
					</div>
				{:else if items.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">
						{q ? 'Tidak ada yang cocok.' : 'Koleksi proyek masih kosong — tambahkan dari panel Sumber.'}
					</p>
				{:else}
					<ul class="grid gap-1.5">
						{#each items as item (item.id)}
							<li class="flex items-center gap-3 rounded-md border-2 border-border bg-card px-3 py-2">
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{item.title}</p>
									<p class="truncate text-label text-muted-foreground">{citationMetaLine(item)}</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={() => {
										onPick({ id: item.id, title: item.title });
										onOpenChange(false);
									}}
								>
									Sisipkan
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Dialog.Content>
	{/if}
</Dialog.Root>
```

(Cek bentuk item `useWorkspaceCitations` — koleksi proyek memakai baris citations MENTAH (`authorsJson`), lihat komentar tipe di `features/citations/types.ts`; bila `citationMetaLine` tak kompatibel dengan bentuk itu, tampilkan `item.title` saja + tahun bila ada. Ikuti bagaimana `ProjectSourcesPanel` merender item koleksi.)

- [ ] **Step 2: Wire pill di `SectionEditorPage.svelte`**

1. State + hooks:

```ts
	import SectionCitationPicker from '../components/SectionCitationPicker.svelte';
	import {
		useCitationSettings,
		useRenderDocumentCitations
	} from '$lib/features/citations/api';
	import type { DocumentCitationCluster } from '$lib/features/citations/types';
	import type { CitationStyleId } from '$lib/features/citations/types';

	let pickerOpen = $state(false);
	// Snapshot clusters dari dokumen — di-refresh tiap insert dan tiap editor update
	// yang tersimpan; kunci render citeproc reaktif (ganti gaya → refetch → sinkron pill).
	let clusters = $state<DocumentCitationCluster[]>([]);

	function refreshClusters() {
		clusters = (editorHandle?.listCitations() ?? []).map((c) => ({
			nodeId: c.nodeId,
			citationIds: c.payload.citationIds,
			...(c.payload.locator ? { locator: c.payload.locator } : {}),
			...(c.payload.label ? { label: c.payload.label } : {}),
			...(c.payload.prefix ? { prefix: c.payload.prefix } : {}),
			...(c.payload.suffix ? { suffix: c.payload.suffix } : {})
		}));
	}

	const citationSettings = useCitationSettings(() => projectId);
	const styleId = $derived(
		(citationSettings.data?.defaultStyleId ?? null) as CitationStyleId | null
	);
	const documentRender = useRenderDocumentCitations(
		() => projectId,
		() => clusters,
		() => styleId,
		() => clusters.length > 0
	);

	// Hasil render → sinkronkan teks pill di dokumen (ganti gaya, edit referensi, dst.).
	$effect(() => {
		const result = documentRender.data;
		if (!result || !editorHandle) return;
		for (const rendered of result.clusters) {
			editorHandle.updateCitationText(rendered.nodeId, rendered.text);
		}
	});

	async function insertCitation(citation: { id: string; title: string }) {
		if (!editorHandle) return;
		const nodeId = crypto.randomUUID();
		// Teks sementara sampai render citeproc datang — pill langsung terlihat.
		editorHandle.insertCitation(nodeId, { citationIds: [citation.id] }, `(${citation.title})`);
		refreshClusters();
		autosave?.markDirty();
	}
```

2. `onUpdate` editor menjadi: `onUpdate={() => { autosave?.markDirty(); refreshClusters(); }}` — dan panggil `refreshClusters()` sekali saat `editorHandle` siap (dokumen existing membawa pill dari save sebelumnya) di `$effect` inisialisasi autosave.
3. Isi seam header tombol sitasi (sebelum Select status):

```svelte
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="gap-1.5"
							disabled={!editorHandle}
							onclick={() => (pickerOpen = true)}
						>
							<Icon icon={QuoteIcon} class="size-3.5" /> Sisipkan sitasi
						</Button>
```

(Cek `QuoteIcon` di `$lib/icons`; bila tidak ada, pakai ikon existing yang pas (mis. `BookOpenIcon`) — JANGAN menambah dependency ikon baru tanpa cek aturan `packages/ui` di CLAUDE.md.)
4. Render picker di bawah shell:

```svelte
{#if section && !isBibliography}
	<SectionCitationPicker
		open={pickerOpen}
		onOpenChange={(o) => (pickerOpen = o)}
		workspaceId={projectId}
		onPick={insertCitation}
	/>
{/if}
```

- [ ] **Step 3: Check + verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..`
Manual (dev): proyek dengan ≥2 sumber di koleksi → buka bab → "Sisipkan sitasi" → pill masuk dengan teks render sesuai gaya proyek (APA dsb.); simpan → buka halaman bab Daftar Pustaka → entri muncul; ganti gaya sitasi proyek (panel Sumber/pengaturan sitasi) → teks pill di editor berubah tanpa reload; unduh DOCX → buka di Word → sitasi tampil sebagai teks final; refresh halaman bab → pill masih dikenali (listCitations mendeteksinya — cek via insert pill kedua lalu lihat daftar pustaka mencatat keduanya).

```bash
git add apps/svelte/src/lib/features/sections
git commit -m "feat(svelte): sdt citation pills with citeproc rendering in section editor"
```

---

### Task 9: Deliverables — AGPL, flag docstring, changelog, sweep akhir

**Files:**
- Create: `apps/svelte/LICENSE`, `packages/ui-svelte/LICENSE`
- Modify: `apps/svelte/src/lib/features/workspaces/document-authoring.ts`
- Modify: footer/tempat notice (temukan via grep, lihat Step 3)
- Modify: `apps/svelte/PRODUCT.md`
- Modify: file changelog produk (per `docs/product/versioning-and-changelog.md`)

**Interfaces:** — (task penutup, tidak memproduksi seam kode).

- [ ] **Step 1: LICENSE AGPL-3.0**

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o apps/svelte/LICENSE
cp apps/svelte/LICENSE packages/ui-svelte/LICENSE
```
Tambahkan juga field `"license": "AGPL-3.0-only"` di `apps/svelte/package.json` dan `packages/ui-svelte/package.json` (ganti field license existing bila ada).

- [ ] **Step 2: MANUAL GATE — URL repo mirror publik**

Tanya user: URL repo publik untuk source frontend (mis. `https://github.com/<org>/aqsha-frontend`). Simpan jawaban untuk Step 3. Bila belum ada, minta user menentukan namanya sekarang (mekanisme mirror = tugas ops, tapi URL harus final agar notice tidak bohong).

- [ ] **Step 3: Notice "kode sumber tersedia"**

Temukan footer publik: `/usr/bin/grep -rln "footer" apps/svelte/src/lib --include='*.svelte' -i | head`. Di komponen footer landing (dan/atau halaman Settings bagian tentang bila ada), tambahkan satu baris link:

```svelte
<a href={SOURCE_REPO_URL} class="hover:underline" rel="noopener" target="_blank">
	Kode sumber frontend (AGPL-3.0)
</a>
```

dengan konstanta di file baru `apps/svelte/src/lib/legal.ts`:

```ts
/** Frontend ter-bundle SuperDoc (AGPLv3) — corresponding source dipublikasikan di sini. */
export const SOURCE_REPO_URL = '<URL dari Step 2>';
```

- [ ] **Step 4: Docstring flag `DOCUMENT_AUTHORING_ENABLED`**

Ganti seluruh docstring `apps/svelte/src/lib/features/workspaces/document-authoring.ts` (nilai tetap `false`):

```ts
/**
 * Blank-document authoring di LIBRARY (dokumen markdown lepas) tetap OFF: dokumen
 * yang dibuat dari library terbuka di reader read-only — affordance-nya menjebak.
 * Menulis dokumen kini hidup di EDITOR BAB (sections/[sectionId], DOCX SuperDoc)
 * dan tidak digate flag ini. Flag ini hanya menggate CTA "buat dokumen" library;
 * dihapus bila authoring library diputuskan mati permanen.
 */
export const DOCUMENT_AUTHORING_ENABLED = false;
```

- [ ] **Step 5: PRODUCT.md + changelog + versi**

1. `apps/svelte/PRODUCT.md`: perbarui bagian fitur/positioning yang menyebut editor "hadir nanti" (cek `/usr/bin/grep -n "editor\|SuperDoc" apps/svelte/PRODUCT.md`) → editor bab DOCX live (SuperDoc, sitasi dari perpustakaan, daftar pustaka otomatis).
2. Baca `docs/product/versioning-and-changelog.md` dan ikuti keputusannya untuk perubahan user-facing besar ini (entri changelog + bump versi minor). Isi entri (bahasa Indonesia sentence case):
   > **Editor bab baru.** Tulis karya tulismu langsung di Aqsha: setiap bab adalah dokumen Word (DOCX) dengan simpan otomatis, sisipkan sitasi dari koleksi proyek sekali klik, dan daftar pustaka yang tersusun otomatis dari sitasi yang kamu pakai. Unduh per bab kapan saja.

- [ ] **Step 6: Sweep akhir**

Run:
```bash
cd apps/svelte && bun run check && bun run test && cd ../..
bun run typecheck && bun run test
```
Expected: hijau (minus 2 pre-existing DetailPanel + apps/web typecheck by design).

**MANUAL GATE — E2E loop penuh (user):** proyek baru → tulis bab 1 (autosave) → cari & simpan sumber → link ke proyek → sisipkan sitasi → cek daftar pustaka → ganti gaya → unduh DOCX → buka di Word. Konfirmasi sebelum commit terakhir.

- [ ] **Step 7: Commit**

```bash
git add apps/svelte/LICENSE packages/ui-svelte/LICENSE apps/svelte/package.json packages/ui-svelte/package.json apps/svelte/src/lib/legal.ts apps/svelte/src/lib/features/workspaces/document-authoring.ts apps/svelte/PRODUCT.md
git status   # + file footer/notice & changelog yang tersentuh — add per-path
git commit -m "chore(svelte): agpl compliance notices and phase-out note for library authoring flag"
```
