# Research-first Fase 6 — Viewer PDF + Anotasi + Loop Editing Agen: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghidupkan UX inti agen-first di halaman bab: PDF ter-render + lapisan anotasi (seleksi teks + pin) ter-map SyncTeX, antrian anotasi ke Astra via thread chat, dan loop proposal suntingan tervalidasi compile dengan Terima/Tolak.

**Architecture:** Satu plan menyeluruh dua tahap — **6a** (Task 1–9: DB anotasi+proposal, forward SyncTeX, AnnotationService, routes, hooks, `SectionPdfViewer` text-layer+overlay, rework `SectionEditorPage`, preview full-doc) lalu **6b** (Task 10–16: `SectionProposalService` dry-run compile, routes proposal, tool Mastra `get_section_source`/`propose_section_edit`, seam clientContext chat, kartu diff Terima/Tolak, quick-action perbaiki, e2e). Spec: `docs/superpowers/specs/2026-07-18-research-first-phase6-pdf-annotation-agent-loop-design.md`.

**Tech Stack:** Drizzle/Postgres, Elysia + Eden Treaty, TanStack Query, SvelteKit (runes), pdfjs-dist 5.4.296 (TextLayer), Mastra (`@mastra/core` terpasang), Tectonic via `LatexCompileService`, lib `diff` (baru, apps/svelte).

## Global Constraints

- **Bun only** (1.3.10). Jangan npm/pnpm/yarn.
- **File `.svelte`/`.svelte.ts` WAJIB dikerjakan lewat skill `svelte-code-writer`** (runes: `$props`, `$state`, `$derived`, `$effect`).
- Modul yang menyentuh `Bun.*` (compile/runner) TIDAK boleh masuk barrel root `@aqsha/services` — tetap subpath `@aqsha/services/latex` (deviasi #4 gate report). `SectionProposalService` karenanya hidup di `src/latex/`.
- `author: "agent"` tidak pernah berasal dari input HTTP — hanya dari pemanggilan service internal.
- Union return untuk hasil produk (`stale`, `compile_error`, `edit_mismatch`); `throwAppError` untuk terminal. Frontend pakai `readableApiErrorMessage`.
- Ikon apps/svelte via `$lib/icons` (adapter Hugeicons); JANGAN import lucide/hugeicons langsung.
- Copy UI bahasa Indonesia, sentence case (tanpa ALL-CAPS).
- Komentar kode: why-only, tanpa referensi plan/fase/task.
- Verifikasi API Mastra vs `@mastra/core` terpasang (mastra docs MCP / context7 `/mastra-ai/mastra`) sebelum menulis tool. Verifikasi API `TextLayer` pdfjs vs `apps/svelte/node_modules/pdfjs-dist/types/` sebelum menulis viewer.
- Test DB-gated pola repo: `const itest = DATABASE_URL ? test : test.skip`; e2e compile gated `Bun.which("tectonic")` + `S3_BUCKET`.
- Setelah mengubah `packages/db`/`packages/services`: `bun run build:dist` sebelum typecheck/dev `apps/api`+`apps/agent`.
- Branch tetap `feat/apps-svelte-migration`; commit per task, JANGAN push.
- Prasyarat prod (bukan task plan ini, catat di PR/ops): OS-level sandbox compiler sebelum expose ke user prod.

---

# TAHAP 6a — Viewer PDF + anotasi + compile UX

### Task 1: Schema DB + repo + migrasi (`document_annotations`, `section_edit_proposals`)

**Files:**
- Create: `packages/db/src/schema/documentAnnotations.ts`
- Create: `packages/db/src/schema/sectionEditProposals.ts`
- Create: `packages/db/src/repositories/documentAnnotationRepo.ts`
- Create: `packages/db/src/repositories/sectionEditProposalRepo.ts`
- Modify: `packages/db/src/schema/index.ts` (tambah 2 `export *`)
- Modify: `packages/db/src/repositories/index.ts` (tambah 2 export)
- Generated: `packages/db/drizzle/0043_*.sql` (via `db:generate`)

**Interfaces:**
- Produces: tabel + tipe `DocumentAnnotation`/`NewDocumentAnnotation`, `SectionEditProposal`/`NewSectionEditProposal`, `AnnotationRect`, `ANNOTATION_KINDS`, `ANNOTATION_STATUSES`, `PROPOSAL_STATUSES`; repo `DocumentAnnotationRepo { findById, listBySection, insert, updateById, deleteById, updateStatusByIds }`, `SectionEditProposalRepo { findById, findPendingBySection, insert, updateById, supersedePendingBySection }`.

- [ ] **Step 1: Tulis schema `documentAnnotations`**

`packages/db/src/schema/documentAnnotations.ts`:

```ts
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

export const ANNOTATION_KINDS = ["highlight", "pin"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const ANNOTATION_STATUSES = ["open", "sent", "resolved", "dismissed"] as const;
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number];

/** Kotak anchor ruang-PDF (point, origin kiri-atas halaman, skala viewport 1). Pin = 1 titik (w=h=0). */
export type AnnotationRect = { x: number; y: number; w: number; h: number };

/**
 * document_annotations — anotasi user di PDF bab (highlight seleksi teks / pin titik).
 * Anchor PDF di-map SEKALI ke sumber (`source_file`+`source_line`, SyncTeX inverse) saat create;
 * `source_version` = contentVersion yang ter-render build saat itu → pembaca mendeteksi anchor
 * basi dengan membandingkan versi, bukan reload buta. `source_line` null = anchor tak ter-map
 * (tetap berguna: `selected_text`+`note` cukup sebagai konteks agen).
 */
export const documentAnnotations = pgTable(
  "document_annotations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => workspaceSections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    page: integer("page").notNull(),
    rects: jsonb("rects").$type<AnnotationRect[]>().notNull(),
    selectedText: text("selected_text"),
    note: text("note"),
    sourceFile: text("source_file"),
    sourceLine: integer("source_line"),
    sourceVersion: integer("source_version").notNull(),
    status: text("status").notNull().default("open"),
    threadId: text("thread_id"),
    messageId: text("message_id"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("document_annotations_kind_check", sql`${t.kind} in ('highlight', 'pin')`),
    check(
      "document_annotations_status_check",
      sql`${t.status} in ('open', 'sent', 'resolved', 'dismissed')`,
    ),
    index("document_annotations_by_section_status").on(t.sectionId, t.status),
    index("document_annotations_by_owner_section").on(t.ownerUserId, t.sectionId),
  ],
);

export type DocumentAnnotation = typeof documentAnnotations.$inferSelect;
export type NewDocumentAnnotation = typeof documentAnnotations.$inferInsert;
```

- [ ] **Step 2: Tulis schema `sectionEditProposals`**

`packages/db/src/schema/sectionEditProposals.ts`:

```ts
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * section_edit_proposals — usulan suntingan Astra atas sumber LaTeX bab, HANYA yang sudah lolos
 * dry-run compile (usulan gagal compile tak pernah menyentuh tabel ini). `base_version` =
 * contentVersion saat agen membaca; accept memakai CAS `saveDocument` sehingga tak pernah
 * menimpa tulisan yang lebih baru. Maksimal satu `pending` per bab (unique parsial) —
 * proposal baru men-supersede pending lama.
 */
export const sectionEditProposals = pgTable(
  "section_edit_proposals",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => workspaceSections.id, { onDelete: "cascade" }),
    threadId: text("thread_id"),
    baseVersion: integer("base_version").notNull(),
    proposedSource: text("proposed_source").notNull(),
    summary: text("summary").notNull(),
    annotationIds: jsonb("annotation_ids").$type<string[]>().notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    decidedAt: bigint("decided_at", { mode: "number" }),
  },
  (t) => [
    check(
      "section_edit_proposals_status_check",
      sql`${t.status} in ('pending', 'accepted', 'rejected', 'superseded')`,
    ),
    uniqueIndex("section_edit_proposals_pending_by_section")
      .on(t.sectionId)
      .where(sql`${t.status} = 'pending'`),
    index("section_edit_proposals_by_owner_section").on(t.ownerUserId, t.sectionId),
  ],
);

export type SectionEditProposal = typeof sectionEditProposals.$inferSelect;
export type NewSectionEditProposal = typeof sectionEditProposals.$inferInsert;
```

- [ ] **Step 3: Registrasi schema + tulis repo**

Di `packages/db/src/schema/index.ts` tambah (urut dekat `documentRevisions`):

```ts
export * from "./documentAnnotations";
export * from "./sectionEditProposals";
```

`packages/db/src/repositories/documentAnnotationRepo.ts`:

```ts
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  type DocumentAnnotation,
  documentAnnotations,
  type NewDocumentAnnotation,
} from "../schema/documentAnnotations";
import type { DbOrTx } from "../types";

/** Repo document_annotations — query Drizzle saja; aturan lifecycle hidup di service. */
export const DocumentAnnotationRepo = {
  async findById(db: DbOrTx, ownerUserId: string, id: string): Promise<DocumentAnnotation | null> {
    const rows = await db
      .select()
      .from(documentAnnotations)
      .where(and(eq(documentAnnotations.ownerUserId, ownerUserId), eq(documentAnnotations.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  async listBySection(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
  ): Promise<DocumentAnnotation[]> {
    return db
      .select()
      .from(documentAnnotations)
      .where(
        and(
          eq(documentAnnotations.ownerUserId, ownerUserId),
          eq(documentAnnotations.sectionId, sectionId),
        ),
      )
      .orderBy(asc(documentAnnotations.createdAt));
  },

  async insert(db: DbOrTx, row: NewDocumentAnnotation): Promise<void> {
    await db.insert(documentAnnotations).values(row);
  },

  async updateById(
    db: DbOrTx,
    id: string,
    patch: Partial<NewDocumentAnnotation>,
  ): Promise<void> {
    await db.update(documentAnnotations).set(patch).where(eq(documentAnnotations.id, id));
  },

  async deleteById(db: DbOrTx, id: string): Promise<void> {
    await db.delete(documentAnnotations).where(eq(documentAnnotations.id, id));
  },

  /** Transisi status massal (mark-sent / resolve / reopen) — dibatasi owner + daftar id. */
  async updateStatusByIds(
    db: DbOrTx,
    ownerUserId: string,
    ids: string[],
    patch: Partial<NewDocumentAnnotation>,
  ): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(documentAnnotations)
      .set(patch)
      .where(
        and(eq(documentAnnotations.ownerUserId, ownerUserId), inArray(documentAnnotations.id, ids)),
      );
  },
};
```

`packages/db/src/repositories/sectionEditProposalRepo.ts`:

```ts
import { and, eq } from "drizzle-orm";
import {
  type NewSectionEditProposal,
  type SectionEditProposal,
  sectionEditProposals,
} from "../schema/sectionEditProposals";
import type { DbOrTx } from "../types";

/** Repo section_edit_proposals — pending-unik per bab dijaga unique parsial di schema. */
export const SectionEditProposalRepo = {
  async findById(
    db: DbOrTx,
    ownerUserId: string,
    id: string,
  ): Promise<SectionEditProposal | null> {
    const rows = await db
      .select()
      .from(sectionEditProposals)
      .where(
        and(eq(sectionEditProposals.ownerUserId, ownerUserId), eq(sectionEditProposals.id, id)),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async findPendingBySection(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
  ): Promise<SectionEditProposal | null> {
    const rows = await db
      .select()
      .from(sectionEditProposals)
      .where(
        and(
          eq(sectionEditProposals.ownerUserId, ownerUserId),
          eq(sectionEditProposals.sectionId, sectionId),
          eq(sectionEditProposals.status, "pending"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewSectionEditProposal): Promise<void> {
    await db.insert(sectionEditProposals).values(row);
  },

  async updateById(
    db: DbOrTx,
    id: string,
    patch: Partial<NewSectionEditProposal>,
  ): Promise<void> {
    await db.update(sectionEditProposals).set(patch).where(eq(sectionEditProposals.id, id));
  },

  /** Supersede pending lama sebuah bab (dipanggil sebelum insert proposal baru). */
  async supersedePendingBySection(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
    decidedAt: number,
  ): Promise<void> {
    await db
      .update(sectionEditProposals)
      .set({ status: "superseded", decidedAt })
      .where(
        and(
          eq(sectionEditProposals.ownerUserId, ownerUserId),
          eq(sectionEditProposals.sectionId, sectionId),
          eq(sectionEditProposals.status, "pending"),
        ),
      );
  },
};
```

Di `packages/db/src/repositories/index.ts` tambah export mengikuti pola file itu (lihat baris existing, mis. `export { DocumentRevisionRepo } from "./documentRevisionRepo";`):

```ts
export { DocumentAnnotationRepo } from "./documentAnnotationRepo";
export { SectionEditProposalRepo } from "./sectionEditProposalRepo";
```

- [ ] **Step 4: Generate + jalankan migrasi**

Run (root): `bun run db:generate`
Expected: file baru `packages/db/drizzle/0043_*.sql` berisi `CREATE TABLE document_annotations` + `CREATE TABLE section_edit_proposals` + index/check di atas.

Run: `bun run db:migrate`
Expected: exit 0 (DB dev; ingat ~1.2s/tx di DB dev).

- [ ] **Step 5: Typecheck db package**

Run: `cd packages/db && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): tabel document_annotations + section_edit_proposals (mig 0043)"
```

---

### Task 2: SyncTeX forward lookup + konversi koordinat PDF-point

**Files:**
- Modify: `packages/services/src/latex/synctex.ts`
- Modify: `packages/services/src/latex/index.ts` (export baru)
- Test: `packages/services/test/latex-synctex.test.ts` (tambah describe)

**Interfaces:**
- Consumes: `SynctexData`/`SynctexRecord`/`parseSynctex` existing.
- Produces: `SP_PER_PDF_POINT: number`; `pdfPointToSp(pt: number): number`; `spToPdfPoint(sp: number): number`; `synctexInverseLookupPdfPoint(data, { page, xPt, yPt }): { file, line } | null`; `synctexForwardLookup(data, { file, line }): { page, xPt, yPt } | null`. Dipakai `AnnotationService` (Task 3) dan re-anchor marker (Task 7).

- [ ] **Step 1: Tulis failing test**

Tambah di `packages/services/test/latex-synctex.test.ts` (import ikut ditambah):

```ts
import {
  parseSynctex,
  pdfPointToSp,
  spToPdfPoint,
  synctexForwardLookup,
  synctexInverseLookup,
  synctexInverseLookupPdfPoint,
} from "../src/latex/synctex";

describe("konversi koordinat sp ↔ PDF point", () => {
  test("round-trip pt → sp → pt stabil", () => {
    expect(spToPdfPoint(pdfPointToSp(100))).toBeCloseTo(100, 3);
    // 1 inch = 72 pt PDF = 72.27 pt TeX = 72.27*65536 sp.
    expect(pdfPointToSp(72)).toBeCloseTo(72.27 * 65536, -2);
  });
});

describe("synctexInverseLookupPdfPoint", () => {
  test("koordinat record (dikonversi ke pt) → baris sumber yang sama", () => {
    const data = parseSynctex(FIXTURE);
    const mainTags = new Set(
      [...data.inputs.entries()].filter(([, p]) => p.endsWith("main.tex")).map(([t]) => t),
    );
    const anchor = data.records.find(
      (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - CITE_LINE) <= 1,
    );
    expect(anchor).toBeDefined();
    if (!anchor) return;
    const found = synctexInverseLookupPdfPoint(data, {
      page: 1,
      xPt: spToPdfPoint(anchor.x * data.unit),
      yPt: spToPdfPoint(anchor.y * data.unit),
    });
    expect(found?.file.endsWith("main.tex")).toBe(true);
    expect(Math.abs((found?.line ?? 0) - CITE_LINE)).toBeLessThanOrEqual(2);
  });
});

describe("synctexForwardLookup", () => {
  test("file+baris \\cite → posisi halaman 1 dengan koordinat pt masuk akal", () => {
    const data = parseSynctex(FIXTURE);
    const hit = synctexForwardLookup(data, { file: "main.tex", line: CITE_LINE });
    expect(hit).not.toBeNull();
    expect(hit?.page).toBe(1);
    // Halaman A4 ≈ 595×842 pt — koordinat wajib dalam rentang halaman.
    expect(hit!.xPt).toBeGreaterThanOrEqual(0);
    expect(hit!.xPt).toBeLessThan(700);
    expect(hit!.yPt).toBeGreaterThanOrEqual(0);
    expect(hit!.yPt).toBeLessThan(900);
  });

  test("file tak dikenal / baris jauh → null atau baris terdekat masih di file itu", () => {
    const data = parseSynctex(FIXTURE);
    expect(synctexForwardLookup(data, { file: "tidak-ada.tex", line: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `cd packages/services && bun test test/latex-synctex.test.ts`
Expected: FAIL — `pdfPointToSp is not exported` (atau setara).

- [ ] **Step 3: Implementasi di `synctex.ts`**

Tambahkan di akhir `packages/services/src/latex/synctex.ts`:

```ts
/**
 * Koordinat file synctex = sp TeX (65536 sp = 1 pt TeX = 1/72.27 inch) dikali `unit`;
 * PDF point = 1/72 inch. Konversi di sini supaya konsumen (anotasi/overlay) hanya
 * berbicara dalam PDF point (satuan viewport pdf.js scale 1).
 */
export const SP_PER_PDF_POINT = (65536 * 72.27) / 72;

export function pdfPointToSp(pt: number): number {
  return pt * SP_PER_PDF_POINT;
}

export function spToPdfPoint(sp: number): number {
  return sp / SP_PER_PDF_POINT;
}

/** Inverse lookup dengan target dalam PDF point (origin kiri-atas halaman). */
export function synctexInverseLookupPdfPoint(
  data: SynctexData,
  target: { page: number; xPt: number; yPt: number },
): { file: string; line: number; distance: number } | null {
  const unit = data.unit || 1;
  return synctexInverseLookup(data, {
    page: target.page,
    x: pdfPointToSp(target.xPt) / unit,
    y: pdfPointToSp(target.yPt) / unit,
  });
}

/**
 * Forward lookup: (file, baris) → posisi PDF (halaman + titik dalam pt). Pilih record dengan
 * selisih baris terkecil pada file tersebut (match by suffix path — Tectonic menulis path
 * absolut tmpdir); seri dipecah oleh baris lebih kecil lalu halaman lebih awal. Dipakai
 * re-anchor marker anotasi lintas build (best-effort — baris yang bergeser jauh oleh
 * suntingan tampil sebagai basi, bukan salah tempat).
 */
export function synctexForwardLookup(
  data: SynctexData,
  target: { file: string; line: number },
): { page: number; xPt: number; yPt: number; line: number } | null {
  const tags = new Set(
    [...data.inputs.entries()].filter(([, p]) => p.endsWith(target.file)).map(([t]) => t),
  );
  if (tags.size === 0) return null;
  const unit = data.unit || 1;
  let best: { record: SynctexRecord; delta: number } | null = null;
  for (const record of data.records) {
    if (!tags.has(record.tag)) continue;
    const delta = Math.abs(record.line - target.line);
    if (
      !best ||
      delta < best.delta ||
      (delta === best.delta && record.page < best.record.page)
    ) {
      best = { record, delta };
    }
  }
  if (!best) return null;
  return {
    page: best.record.page,
    xPt: spToPdfPoint(best.record.x * unit),
    yPt: spToPdfPoint(best.record.y * unit),
    line: best.record.line,
  };
}
```

Tambahkan ke `packages/services/src/latex/index.ts` di blok export synctex:

```ts
export {
  parseSynctex,
  pdfPointToSp,
  SP_PER_PDF_POINT,
  spToPdfPoint,
  type SynctexData,
  type SynctexRecord,
  synctexForwardLookup,
  synctexInverseLookup,
  synctexInverseLookupPdfPoint,
} from "./synctex";
```

- [ ] **Step 4: Jalankan test → lulus**

Run: `cd packages/services && bun test test/latex-synctex.test.ts`
Expected: PASS semua (existing + baru).

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/latex/synctex.ts packages/services/src/latex/index.ts packages/services/test/latex-synctex.test.ts
git commit -m "feat(latex): synctex forward lookup + konversi koordinat PDF point"
```

---

### Task 3: `AnnotationService`

**Files:**
- Create: `packages/services/src/annotation.service.ts`
- Modify: `packages/services/src/index.ts` (export)
- Test: `packages/services/test/annotation-service.test.ts`

**Interfaces:**
- Consumes: `DocumentAnnotationRepo`, `LatexBuildRepo`, `SectionService.assertSectionOwner`, `SectionLatexService.getDocument`, `StorageService.readBytes`, `parseSynctex`/`synctexInverseLookupPdfPoint`/`sectionFilePath` dari `./latex/...` (file langsung, BUKAN barrel latex — synctex hanya `node:zlib`, aman di barrel root).
- Produces:
  - `type AnnotationView = { id, kind, page, rects, selectedText, note, sourceFile, sourceLine, sourceVersion, status, threadId, messageId, createdAt, updatedAt }` (mirror row, tanpa owner/workspace).
  - `AnnotationService.create(db, { ownerUserId, sectionId, kind, page, rects, selectedText?, note? }): Promise<AnnotationView>`
  - `AnnotationService.list(db, { ownerUserId, sectionId }): Promise<AnnotationView[]>`
  - `AnnotationService.update(db, { ownerUserId, sectionId, annotationId, note?, status? ('open'|'dismissed') }): Promise<AnnotationView>`
  - `AnnotationService.remove(db, { ownerUserId, sectionId, annotationId }): Promise<{ ok: true }>`
  - `AnnotationService.markSent(db, { ownerUserId, sectionId, ids, threadId, messageId? }): Promise<{ ok: true }>`
  - Error codes baru: `annotation_not_found` (404), `section_build_not_found` (409).

- [ ] **Step 1: Tulis failing test (DB-gated, tanpa toolchain/S3)**

`packages/services/test/annotation-service.test.ts`:

```ts
/**
 * AnnotationService — DB integration (skip tanpa DATABASE_URL), TANPA toolchain/S3:
 * create butuh build tersimpan (tanpa build → section_build_not_found); build tanpa synctex
 * (synctexR2Key null) → anotasi dibuat dengan source_line null; lifecycle open→sent→
 * dismissed/reopen; guard bibliography. Jalur mapping synctex nyata ada di e2e fase 6.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AppError, createDb, LatexBuildRepo, WorkspaceSectionRepo } from "@aqsha/db";
import { AnnotationService } from "../src/annotation.service";
import { SectionLatexService } from "../src/section-latex.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itan_${SUFFIX}`;
const WS = `itan_${SUFFIX}:ws`;
const SEC = `itan_${SUFFIX}:sec`;
const SEC_BIB = `itan_${SUFFIX}:secbib`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from document_annotations where owner_user_id like 'itan_%'`;
  await client`delete from latex_builds where owner_user_id like 'itan_%'`;
  await client`delete from document_revisions where owner_user_id like 'itan_%'`;
  await client`delete from workspace_sections where workspace_id like 'itan_%'`;
  await client`delete from artifact_contents where owner_user_id like 'itan_%'`;
  await client`delete from artifacts where owner_user_id like 'itan_%'`;
  await client`delete from workspaces where owner_user_id like 'itan_%'`;
  await client`delete from users where owner_user_id like 'itan_%'`;
  await client.end();
});

async function seed(): Promise<void> {
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Uji"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
  await WorkspaceSectionRepo.insertMany(db, [
    { id: SEC, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    { id: SEC_BIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 1, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
  ]);
  const saved = await SectionLatexService.saveDocument(db, {
    ownerUserId: OWNER, sectionId: SEC, source: "Baris satu.\nBaris dua.", author: "user",
  });
  if (saved.status !== "saved") throw new Error("seed save gagal");
}

describe("AnnotationService", () => {
  itest("lifecycle penuh + guard build/bibliography", async () => {
    await seed();

    // Tanpa build tersimpan → tidak ada PDF untuk dianotasi.
    await expect(
      AnnotationService.create(db, {
        ownerUserId: OWNER, sectionId: SEC, kind: "pin", page: 1,
        rects: [{ x: 100, y: 200, w: 0, h: 0 }],
      }),
    ).rejects.toThrow(AppError);

    // Build ok tanpa synctex → anotasi dibuat, mapping null.
    await LatexBuildRepo.insert(db, {
      id: `${SEC}:build`, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC,
      status: "ok", pdfR2Key: "k/pdf", synctexR2Key: null, errors: null, logTail: null,
      sourceVersions: { [SEC]: 1 }, builtAt: NOW,
    });
    const a = await AnnotationService.create(db, {
      ownerUserId: OWNER, sectionId: SEC, kind: "highlight", page: 1,
      rects: [{ x: 72, y: 100, w: 200, h: 12 }], selectedText: "Baris satu.", note: "perjelas",
    });
    expect(a.status).toBe("open");
    expect(a.sourceLine).toBeNull();
    expect(a.sourceVersion).toBe(1);

    // Bibliography tidak bisa dianotasi.
    await expect(
      AnnotationService.create(db, {
        ownerUserId: OWNER, sectionId: SEC_BIB, kind: "pin", page: 1,
        rects: [{ x: 0, y: 0, w: 0, h: 0 }],
      }),
    ).rejects.toThrow(AppError);

    // markSent → sent + threadId; update dismissed → dismissed; reopen → open.
    await AnnotationService.markSent(db, {
      ownerUserId: OWNER, sectionId: SEC, ids: [a.id], threadId: "t1",
    });
    let list = await AnnotationService.list(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(list[0]?.status).toBe("sent");
    expect(list[0]?.threadId).toBe("t1");

    const dismissed = await AnnotationService.update(db, {
      ownerUserId: OWNER, sectionId: SEC, annotationId: a.id, status: "dismissed",
    });
    expect(dismissed.status).toBe("dismissed");
    const reopened = await AnnotationService.update(db, {
      ownerUserId: OWNER, sectionId: SEC, annotationId: a.id, status: "open", note: "revisi",
    });
    expect(reopened.status).toBe("open");
    expect(reopened.note).toBe("revisi");

    await AnnotationService.remove(db, { ownerUserId: OWNER, sectionId: SEC, annotationId: a.id });
    list = await AnnotationService.list(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(list.length).toBe(0);

    // Id asing → annotation_not_found.
    await expect(
      AnnotationService.update(db, {
        ownerUserId: OWNER, sectionId: SEC, annotationId: "nope", status: "open",
      }),
    ).rejects.toThrow(AppError);
  });
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `cd packages/services && bun test test/annotation-service.test.ts`
Expected: FAIL — modul `../src/annotation.service` belum ada. (Tanpa `DATABASE_URL` test ter-skip — jalankan dengan env DB dev.)

- [ ] **Step 3: Implementasi service**

`packages/services/src/annotation.service.ts`:

```ts
import {
  type AnnotationKind,
  type AnnotationRect,
  type AnnotationStatus,
  type Db,
  type DbOrTx,
  type DocumentAnnotation,
  DocumentAnnotationRepo,
  LatexBuildRepo,
  throwAppError,
} from "@aqsha/db";
import { sectionFilePath } from "./latex/assembly.service";
import {
  parseSynctex,
  type SynctexData,
  synctexInverseLookupPdfPoint,
} from "./latex/synctex";
import { SectionLatexService } from "./section-latex.service";
import { SectionService } from "./section.service";
import { StorageService } from "./storage.service";

export type AnnotationView = {
  id: string;
  kind: AnnotationKind;
  page: number;
  rects: AnnotationRect[];
  selectedText: string | null;
  note: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
  sourceVersion: number;
  status: AnnotationStatus;
  threadId: string | null;
  messageId: string | null;
  createdAt: number;
  updatedAt: number;
};

const ANNOTATION_NOTE_MAX = 2000;

// Parse synctex itu murah tapi tidak gratis; satu build dibuka berkali-kali saat user
// menganotasi beruntun → cache kecil ber-key build (builtAt membedakan konten upsert in-place).
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
  } catch (err) {
    // Mapping best-effort: synctex hilang/korup tidak menggagalkan pembuatan anotasi.
    console.error("[annotation] synctex load failed", r2Key, err);
    return null;
  }
}

/** Titik anchor untuk lookup: pusat rect pertama (highlight) / titik pin. */
function anchorPoint(rects: AnnotationRect[]): { xPt: number; yPt: number } {
  const r = rects[0]!;
  return { xPt: r.x + r.w / 2, yPt: r.y + r.h / 2 };
}

function toView(row: DocumentAnnotation): AnnotationView {
  return {
    id: row.id,
    kind: row.kind as AnnotationKind,
    page: row.page,
    rects: row.rects,
    selectedText: row.selectedText,
    note: row.note,
    sourceFile: row.sourceFile,
    sourceLine: row.sourceLine,
    sourceVersion: row.sourceVersion,
    status: row.status as AnnotationStatus,
    threadId: row.threadId,
    messageId: row.messageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertOwnedAnnotation(
  db: DbOrTx,
  ownerUserId: string,
  sectionId: string,
  annotationId: string,
): Promise<DocumentAnnotation> {
  const row = await DocumentAnnotationRepo.findById(db, ownerUserId, annotationId);
  if (!row || row.sectionId !== sectionId) {
    throwAppError({
      message: "Anotasi tidak ditemukan",
      code: "annotation_not_found",
      severity: "warning",
      status: 404,
    });
  }
  return row;
}

export const AnnotationService = {
  /**
   * Buat anotasi di PDF bab. Anchor di-map SEKALI ke (file, baris) sumber via SyncTeX inverse
   * pada build tersimpan; `source_version` = versi sumber yang ter-render build itu, sehingga
   * staleness terdeteksi dengan banding versi. Gagal map (tanpa synctex / di luar body bab)
   * BUKAN error — `selected_text` + `note` tetap konteks berguna bagi agen.
   */
  async create(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      kind: AnnotationKind;
      page: number;
      rects: AnnotationRect[];
      selectedText?: string | null;
      note?: string | null;
    },
  ): Promise<AnnotationView> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (section.role === "bibliography") {
      throwAppError({
        message: "Daftar pustaka digenerate otomatis dan tidak bisa dianotasi",
        code: "bibliography_not_editable",
        severity: "warning",
        status: 422,
      });
    }
    if (input.rects.length === 0 || input.page < 1) {
      throwAppError({
        message: "Anchor anotasi tidak valid",
        code: "annotation_invalid_anchor",
        severity: "warning",
        status: 422,
      });
    }
    if ((input.note ?? "").length > ANNOTATION_NOTE_MAX) {
      throwAppError({
        message: "Catatan anotasi terlalu panjang",
        code: "annotation_note_too_long",
        severity: "warning",
        status: 413,
      });
    }
    const build = await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId);
    if (!build || !build.pdfR2Key) {
      // Tak ada PDF ter-render = tak ada permukaan untuk dianotasi.
      throwAppError({
        message: "Bab belum punya PDF ter-compile untuk dianotasi",
        code: "section_build_not_found",
        severity: "warning",
        status: 409,
      });
    }
    const doc = await SectionLatexService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });
    if (!doc) {
      throwAppError({
        message: "Dokumen bab tidak ditemukan",
        code: "section_document_not_found",
        severity: "error",
        status: 404,
      });
    }

    let sourceFile: string | null = null;
    let sourceLine: number | null = null;
    if (build.synctexR2Key) {
      const data = await loadSynctex(`${build.id}:${build.builtAt}`, build.synctexR2Key);
      if (data) {
        const point = anchorPoint(input.rects);
        const hit = synctexInverseLookupPdfPoint(data, {
          page: input.page,
          xPt: point.xPt,
          yPt: point.yPt,
        });
        const bodyPath = sectionFilePath(input.sectionId);
        // Hanya terima atribusi ke file body bab — hit ke main.tex ter-generate tidak berguna
        // bagi agen (baris preamble/heading bukan sumber yang ia sunting).
        if (hit && hit.file.endsWith(bodyPath)) {
          sourceFile = bodyPath;
          sourceLine = hit.line;
        }
      }
    }

    const now = Date.now();
    const row: DocumentAnnotation = {
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      workspaceId: section.workspaceId,
      sectionId: section.id,
      kind: input.kind,
      page: input.page,
      rects: input.rects,
      selectedText: input.selectedText?.slice(0, 2000) ?? null,
      note: input.note ?? null,
      sourceFile,
      sourceLine,
      sourceVersion: build.sourceVersions[section.id] ?? doc.contentVersion,
      status: "open",
      threadId: null,
      messageId: null,
      createdAt: now,
      updatedAt: now,
    };
    await DocumentAnnotationRepo.insert(db, row);
    return toView(row);
  },

  async list(
    db: DbOrTx,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<AnnotationView[]> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    const rows = await DocumentAnnotationRepo.listBySection(
      db,
      input.ownerUserId,
      input.sectionId,
    );
    return rows.map(toView);
  },

  /** Ubah catatan / transisi status oleh user (hanya `open` ⇄ `dismissed`; `resolved`/`sent` = jalur service). */
  async update(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      annotationId: string;
      note?: string | null;
      status?: "open" | "dismissed";
    },
  ): Promise<AnnotationView> {
    const row = await assertOwnedAnnotation(
      db,
      input.ownerUserId,
      input.sectionId,
      input.annotationId,
    );
    if ((input.note ?? "").length > ANNOTATION_NOTE_MAX) {
      throwAppError({
        message: "Catatan anotasi terlalu panjang",
        code: "annotation_note_too_long",
        severity: "warning",
        status: 413,
      });
    }
    const patch = {
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: Date.now(),
    };
    await DocumentAnnotationRepo.updateById(db, row.id, patch);
    return toView({ ...row, ...patch });
  },

  async remove(
    db: Db,
    input: { ownerUserId: string; sectionId: string; annotationId: string },
  ): Promise<{ ok: true }> {
    const row = await assertOwnedAnnotation(
      db,
      input.ownerUserId,
      input.sectionId,
      input.annotationId,
    );
    await DocumentAnnotationRepo.deleteById(db, row.id);
    return { ok: true };
  },

  /** Tandai anotasi terkirim ke thread (dipanggil klien setelah pesan berangkat via proxy Mastra). */
  async markSent(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      ids: string[];
      threadId: string;
      messageId?: string | null;
    },
  ): Promise<{ ok: true }> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, input.ids, {
      status: "sent",
      threadId: input.threadId,
      messageId: input.messageId ?? null,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
};
```

Tambahkan export ke `packages/services/src/index.ts` (dekat export `SectionLatexService`):

```ts
export { AnnotationService, type AnnotationView } from "./annotation.service";
```

- [ ] **Step 4: Jalankan test → lulus**

Run: `cd packages/services && DATABASE_URL=<db-dev> bun test test/annotation-service.test.ts`
Expected: PASS. Juga jalankan `bunx tsc --noEmit` di packages/services → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/annotation.service.ts packages/services/src/index.ts packages/services/test/annotation-service.test.ts
git commit -m "feat(services): AnnotationService — anchor PDF ter-map SyncTeX + lifecycle antrian"
```

---

### Task 4: Route API anotasi

**Files:**
- Modify: `apps/api/src/routes/workspaces.ts`
- Test: `apps/api/test/annotations.test.ts`

**Interfaces:**
- Consumes: `AnnotationService` (Task 3) via `@aqsha/services`.
- Produces (dipakai hooks Task 5):
  - `GET  /sections/:id/annotations` → `AnnotationView[]`
  - `POST /sections/:id/annotations` `{ kind, page, rects, selectedText?, note? }` → `AnnotationView`
  - `PATCH /sections/:id/annotations/:aid` `{ note?, status? }` → `AnnotationView`
  - `DELETE /sections/:id/annotations/:aid` → `{ ok: true }`
  - `POST /sections/:id/annotations/mark-sent` `{ ids, threadId, messageId? }` → `{ ok: true }`

- [ ] **Step 1: Tulis failing test**

`apps/api/test/annotations.test.ts` (pola `blocknote-ai.test.ts` — mock Clerk, `app.handle`):

```ts
import { afterAll, describe, expect, mock, test } from "bun:test";

mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const suffix = Math.floor(Math.random() * 1e9);
const OWNER = `apian_${suffix}`;

const { app } = await import("../src/index");

function req(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

describe("annotations routes", () => {
  test("tanpa token → 401", async () => {
    const res = await req("GET", "/sections/x/annotations");
    expect(res.status).toBe(401);
  });

  itest("section asing → 404 structured", async () => {
    const res = await req("POST", `/sections/nonexistent_${suffix}/annotations`, `tok_${OWNER}`, {
      kind: "pin",
      page: 1,
      rects: [{ x: 0, y: 0, w: 0, h: 0 }],
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(typeof body.code).toBe("string");
  });
});

afterAll(() => {
  // Gerbang menolak sebelum write — tidak ada resource dibuat.
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `cd apps/api && bun test test/annotations.test.ts`
Expected: FAIL — 404 route not found (route belum ada) pada test pertama (`expect 401` dapat 404).

- [ ] **Step 3: Tambah route**

Di `apps/api/src/routes/workspaces.ts`: import `AnnotationService` dari `@aqsha/services` (barrel root, satu import dengan service lain), tambah schema + route setelah blok build (`.get("/workspaces/:id/build", …)`):

```ts
const annotationKindSchema = t.Union([t.Literal("highlight"), t.Literal("pin")]);
const annotationRectSchema = t.Object({
  x: t.Number(),
  y: t.Number(),
  w: t.Number(),
  h: t.Number(),
});
```

```ts
  // ── Anotasi PDF bab ──────────────────────────────────────────────────────
  .get(
    "/sections/:id/annotations",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return AnnotationService.list(db, { ownerUserId, sectionId: params.id });
    },
    { auth: true },
  )
  .post(
    "/sections/:id/annotations",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return AnnotationService.create(db, {
        ownerUserId,
        sectionId: params.id,
        kind: body.kind,
        page: body.page,
        rects: body.rects,
        selectedText: body.selectedText ?? null,
        note: body.note ?? null,
      });
    },
    {
      auth: true,
      body: t.Object({
        kind: annotationKindSchema,
        page: t.Numeric(),
        rects: t.Array(annotationRectSchema, { minItems: 1, maxItems: 32 }),
        selectedText: t.Optional(t.String()),
        note: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/sections/:id/annotations/:aid",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return AnnotationService.update(db, {
        ownerUserId,
        sectionId: params.id,
        annotationId: params.aid,
        note: body.note,
        status: body.status,
      });
    },
    {
      auth: true,
      body: t.Object({
        note: t.Optional(t.Union([t.String(), t.Null()])),
        status: t.Optional(t.Union([t.Literal("open"), t.Literal("dismissed")])),
      }),
    },
  )
  .delete(
    "/sections/:id/annotations/:aid",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return AnnotationService.remove(db, {
        ownerUserId,
        sectionId: params.id,
        annotationId: params.aid,
      });
    },
    { auth: true },
  )
  .post(
    "/sections/:id/annotations/mark-sent",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return AnnotationService.markSent(db, {
        ownerUserId,
        sectionId: params.id,
        ids: body.ids,
        threadId: body.threadId,
        messageId: body.messageId ?? null,
      });
    },
    {
      auth: true,
      body: t.Object({
        ids: t.Array(t.String(), { minItems: 1, maxItems: 64 }),
        threadId: t.String(),
        messageId: t.Optional(t.String()),
      }),
    },
  )
```

- [ ] **Step 4: Build dist + jalankan test → lulus**

Run: `bun run build:dist && cd apps/api && DATABASE_URL=<db-dev> bun test test/annotations.test.ts`
Expected: PASS (401 + 404 structured).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/workspaces.ts apps/api/test/annotations.test.ts
git commit -m "feat(api): endpoint anotasi bab (list/create/update/delete/mark-sent)"
```

---

### Task 5: queryKeys + hooks svelte (build/compile/anotasi)

**Files:**
- Modify: `apps/svelte/src/lib/query/keys.ts`
- Modify: `apps/svelte/src/lib/features/sections/api.ts`

**Interfaces:**
- Consumes: endpoint Fase 5 (compile/build) + Task 4 (annotations), Eden client `getApiClient()`, `unwrap`.
- Produces (dipakai Task 6–9, 13–15):
  - queryKeys: `workspaces.sectionBuild(sectionId)`, `workspaces.workspaceBuild(id)`, `workspaces.sectionAnnotations(sectionId)`, `workspaces.sectionProposal(sectionId)`.
  - Types: `LatexBuildView`, `LatexCompileOutcome`, `AnnotationView`, `AnnotationRect`.
  - Hooks: `useSectionBuild(sectionId, enabled?)`, `useCompileSection(sectionId)`, `useWorkspaceBuild(workspaceId, enabled?)`, `useCompileWorkspace(workspaceId)`, `useSectionAnnotations(sectionId, enabled?)`, `useCreateAnnotation(sectionId)`, `useUpdateAnnotation(sectionId)`, `useDeleteAnnotation(sectionId)`, `useMarkAnnotationsSent(sectionId)`.

- [ ] **Step 1: Tambah queryKeys**

Di `apps/svelte/src/lib/query/keys.ts`, dalam objek `workspaces` setelah `sectionDocument`:

```ts
		sectionBuild: (sectionId: string) => ['workspaces', 'sectionBuild', sectionId] as const,
		workspaceBuild: (id: string) => ['workspaces', 'workspaceBuild', id] as const,
		sectionAnnotations: (sectionId: string) =>
			['workspaces', 'sectionAnnotations', sectionId] as const,
		sectionProposal: (sectionId: string) => ['workspaces', 'sectionProposal', sectionId] as const
```

- [ ] **Step 2: Tambah types + hooks di `features/sections/api.ts`**

Tambahkan setelah hooks existing (perhatikan: file `.ts` biasa, bukan runes — tetap ikuti pola file):

```ts
export type LatexCompileError = { line: number | null; message: string; severity: string };

export type LatexBuildView = {
	id: string;
	status: 'ok' | 'error';
	errors: LatexCompileError[] | null;
	logTail: string | null;
	sourceVersions: Record<string, number>;
	builtAt: number;
	pdfUrl: string | null;
} | null;

export type LatexCompileOutcome =
	| { status: 'ok'; buildId: string }
	| { status: 'error'; errors: LatexCompileError[] };

export type AnnotationRect = { x: number; y: number; w: number; h: number };

export type AnnotationView = {
	id: string;
	kind: 'highlight' | 'pin';
	page: number;
	rects: AnnotationRect[];
	selectedText: string | null;
	note: string | null;
	sourceFile: string | null;
	sourceLine: number | null;
	sourceVersion: number;
	status: 'open' | 'sent' | 'resolved' | 'dismissed';
	threadId: string | null;
	messageId: string | null;
	createdAt: number;
	updatedAt: number;
};

/** Build per-bab tersimpan (null = belum pernah compile). */
export function useSectionBuild(sectionId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionBuild(sectionId()),
		enabled: enabled() && Boolean(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).build.get()) as LatexBuildView
	}));
}

/** Compile per-bab. Union `status:'error'` = hasil produk (build error), bukan throw. */
export function useCompileSection(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).compile.post()) as LatexCompileOutcome,
		onSettled: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionBuild(sectionId()) });
		}
	}));
}

export function useWorkspaceBuild(workspaceId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.workspaceBuild(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).build.get()) as LatexBuildView
	}));
}

export function useCompileWorkspace(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).compile.post()) as LatexCompileOutcome,
		onSettled: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.workspaceBuild(workspaceId()) });
		}
	}));
}

export function useSectionAnnotations(
	sectionId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionAnnotations(sectionId()),
		enabled: enabled() && Boolean(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).annotations.get()) as AnnotationView[]
	}));
}

export function useCreateAnnotation(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			kind: 'highlight' | 'pin';
			page: number;
			rects: AnnotationRect[];
			selectedText?: string;
			note?: string;
		}) =>
			unwrap(
				await api.sections({ id: sectionId() }).annotations.post(input)
			) as AnnotationView,
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useUpdateAnnotation(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			annotationId: string;
			note?: string | null;
			status?: 'open' | 'dismissed';
		}) =>
			unwrap(
				await api
					.sections({ id: sectionId() })
					.annotations({ aid: input.annotationId })
					.patch({ note: input.note, status: input.status })
			) as AnnotationView,
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useDeleteAnnotation(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (annotationId: string) =>
			unwrap(
				await api.sections({ id: sectionId() }).annotations({ aid: annotationId }).delete()
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useMarkAnnotationsSent(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { ids: string[]; threadId: string; messageId?: string }) =>
			unwrap(
				await api.sections({ id: sectionId() }).annotations['mark-sent'].post(input)
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}
```

Catatan implementer: bentuk pemanggilan Eden untuk segmen `:aid` dan path `mark-sent` di atas mengikuti pola client existing (`api.sections({ id }).document.get()`); verifikasi bentuk persisnya terhadap type `App` saat typecheck — kalau Eden menolak `annotations({ aid })`, bentuk alternatifnya `api.sections({ id }).annotations({ aid: '...' })` vs indexing `['mark-sent']` sudah benar sesuai treaty naming.

- [ ] **Step 3: Typecheck svelte**

Run: `cd apps/svelte && bunx tsc --noEmit` (atau `bun run check` sesuai skrip app)
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/svelte/src/lib/query/keys.ts apps/svelte/src/lib/features/sections/api.ts
git commit -m "feat(svelte): hooks build/compile/anotasi bab + queryKeys"
```

---

### Task 6: `SectionPdfViewer` — text layer + overlay anotasi

**WAJIB: kerjakan file `.svelte` di task ini lewat skill `svelte-code-writer`.** Sebelum menulis, verifikasi API `TextLayer` terhadap `apps/svelte/node_modules/pdfjs-dist/types/src/display/text_layer.d.ts` (v5: `new TextLayer({ textContentSource, container, viewport })` + `.render()`; container butuh CSS var `--scale-factor`).

**Files:**
- Create: `apps/svelte/src/lib/features/sections/components/SectionPdfViewer.svelte`
- Create: `apps/svelte/src/lib/features/sections/components/PdfAnnotatedPage.svelte`
- Create: `apps/svelte/src/lib/features/sections/components/annotation-geometry.ts`
- Test: `apps/svelte/src/lib/features/sections/components/annotation-geometry.spec.ts`

**Interfaces:**
- Consumes: `AnnotationView`/`AnnotationRect` (Task 5).
- Produces:
  - `SectionPdfViewer` props: `{ url: string; annotations: AnnotationView[]; annotatable?: boolean; pinMode?: boolean; activeAnnotationId?: string | null; stale?: boolean; onCreateHighlight?: (a: { page: number; rects: AnnotationRect[]; selectedText: string }) => void; onCreatePin?: (a: { page: number; x: number; y: number }) => void; onSelectAnnotation?: (id: string) => void }`
  - `annotation-geometry.ts`: `clientRectsToPdfRects(rects: DOMRect[], pageBox: DOMRect, scale: number): AnnotationRect[]`; `mergeAdjacentRects(rects: AnnotationRect[]): AnnotationRect[]` (gabung rect per-baris seleksi yang bertumpuk); `pdfRectToCss(rect: AnnotationRect, scale: number): { left, top, width, height }`.

- [ ] **Step 1: Tulis failing test geometri (pure)**

`annotation-geometry.spec.ts` (vitest/bun sesuai runner spec `.spec.ts` existing di apps/svelte):

```ts
import { describe, expect, it } from 'vitest';
import {
	clientRectsToPdfRects,
	mergeAdjacentRects,
	pdfRectToCss
} from './annotation-geometry';

const box = (x: number, y: number, w: number, h: number) =>
	({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;

describe('clientRectsToPdfRects', () => {
	it('mengonversi rect layar → PDF point relatif halaman (bagi skala)', () => {
		// Halaman dirender 1190px untuk lebar dasar 595pt → scale 2.
		const rects = clientRectsToPdfRects([box(120, 240, 200, 24)], box(20, 40, 1190, 1684), 2);
		expect(rects[0]).toEqual({ x: 50, y: 100, w: 100, h: 12 });
	});
});

describe('mergeAdjacentRects', () => {
	it('menggabung rect satu baris yang saling menempel', () => {
		const merged = mergeAdjacentRects([
			{ x: 10, y: 100, w: 50, h: 12 },
			{ x: 60, y: 100.4, w: 40, h: 12 }
		]);
		expect(merged.length).toBe(1);
		expect(merged[0]!.w).toBeCloseTo(90, 0);
	});

	it('baris berbeda tetap terpisah', () => {
		const merged = mergeAdjacentRects([
			{ x: 10, y: 100, w: 50, h: 12 },
			{ x: 10, y: 120, w: 50, h: 12 }
		]);
		expect(merged.length).toBe(2);
	});
});

describe('pdfRectToCss', () => {
	it('mengembalikan px CSS pada skala render', () => {
		expect(pdfRectToCss({ x: 50, y: 100, w: 100, h: 12 }, 2)).toEqual({
			left: 100,
			top: 200,
			width: 200,
			height: 24
		});
	});
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `cd apps/svelte && bunx vitest run src/lib/features/sections/components/annotation-geometry.spec.ts` (sesuaikan runner spec repo — lihat `package.json` script test apps/svelte; bila spec dijalankan `bun test`, pakai itu)
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `annotation-geometry.ts`**

```ts
import type { AnnotationRect } from '../api';

/** Rect layar (client) → PDF point relatif halaman: geser ke origin halaman lalu bagi skala render. */
export function clientRectsToPdfRects(
	rects: DOMRect[],
	pageBox: DOMRect,
	scale: number
): AnnotationRect[] {
	return rects
		.filter((r) => r.width > 0.5 && r.height > 0.5)
		.map((r) => ({
			x: (r.left - pageBox.left) / scale,
			y: (r.top - pageBox.top) / scale,
			w: r.width / scale,
			h: r.height / scale
		}));
}

/** Gabung rect seleksi satu baris (getClientRects per-span pecah-pecah) → satu rect per baris. */
export function mergeAdjacentRects(rects: AnnotationRect[]): AnnotationRect[] {
	const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
	const merged: AnnotationRect[] = [];
	for (const rect of sorted) {
		const last = merged[merged.length - 1];
		const sameLine = last && Math.abs(last.y - rect.y) < rect.h * 0.5;
		const touching = last && rect.x <= last.x + last.w + 2;
		if (last && sameLine && touching) {
			const right = Math.max(last.x + last.w, rect.x + rect.w);
			last.w = right - last.x;
			last.h = Math.max(last.h, rect.h);
		} else {
			merged.push({ ...rect });
		}
	}
	return merged;
}

export function pdfRectToCss(
	rect: AnnotationRect,
	scale: number
): { left: number; top: number; width: number; height: number } {
	return {
		left: rect.x * scale,
		top: rect.y * scale,
		width: rect.w * scale,
		height: rect.h * scale
	};
}
```

- [ ] **Step 4: Jalankan test geometri → lulus**

Run: perintah Step 2.
Expected: PASS.

- [ ] **Step 5: Implementasi `PdfAnnotatedPage.svelte` (via svelte-code-writer)**

Kontrak komponen (pola dasar = `PdfPageCanvas.svelte` existing: lazy IntersectionObserver 800px, re-render saat width berubah, cancel render task):

```svelte
<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import type { AnnotationRect, AnnotationView } from '../api';
	import { clientRectsToPdfRects, mergeAdjacentRects, pdfRectToCss } from './annotation-geometry';

	/**
	 * Satu halaman PDF beranotasi: canvas + text layer (seleksi) + overlay marker.
	 * Text layer WAJIB untuk seleksi teks; overlay diposisikan dalam PDF point × skala render.
	 * Container text layer butuh `--scale-factor` (kontrak pdf.js v4+).
	 */
	let {
		pdf,
		pageNumber,
		width,
		eager = false,
		annotatable = true,
		pinMode = false,
		annotations,
		activeAnnotationId = null,
		onCreateHighlight,
		onCreatePin,
		onSelectAnnotation
	}: {
		pdf: PDFDocumentProxy;
		pageNumber: number;
		width: number;
		eager?: boolean;
		annotatable?: boolean;
		pinMode?: boolean;
		annotations: AnnotationView[];
		activeAnnotationId?: string | null;
		onCreateHighlight?: (a: { page: number; rects: AnnotationRect[]; selectedText: string }) => void;
		onCreatePin?: (a: { page: number; x: number; y: number }) => void;
		onSelectAnnotation?: (id: string) => void;
	} = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let textLayerEl = $state<HTMLDivElement | null>(null);
	let visible = $state(untrack(() => eager));
	let renderedFor = $state<string | null>(null);
	let baseWidth = $state(595); // diganti ukuran asli saat halaman dimuat
	const scale = $derived(width > 0 && baseWidth > 0 ? width / baseWidth : 1);
	const estimatedHeight = $derived(Math.round(width * 1.414));
	const pageAnnotations = $derived(annotations.filter((a) => a.page === pageNumber));

	// Lazy in-view — identik pola PdfPageCanvas.
	$effect(() => {
		if (!browser || visible) return;
		const el = containerEl;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					visible = true;
					io.disconnect();
				}
			},
			{ rootMargin: '800px 0px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	// Render canvas + text layer saat visible/zoom berubah.
	$effect(() => {
		if (!browser || !visible || width <= 0) return;
		const targetWidth = width;
		const canvas = canvasEl;
		const textContainer = textLayerEl;
		const key = `${pageNumber}-${targetWidth}`;
		if (!canvas || !textContainer || renderedFor === key) return;

		let cancelled = false;
		let task: { cancel: () => void } | null = null;
		(async () => {
			try {
				const pdfjs = await import('pdfjs-dist');
				const page = await pdf.getPage(pageNumber);
				if (cancelled) return;
				const base = page.getViewport({ scale: 1 });
				baseWidth = base.width;
				const viewport = page.getViewport({ scale: targetWidth / base.width });
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				const renderTask = page.render({ canvasContext: ctx, viewport, canvas });
				task = renderTask;
				await renderTask.promise;
				if (cancelled) return;

				// Text layer: pdf.js menulis span terposisi absolut; --scale-factor wajib
				// supaya offset span cocok dengan canvas (kontrak pdf.js v4+).
				textContainer.replaceChildren();
				textContainer.style.setProperty('--scale-factor', String(viewport.scale));
				const textLayer = new pdfjs.TextLayer({
					textContentSource: page.streamTextContent(),
					container: textContainer,
					viewport
				});
				await textLayer.render();
				if (!cancelled) renderedFor = key;
			} catch {
				// Render dibatalkan (zoom beruntun) → biarkan; render baru menggantikan.
			}
		})();
		return () => {
			cancelled = true;
			task?.cancel();
		};
	});

	function handleMouseUp(): void {
		if (!annotatable || pinMode || !onCreateHighlight) return;
		const selection = window.getSelection();
		const container = containerEl;
		if (!selection || selection.isCollapsed || !container) return;
		const range = selection.getRangeAt(0);
		if (!container.contains(range.commonAncestorContainer)) return;
		const text = selection.toString().trim();
		if (!text) return;
		const pageBox = container.getBoundingClientRect();
		const rects = mergeAdjacentRects(
			clientRectsToPdfRects([...range.getClientRects()], pageBox, scale)
		);
		if (rects.length === 0) return;
		onCreateHighlight({ page: pageNumber, rects, selectedText: text.slice(0, 2000) });
		selection.removeAllRanges();
	}

	function handleClick(event: MouseEvent): void {
		if (!annotatable || !pinMode || !onCreatePin) return;
		const container = containerEl;
		if (!container) return;
		const pageBox = container.getBoundingClientRect();
		onCreatePin({
			page: pageNumber,
			x: (event.clientX - pageBox.left) / scale,
			y: (event.clientY - pageBox.top) / scale
		});
	}
</script>

<div
	bind:this={containerEl}
	id={`pdf-page-${pageNumber}`}
	data-page={pageNumber}
	class="aqsha-pdf-page relative mx-auto select-text"
	style={`width:${width}px`}
	onmouseup={handleMouseUp}
	onclick={handleClick}
	role="presentation"
>
	{#if visible}
		<canvas bind:this={canvasEl} class="block h-auto w-full"></canvas>
		<div bind:this={textLayerEl} class="aqsha-pdf-textlayer absolute inset-0"></div>
		<div class="pointer-events-none absolute inset-0">
			{#each pageAnnotations as annotation (annotation.id)}
				{#each annotation.rects as rect, i (i)}
					{@const css = pdfRectToCss(rect, scale)}
					<button
						type="button"
						class="pointer-events-auto absolute rounded-sm border-2 transition-colors
							{annotation.id === activeAnnotationId
							? 'border-primary bg-primary/20'
							: annotation.kind === 'highlight'
								? 'border-transparent bg-lemon/40 hover:bg-lemon/60'
								: 'border-coral bg-coral/20 hover:bg-coral/40'}
							{annotation.status === 'resolved' || annotation.status === 'dismissed' ? 'opacity-30' : ''}"
						style={`left:${css.left}px;top:${css.top}px;width:${Math.max(css.width, 12)}px;height:${Math.max(css.height, 12)}px`}
						aria-label={`Anotasi: ${annotation.note ?? annotation.selectedText ?? 'pin'}`}
						onclick={(e) => {
							e.stopPropagation();
							onSelectAnnotation?.(annotation.id);
						}}
					></button>
				{/each}
			{/each}
		</div>
	{:else}
		<div style={`height:${estimatedHeight}px`}></div>
	{/if}
</div>

<style>
	/* Gaya minimal text layer pdf.js (tanpa import CSS penuh viewer): teks transparan,
	   span absolut mengikuti transform yang ditulis pdf.js. */
	.aqsha-pdf-textlayer {
		overflow: hidden;
		line-height: 1;
		opacity: 1;
	}
	.aqsha-pdf-textlayer :global(span) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0 0;
	}
	.aqsha-pdf-textlayer :global(::selection) {
		background: color-mix(in oklch, var(--primary) 30%, transparent);
	}
</style>
```

Catatan implementer: token warna `lemon`/`coral`/`primary` = token DESIGN.md apps/svelte; sesuaikan nama kelas Tailwind dengan token yang benar di `globals.css` (cek `apps/svelte/src/styles/globals.css`) — jangan mengarang palette baru.

- [ ] **Step 6: Implementasi `SectionPdfViewer.svelte` (via svelte-code-writer)**

Shell viewer: pola `PdfArtifactViewer.svelte` (load dokumen dynamic import + worker URL, fit width, zoom toolbar, page nav) TANPA fitur search/fullscreen (YAGNI di bab; boleh menyusul), PLUS props anotasi diteruskan per halaman, indikator basi, dan preservasi scroll saat URL berganti:

```svelte
<script lang="ts">
	import { browser } from '$app/environment';
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, Loader2Icon, AlertCircleIcon, MinusIcon, PlusIcon, PinIcon } from '$lib/icons';
	import type { AnnotationRect, AnnotationView } from '../api';
	import PdfAnnotatedPage from './PdfAnnotatedPage.svelte';

	/**
	 * Viewer PDF bab: canvas + text layer + overlay anotasi. `url` berganti tiap build baru —
	 * scroll container dipertahankan lintas swap supaya recompile tidak melempar posisi baca.
	 */
	let {
		url,
		annotations = [],
		annotatable = true,
		pinMode = $bindable(false),
		activeAnnotationId = null,
		stale = false,
		onCreateHighlight,
		onCreatePin,
		onSelectAnnotation
	}: {
		url: string;
		annotations?: AnnotationView[];
		annotatable?: boolean;
		pinMode?: boolean;
		activeAnnotationId?: string | null;
		stale?: boolean;
		onCreateHighlight?: (a: { page: number; rects: AnnotationRect[]; selectedText: string }) => void;
		onCreatePin?: (a: { page: number; x: number; y: number }) => void;
		onSelectAnnotation?: (id: string) => void;
	} = $props();

	const MAX_PAGE_WIDTH = 820;
	let scrollEl = $state<HTMLDivElement | null>(null);
	let pdf = $state<PDFDocumentProxy | null>(null);
	let numPages = $state(0);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let fitWidth = $state(0);
	let zoom = $state(1);
	let savedScrollTop = 0;

	const pageWidth = $derived(fitWidth > 0 ? Math.max(240, Math.round(fitWidth * zoom)) : 0);

	// Muat dokumen; simpan scroll sebelum swap URL, pulihkan setelah siap.
	$effect(() => {
		if (!browser) return;
		const src = url;
		let cancelled = false;
		let doc: PDFDocumentProxy | null = null;
		savedScrollTop = scrollEl?.scrollTop ?? 0;
		status = 'loading';
		(async () => {
			try {
				const pdfjs = await import('pdfjs-dist');
				pdfjs.GlobalWorkerOptions.workerSrc = new URL(
					'pdfjs-dist/build/pdf.worker.min.mjs',
					import.meta.url
				).toString();
				doc = await pdfjs.getDocument({ url: src, verbosity: 0 }).promise;
				if (cancelled) {
					void doc.destroy();
					return;
				}
				pdf = doc;
				numPages = doc.numPages;
				status = 'ready';
				requestAnimationFrame(() => {
					if (scrollEl && savedScrollTop > 0) scrollEl.scrollTop = savedScrollTop;
				});
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
			void doc?.destroy();
		};
	});

	// Ukur lebar kolom (pola viewer existing).
	$effect(() => {
		if (!browser) return;
		const el = scrollEl;
		if (!el) return;
		const measure = () => {
			const w = el.clientWidth - 32;
			if (w > 0) fitWidth = Math.min(w, MAX_PAGE_WIDTH);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	{#if stale}
		<div
			class="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border-2 border-border bg-card px-3 py-1 text-label text-muted-foreground"
			role="status"
		>
			PDF belum mencerminkan perubahan terakhir
		</div>
	{/if}
	<div bind:this={scrollEl} class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
		{#if status === 'loading'}
			<div class="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground">
				<Icon icon={Loader2Icon} class="size-4 animate-spin" /> Memuat PDF…
			</div>
		{:else if status === 'error'}
			<div class="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground">
				<Icon icon={AlertCircleIcon} class="size-4 text-destructive" /> PDF tidak bisa ditampilkan.
			</div>
		{:else if pdf && pageWidth > 0}
			<div class="w-full space-y-5">
				{#each Array.from({ length: numPages }, (_, i) => i + 1) as pageNumber (pageNumber)}
					<PdfAnnotatedPage
						pdf={pdf!}
						{pageNumber}
						width={pageWidth}
						eager={pageNumber <= 2}
						{annotatable}
						{pinMode}
						{annotations}
						{activeAnnotationId}
						{onCreateHighlight}
						{onCreatePin}
						{onSelectAnnotation}
					/>
				{/each}
			</div>
		{/if}
	</div>
	{#if status === 'ready'}
		<div
			role="toolbar"
			aria-label="Alat baca PDF"
			class="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border-2 border-border bg-card px-1.5 py-1"
		>
			<Button type="button" variant="ghost" size="icon-sm" aria-label="Perkecil" disabled={zoom <= 0.5} onclick={() => (zoom = Math.max(0.5, Math.round((zoom - 0.2) * 100) / 100))}>
				<Icon icon={MinusIcon} class="size-4" />
			</Button>
			<button type="button" class="min-w-12 px-1.5 text-[12px] font-medium tabular-nums text-muted-foreground" onclick={() => (zoom = 1)} title="Pas lebar">
				{Math.round(zoom * 100)}%
			</button>
			<Button type="button" variant="ghost" size="icon-sm" aria-label="Perbesar" disabled={zoom >= 3} onclick={() => (zoom = Math.min(3, Math.round((zoom + 0.2) * 100) / 100))}>
				<Icon icon={PlusIcon} class="size-4" />
			</Button>
			{#if annotatable}
				<span class="mx-0.5 h-5 w-px shrink-0 bg-border"></span>
				<Button
					type="button"
					variant={pinMode ? 'secondary' : 'ghost'}
					size="icon-sm"
					aria-label={pinMode ? 'Matikan mode pin' : 'Mode pin — klik PDF untuk menandai titik'}
					aria-pressed={pinMode}
					onclick={() => (pinMode = !pinMode)}
				>
					<Icon icon={PinIcon} class="size-4" />
				</Button>
			{/if}
		</div>
	{/if}
</div>
```

Catatan implementer: `PinIcon` — bila belum ada di `$lib/icons`, tambah export Lucide-compatible di `packages/ui/src/icons.tsx`? TIDAK — itu paket React `apps/web`. Untuk apps/svelte, mirror ikon ada di `$lib/icons` (aturan Fase 3 svelte); tambah di adapter svelte tersebut mengikuti pola ikon existing di file itu.

- [ ] **Step 7: Typecheck + lint**

Run: `cd apps/svelte && bunx tsc --noEmit && cd ../.. && bun run lint 2>/dev/null | tail -5`
Expected: exit 0 untuk typecheck; lint svelte bersih untuk file baru.

- [ ] **Step 8: Commit**

```bash
git add apps/svelte/src/lib/features/sections/components/
git commit -m "feat(svelte): SectionPdfViewer — text layer + overlay anotasi + geometri seleksi"
```

---

### Task 7: Rework `SectionEditorPage` — viewer + antrian anotasi + compile UX

**WAJIB skill `svelte-code-writer`.**

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`
- Create: `apps/svelte/src/lib/features/sections/components/AnnotationQueuePanel.svelte`
- Create: `apps/svelte/src/lib/features/sections/components/SectionBuildErrorPanel.svelte`
- Create: `apps/svelte/src/lib/features/sections/components/AnnotationComposerDialog.svelte`

**Interfaces:**
- Consumes: semua hooks Task 5, `SectionPdfViewer` (Task 6), `ProjectSidePanel`, `ComposerMentions` (`setComposerMentions` — halaman ini WAJIB membuat instance sendiri seperti `ProjectHomePage`, prasyarat draft-prefill Task 15).
- Produces: state halaman yang dipakai Task 13–15: `selectedAnnotationIds: Set<string>` (antrian terpilih), fungsi `requestCompile()` (coalesce), `pinMode`.

- [ ] **Step 1: `AnnotationComposerDialog.svelte`** — dialog kecil (shadcn-svelte Dialog/Popover pola repo): muncul setelah seleksi/pin, field catatan opsional + tombol "Simpan anotasi"/"Batal". Props: `{ open: boolean; kind: 'highlight' | 'pin'; excerpt: string | null; onSubmit: (note: string) => void; onCancel: () => void }`. Tampilkan excerpt terpotong (line-clamp-2) untuk konfirmasi konteks.

- [ ] **Step 2: `AnnotationQueuePanel.svelte`** — daftar anotasi bab (props `{ annotations: AnnotationView[]; selectedIds: Set<string>; currentVersion: number; onToggle(id); onDismiss(id); onDelete(id); onFocus(id) }`): item = badge jenis (highlight/pin) + halaman + cuplikan `selectedText`/note + checkbox ikut-kirim (hanya status `open`), item `sent` ditampilkan redup dengan label "terkirim", `sourceVersion !== currentVersion` → badge "basi". Sertakan empty state ("Tandai teks di PDF untuk membuat anotasi").

- [ ] **Step 3: Rework `SectionEditorPage.svelte`**

Kerangka state (bagian script; markup mengikuti layout stub existing — header + `DetailSplitLayout` + `ProjectSidePanel` dipertahankan):

```ts
import {
	useSectionAnnotations, useCreateAnnotation, useUpdateAnnotation, useDeleteAnnotation,
	useSectionBuild, useCompileSection, useSectionDocument,
	type AnnotationRect
} from '../api';
import {
	ComposerMentions, setComposerMentions
} from '$lib/features/threads/state/composer-mentions.svelte';
import { SvelteSet } from 'svelte/reactivity';

const mentions = new ComposerMentions();
setComposerMentions(mentions);

const document = useSectionDocument(() => sectionId);
const build = useSectionBuild(() => sectionId);
const annotations = useSectionAnnotations(() => sectionId);
const createAnnotation = useCreateAnnotation(() => sectionId);
const compile = useCompileSection(() => sectionId);

let pinMode = $state(false);
let activeAnnotationId = $state<string | null>(null);
const selectedAnnotationIds = new SvelteSet<string>();
let pendingAnchor = $state<
	| { kind: 'highlight'; page: number; rects: AnnotationRect[]; selectedText: string }
	| { kind: 'pin'; page: number; rects: AnnotationRect[] }
	| null
>(null);

const stale = $derived.by(() => {
	const b = build.data;
	const d = document.data;
	if (!b || !d) return false;
	return b.sourceVersions[sectionId] !== d.contentVersion;
});

// Satu compile in-flight; trigger beruntun coalesce — yang terakhir menang.
let compileQueued = false;
function requestCompile(): void {
	if (compile.isPending) {
		compileQueued = true;
		return;
	}
	compile.mutate(undefined, {
		onSettled: () => {
			if (compileQueued) {
				compileQueued = false;
				requestCompile();
			}
		}
	});
}

// Buka halaman: build tersimpan langsung tampil; basi/belum ada (padahal sumber ada) → auto-compile sekali.
let autoCompiled = false;
$effect(() => {
	if (autoCompiled || build.isPending || document.isPending) return;
	const hasSource = Boolean(document.data);
	if (!hasSource) return;
	if (!build.data || stale) {
		autoCompiled = true;
		requestCompile();
	}
});
```

Alur create: `onCreateHighlight`/`onCreatePin` dari viewer → set `pendingAnchor` (pin: `rects=[{x,y,w:0,h:0}]`) → dialog → submit → `createAnnotation.mutate({ kind, page, rects, selectedText?, note })`, matikan `pinMode` setelah pin dibuat. Error mutation → toast `readableApiErrorMessage`.

Markup main column:
- Header existing + tambahan: Badge basi (`stale`), tombol "Compile ulang" (`requestCompile`, spinner saat `compile.isPending`), Badge `Sumber v{contentVersion}`.
- `build.data?.status === 'error'` → `SectionBuildErrorPanel` (Step 4) di atas viewer.
- `build.data?.pdfUrl` → `SectionPdfViewer` (props lengkap); else-if `document.data` tanpa build → state "Menyiapkan PDF…" (auto-compile berjalan); else empty-state "Bab ini belum ditulis" + CTA "Tulis dengan Astra" (`mentions.setComposerDraft('Tuliskan draf awal bab "' + section.title + '" …'); panelTab = 'chat'`).
- `AnnotationQueuePanel` di kolom kanan main (atau collapsible di bawah header — putuskan saat implementasi dengan skill impeccable; konsisten DESIGN.md flat-card).
- Bab `role='bibliography'`: tetap `BibliographyView` (tanpa viewer/anotasi) — jangan regres.

- [ ] **Step 4: `SectionBuildErrorPanel.svelte`** — props `{ errors: LatexCompileError[]; logTail: string | null; onAskAstra?: () => void }`: daftar error (baris + pesan, severity badge), `logTail` dalam Collapsible (pola tw-animate-css repo), tombol "Minta Astra perbaiki" bila `onAskAstra` ada (di-wire Task 15; sebelum itu jangan render tombolnya).

- [ ] **Step 5: Verifikasi manual (bun dev)**

Run: `bun dev` lalu buka `/app/projects/<id>/sections/<sid>` dengan bab yang sudah punya sumber (seed Fase 5).
Expected: PDF tampil; seleksi teks → dialog → anotasi tersimpan + marker kuning; mode pin → klik → pin; reload → anotasi masih ada; edit sumber (via API/PUT manual) → indikator basi muncul → compile ulang → marker build lama tetap dirender (posisi lama), antrian menandai basi.

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/svelte && bunx tsc --noEmit`
Expected: exit 0.

```bash
git add apps/svelte/src/lib/features/sections/
git commit -m "feat(svelte): halaman bab — viewer PDF + antrian anotasi + compile UX (basi/auto/coalesce)"
```

---

### Task 8: Preview full-document

**WAJIB skill `svelte-code-writer`.**

**Files:**
- Create: `apps/svelte/src/routes/app/(product)/projects/[projectId]/preview/+page.svelte`
- Create: `apps/svelte/src/lib/features/workspaces/pages/ProjectPreviewPage.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/components/ProjectHeader.svelte` (tombol "Pratinjau dokumen")

**Interfaces:**
- Consumes: `useWorkspaceBuild`, `useCompileWorkspace` (Task 5), `SectionPdfViewer` dengan `annotatable={false}` (Task 6).

- [ ] **Step 1: Route passthrough** — `+page.svelte` pola route section existing: render `ProjectPreviewPage` dengan `page.params.projectId!`.

- [ ] **Step 2: `ProjectPreviewPage.svelte`** — header ringkas (tombol kembali ke proyek, judul "Pratinjau dokumen", tombol "Compile dokumen penuh" + spinner, badge basi bila ada bab dengan `contentVersion` > `sourceVersions[bab]`; pendeteksian basi full-doc cukup banding `useSections` `updatedAt`? TIDAK — pakai kontrak yang ada: tampilkan badge "mungkin belum termutakhir" bila `builtAt` build < max `updatedAt` sections; heuristik ini cukup untuk preview, catat sebagai komentar why) + `SectionPdfViewer url={build.data.pdfUrl} annotatable={false}`; empty state bila belum pernah compile → CTA compile. Auto-compile TIDAK dilakukan di preview (compile full lebih mahal; user memicu eksplisit).

- [ ] **Step 3: Tombol dari rumah proyek** — di `ProjectHeader.svelte` tambah Button `href={resolve('/app/(product)/projects/[projectId]/preview', { projectId })}` "Pratinjau dokumen" (ikon file/eye dari `$lib/icons`), penempatan ikuti pola aksi header existing.

- [ ] **Step 4: Verifikasi manual** — dari rumah proyek klik Pratinjau → compile penuh → PDF semua bab + daftar pustaka; anotasi tidak aktif (seleksi tidak memunculkan dialog).

- [ ] **Step 5: Commit**

```bash
git add apps/svelte/src/routes/app/\(product\)/projects/\[projectId\]/preview apps/svelte/src/lib/features/workspaces/
git commit -m "feat(svelte): pratinjau dokumen penuh — compile full + viewer tanpa anotasi"
```

---

### Task 9: Checkpoint 6a

- [ ] **Step 1: Suite penuh**

Run (root):
```bash
bun run build:dist && bun run typecheck; bun run test; bun run lint
```
Expected: typecheck workspaces svelte/api/services/db bersih (kecuali error pra-eksis `apps/web` features/citations+workspaces yang terdokumentasi di gate report — JANGAN bertambah); test db+chat-core+services+api pass (env-gated skip wajar); lint bersih.

- [ ] **Step 2: Verifikasi manual 6a end-to-end** (bun dev): checklist Task 7 Step 5 + Task 8 Step 4 + a11y cepat (semua kontrol viewer/queue bisa keyboard + aria-label; WCAG 2.2 AA kontras token DESIGN.md).

- [ ] **Step 3: Commit penutup 6a (bila ada sisa perubahan)**

```bash
git add -A && git commit -m "test(svelte): checkpoint 6a — viewer+anotasi+compile UX terverifikasi"
```

---

# TAHAP 6b — Loop editing agen

### Task 10: `SectionProposalService` (apply edits + dry-run compile + accept/reject)

**Files:**
- Create: `packages/services/src/latex/section-proposal.service.ts`
- Modify: `packages/services/src/latex/build.service.ts` (ekstrak helper konteks compile)
- Modify: `packages/services/src/latex/index.ts` (export)
- Test: `packages/services/test/section-proposal.test.ts`

**Interfaces:**
- Consumes: `SectionLatexService.getDocument/saveDocument`, `assembleSection`, `LatexCompileService.compile`, `SectionEditProposalRepo`, `DocumentAnnotationRepo`, `getRateLimiter` (`@aqsha/services/quota` → import relatif `../quota`), helper baru `loadSectionCompileContext`.
- Produces:
  - `type ProposalEdit = { oldText: string; newText: string }`
  - `applyProposalEdits(source: string, edits: ProposalEdit[]): { ok: true; source: string } | { ok: false; index: number; reason: 'not_found' | 'ambiguous'; matches: number }` (pure, exported)
  - `type ProposeSectionEditResult = { ok: true; proposalId: string; summary: string } | { ok: false; reason: 'compile_error'; compileErrors: CompileError[] } | { ok: false; reason: 'edit_mismatch'; message: string }`
  - `SectionProposalService.propose(db, { ownerUserId, sectionId, edits?, fullSource?, summary, respondsToAnnotationIds?, threadId?, enforceRateLimit? }): Promise<ProposeSectionEditResult>`
  - `type AcceptProposalResult = { status: 'accepted'; contentVersion: number } | { status: 'stale'; currentVersion: number }`
  - `SectionProposalService.accept(db, { ownerUserId, proposalId }): Promise<AcceptProposalResult>`
  - `SectionProposalService.reject(db, { ownerUserId, proposalId }): Promise<{ ok: true }>`
  - `type PendingProposalView = { id, sectionId, baseVersion, proposedSource, summary, annotationIds, threadId, createdAt, currentSource, currentVersion, isStale }`
  - `SectionProposalService.getPending(db, { ownerUserId, sectionId }): Promise<PendingProposalView | null>`
  - Dari build.service: `loadSectionCompileContext(db, { ownerUserId, sectionId }): Promise<{ section, project, bib, doc }>` (dipakai `compileSection` DAN `propose`).

- [ ] **Step 1: Refactor `build.service.ts`** — ekstrak badan awal `compileSection` (assert section + role guard + getDocument + `projectInput` + `projectBib`) menjadi:

```ts
/** Konteks compile satu bab (section+doc+preamble-input+bib) — dipakai build resmi & dry-run proposal. */
export async function loadSectionCompileContext(
  db: Db,
  input: { ownerUserId: string; sectionId: string },
) {
  const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
  if (section.role === "bibliography") {
    throwAppError({
      message: "Daftar pustaka dirender saat compile dokumen penuh",
      code: "bibliography_not_editable",
      severity: "warning",
      status: 422,
    });
  }
  const doc = await SectionLatexService.getDocument(db, {
    ownerUserId: input.ownerUserId,
    sectionId: input.sectionId,
  });
  const project = await projectInput(db, input.ownerUserId, section.workspaceId);
  const bib = await projectBib(db, input.ownerUserId, section.workspaceId);
  return { section, doc, project, bib };
}
```

`compileSection` memakai helper ini (guard `!doc` → `section_document_not_found` tetap di `compileSection`, karena dry-run proposal boleh berjalan atas bab kosong dengan `fullSource`). Jalankan `bun test test/latex-build-service.test.ts test/latex-phase5-e2e.test.ts` → tetap pass (nol regresi).

- [ ] **Step 2: Tulis failing test**

`packages/services/test/section-proposal.test.ts`:

```ts
/**
 * SectionProposalService — unit applyProposalEdits (pure) + DB integration guard-path
 * TANPA toolchain (propose edit_mismatch tidak menyentuh compile; accept/reject/supersede
 * atas proposal yang di-seed langsung via repo). Jalur dry-run compile nyata = e2e fase 6.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb, SectionEditProposalRepo, WorkspaceSectionRepo } from "@aqsha/db";
import {
  applyProposalEdits,
  SectionProposalService,
} from "../src/latex/section-proposal.service";
import { SectionLatexService } from "../src/section-latex.service";

describe("applyProposalEdits", () => {
  const source = "Baris satu.\nBaris dua.\nBaris satu lagi.";
  test("match unik diterapkan berurutan", () => {
    const out = applyProposalEdits(source, [
      { oldText: "Baris dua.", newText: "Baris kedua." },
    ]);
    expect(out).toEqual({ ok: true, source: "Baris satu.\nBaris kedua.\nBaris satu lagi." });
  });
  test("oldText tak ditemukan → not_found dengan index", () => {
    const out = applyProposalEdits(source, [{ oldText: "tidak ada", newText: "x" }]);
    expect(out).toMatchObject({ ok: false, index: 0, reason: "not_found" });
  });
  test("oldText ambigu → ambiguous + jumlah kecocokan", () => {
    const out = applyProposalEdits(source, [{ oldText: "Baris satu", newText: "X" }]);
    expect(out).toMatchObject({ ok: false, reason: "ambiguous", matches: 2 });
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itpr_${SUFFIX}`;
const WS = `itpr_${SUFFIX}:ws`;
const SEC = `itpr_${SUFFIX}:sec`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from section_edit_proposals where owner_user_id like 'itpr_%'`;
  await client`delete from document_annotations where owner_user_id like 'itpr_%'`;
  await client`delete from document_revisions where owner_user_id like 'itpr_%'`;
  await client`delete from workspace_sections where workspace_id like 'itpr_%'`;
  await client`delete from artifact_contents where owner_user_id like 'itpr_%'`;
  await client`delete from artifacts where owner_user_id like 'itpr_%'`;
  await client`delete from workspaces where owner_user_id like 'itpr_%'`;
  await client`delete from users where owner_user_id like 'itpr_%'`;
  await client.end();
});

describe("SectionProposalService accept/reject", () => {
  itest("accept CAS → author agent; stale → superseded; reject → rejected", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
      values (${WS}, ${OWNER}, ${"Uji"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER, sectionId: SEC, source: "Versi satu.", author: "user",
    });
    if (saved.status !== "saved") throw new Error("seed gagal");

    // Proposal valid atas baseVersion 1 (seed langsung — jalur compile di e2e).
    const pid = crypto.randomUUID();
    await SectionEditProposalRepo.insert(db, {
      id: pid, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC, threadId: null,
      baseVersion: 1, proposedSource: "Versi dua (agen).", summary: "Perbaiki kalimat",
      annotationIds: [], status: "pending", createdAt: NOW, decidedAt: null,
    });
    const pending = await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(pending?.id).toBe(pid);
    expect(pending?.isStale).toBe(false);

    const accepted = await SectionProposalService.accept(db, { ownerUserId: OWNER, proposalId: pid });
    expect(accepted).toMatchObject({ status: "accepted", contentVersion: 2 });
    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(doc?.source).toBe("Versi dua (agen).");
    const rev = await client`select author from document_revisions
      where owner_user_id = ${OWNER} order by version desc limit 1`;
    expect(rev[0]?.author).toBe("agent");

    // Proposal kedua atas baseVersion basi → accept = stale + superseded.
    const pid2 = crypto.randomUUID();
    await SectionEditProposalRepo.insert(db, {
      id: pid2, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC, threadId: null,
      baseVersion: 1, proposedSource: "Menimpa?", summary: "basi",
      annotationIds: [], status: "pending", createdAt: NOW, decidedAt: null,
    });
    const staleRes = await SectionProposalService.accept(db, { ownerUserId: OWNER, proposalId: pid2 });
    expect(staleRes).toMatchObject({ status: "stale", currentVersion: 2 });
    const row2 = await SectionEditProposalRepo.findById(db, OWNER, pid2);
    expect(row2?.status).toBe("superseded");

    // Reject.
    const pid3 = crypto.randomUUID();
    await SectionEditProposalRepo.insert(db, {
      id: pid3, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC, threadId: null,
      baseVersion: 2, proposedSource: "Versi tiga.", summary: "opsional",
      annotationIds: [], status: "pending", createdAt: NOW, decidedAt: null,
    });
    await SectionProposalService.reject(db, { ownerUserId: OWNER, proposalId: pid3 });
    const row3 = await SectionEditProposalRepo.findById(db, OWNER, pid3);
    expect(row3?.status).toBe("rejected");
  });

  itest("propose edit_mismatch tidak menulis proposal (tanpa compile)", async () => {
    const res = await SectionProposalService.propose(db, {
      ownerUserId: OWNER, sectionId: SEC,
      edits: [{ oldText: "tidak pernah ada", newText: "x" }],
      summary: "salah anchor", enforceRateLimit: false,
    });
    expect(res).toMatchObject({ ok: false, reason: "edit_mismatch" });
    const pending = await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(pending).toBeNull();
  });
});
```

Run: `cd packages/services && DATABASE_URL=<db-dev> bun test test/section-proposal.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi service**

`packages/services/src/latex/section-proposal.service.ts`:

```ts
import {
  type Db,
  DocumentAnnotationRepo,
  type SectionEditProposal,
  SectionEditProposalRepo,
  throwAppError,
} from "@aqsha/db";
import { getRateLimiter } from "../quota";
import { LATEX_SOURCE_MAX_BYTES, SectionLatexService } from "../section-latex.service";
import { assembleSection } from "./assembly.service";
import { loadSectionCompileContext } from "./build.service";
import { LatexCompileService } from "./compile.service";
import type { CompileError } from "./types";

export type ProposalEdit = { oldText: string; newText: string };

export type ProposeSectionEditResult =
  | { ok: true; proposalId: string; summary: string }
  | { ok: false; reason: "compile_error"; compileErrors: CompileError[] }
  | { ok: false; reason: "edit_mismatch"; message: string };

export type AcceptProposalResult =
  | { status: "accepted"; contentVersion: number }
  | { status: "stale"; currentVersion: number };

export type PendingProposalView = {
  id: string;
  sectionId: string;
  baseVersion: number;
  proposedSource: string;
  summary: string;
  annotationIds: string[];
  threadId: string | null;
  createdAt: number;
  currentSource: string;
  currentVersion: number;
  isStale: boolean;
};

/**
 * Terapkan edits search-replace anchored berurutan. Tiap oldText WAJIB match tepat satu —
 * ambigu/tak-ketemu dikembalikan sebagai union (pesan actionable untuk agen memperbaiki
 * anchor-nya), bukan throw.
 */
export function applyProposalEdits(
  source: string,
  edits: ProposalEdit[],
):
  | { ok: true; source: string }
  | { ok: false; index: number; reason: "not_found" | "ambiguous"; matches: number } {
  let current = source;
  for (let index = 0; index < edits.length; index += 1) {
    const edit = edits[index]!;
    if (!edit.oldText) return { ok: false, index, reason: "not_found", matches: 0 };
    let matches = 0;
    let at = current.indexOf(edit.oldText);
    while (at !== -1) {
      matches += 1;
      at = current.indexOf(edit.oldText, at + edit.oldText.length);
    }
    if (matches === 0) return { ok: false, index, reason: "not_found", matches };
    if (matches > 1) return { ok: false, index, reason: "ambiguous", matches };
    current = current.replace(edit.oldText, edit.newText);
  }
  return { ok: true, source: current };
}

async function assertPendingProposal(
  db: Db,
  ownerUserId: string,
  proposalId: string,
): Promise<SectionEditProposal> {
  const row = await SectionEditProposalRepo.findById(db, ownerUserId, proposalId);
  if (!row) {
    throwAppError({
      message: "Proposal tidak ditemukan",
      code: "proposal_not_found",
      severity: "warning",
      status: 404,
    });
  }
  if (row.status !== "pending") {
    throwAppError({
      message: "Proposal sudah diputuskan",
      code: "proposal_not_pending",
      severity: "warning",
      status: 409,
    });
  }
  return row;
}

export const SectionProposalService = {
  /**
   * Usulan suntingan agen: apply edits → dry-run compile (assembly bab dengan sumber usulan,
   * TANPA menyimpan build/sumber) → hanya usulan yang compile bersih dipersist sebagai
   * `pending` (supersede pending lama). Error compile dikembalikan sebagai union supaya agen
   * ber-self-repair dengan memanggil ulang. Satu bucket rate-limit dengan compile user
   * (`latex:compile`) — loop agen tidak mendapat jatah terpisah.
   */
  async propose(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      edits?: ProposalEdit[];
      fullSource?: string;
      summary: string;
      respondsToAnnotationIds?: string[];
      threadId?: string | null;
      enforceRateLimit?: boolean;
    },
  ): Promise<ProposeSectionEditResult> {
    if (input.enforceRateLimit !== false) {
      try {
        await getRateLimiter("latex:compile").consume(input.ownerUserId);
      } catch (rejected) {
        if (rejected instanceof Error) {
          // Store error → fail-open (paritas perilaku rateLimitMacro API).
          console.error("[proposal] rate limit store error", rejected);
        } else {
          throwAppError({
            message: "Terlalu banyak compile. Coba lagi sebentar lagi.",
            code: "rate_limited",
            severity: "info",
            status: 429,
          });
        }
      }
    }

    const { section, doc, project, bib } = await loadSectionCompileContext(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });

    let candidate: string;
    if (input.fullSource !== undefined) {
      candidate = input.fullSource;
    } else if (input.edits && input.edits.length > 0) {
      if (!doc) {
        return {
          ok: false,
          reason: "edit_mismatch",
          message: "Bab masih kosong — kirim fullSource untuk draf awal, bukan edits.",
        };
      }
      const applied = applyProposalEdits(doc.source, input.edits);
      if (!applied.ok) {
        return {
          ok: false,
          reason: "edit_mismatch",
          message:
            applied.reason === "not_found"
              ? `edits[${applied.index}].oldText tidak ditemukan di sumber terkini. Baca ulang sumber (get_section_source) lalu pakai kutipan persis.`
              : `edits[${applied.index}].oldText ambigu (${applied.matches} kecocokan). Perluas kutipan supaya unik.`,
        };
      }
      candidate = applied.source;
    } else {
      return {
        ok: false,
        reason: "edit_mismatch",
        message: "Sertakan edits (suntingan terarah) atau fullSource (tulis ulang bab).",
      };
    }

    if (Buffer.byteLength(candidate, "utf8") > LATEX_SOURCE_MAX_BYTES) {
      throwAppError({
        message: "Sumber usulan terlalu besar. Maksimum 2 MB.",
        code: "latex_source_too_large",
        severity: "warning",
        status: 413,
      });
    }

    // Dry-run: build resmi TIDAK tersentuh — user tak pernah melihat PDF dari usulan
    // yang belum diterima, dan pointer build lama tetap utuh.
    const assembled = assembleSection(project, {
      id: section.id,
      title: section.title,
      sortOrder: section.sortOrder,
      role: section.role,
      source: candidate,
    });
    const result = await LatexCompileService.compile({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    if (!result.ok) {
      return { ok: false, reason: "compile_error", compileErrors: result.errors };
    }

    const now = Date.now();
    const proposalId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await SectionEditProposalRepo.supersedePendingBySection(
        tx,
        input.ownerUserId,
        section.id,
        now,
      );
      await SectionEditProposalRepo.insert(tx, {
        id: proposalId,
        ownerUserId: input.ownerUserId,
        workspaceId: section.workspaceId,
        sectionId: section.id,
        threadId: input.threadId ?? null,
        baseVersion: doc?.contentVersion ?? 0,
        proposedSource: candidate,
        summary: input.summary,
        annotationIds: input.respondsToAnnotationIds ?? [],
        status: "pending",
        createdAt: now,
        decidedAt: null,
      });
    });
    return { ok: true, proposalId, summary: input.summary };
  },

  /**
   * Terima proposal: CAS `saveDocument(author:'agent')` atas baseVersion proposal — versi
   * bergeser (user menyimpan duluan) → proposal di-supersede dan TIDAK menimpa. Urutan
   * save→transisi: gagal di antaranya menyisakan pending yang aman (accept ulang → stale).
   */
  async accept(
    db: Db,
    input: { ownerUserId: string; proposalId: string },
  ): Promise<AcceptProposalResult> {
    const proposal = await assertPendingProposal(db, input.ownerUserId, input.proposalId);
    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: proposal.sectionId,
      source: proposal.proposedSource,
      // baseVersion 0 = bab belum pernah ditulis (lazy-create tanpa CAS versi).
      ...(proposal.baseVersion > 0 ? { baseVersion: proposal.baseVersion } : {}),
      author: "agent",
    });
    const now = Date.now();
    if (saved.status === "stale_write") {
      await SectionEditProposalRepo.updateById(db, proposal.id, {
        status: "superseded",
        decidedAt: now,
      });
      return { status: "stale", currentVersion: saved.currentVersion };
    }
    await SectionEditProposalRepo.updateById(db, proposal.id, {
      status: "accepted",
      decidedAt: now,
    });
    await DocumentAnnotationRepo.updateStatusByIds(
      db,
      input.ownerUserId,
      proposal.annotationIds,
      { status: "resolved", updatedAt: now },
    );
    return { status: "accepted", contentVersion: saved.contentVersion };
  },

  /** Tolak proposal; anotasi yang dijawabnya dibuka kembali supaya bisa dikirim ulang. */
  async reject(
    db: Db,
    input: { ownerUserId: string; proposalId: string },
  ): Promise<{ ok: true }> {
    const proposal = await assertPendingProposal(db, input.ownerUserId, input.proposalId);
    const now = Date.now();
    await SectionEditProposalRepo.updateById(db, proposal.id, {
      status: "rejected",
      decidedAt: now,
    });
    await DocumentAnnotationRepo.updateStatusByIds(
      db,
      input.ownerUserId,
      proposal.annotationIds,
      { status: "open", updatedAt: now },
    );
    return { ok: true };
  },

  async getPending(
    db: Db,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<PendingProposalView | null> {
    const row = await SectionEditProposalRepo.findPendingBySection(
      db,
      input.ownerUserId,
      input.sectionId,
    );
    if (!row) return null;
    const doc = await SectionLatexService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });
    const currentVersion = doc?.contentVersion ?? 0;
    return {
      id: row.id,
      sectionId: row.sectionId,
      baseVersion: row.baseVersion,
      proposedSource: row.proposedSource,
      summary: row.summary,
      annotationIds: row.annotationIds,
      threadId: row.threadId,
      createdAt: row.createdAt,
      currentSource: doc?.source ?? "",
      currentVersion,
      isStale: row.baseVersion !== currentVersion,
    };
  },
};
```

Export dari `packages/services/src/latex/index.ts`:

```ts
export {
  applyProposalEdits,
  type AcceptProposalResult,
  type PendingProposalView,
  type ProposalEdit,
  type ProposeSectionEditResult,
  SectionProposalService,
} from "./section-proposal.service";
```

- [ ] **Step 4: Jalankan test → lulus**

Run: `cd packages/services && DATABASE_URL=<db-dev> bun test test/section-proposal.test.ts test/latex-build-service.test.ts`
Expected: PASS semua; `bunx tsc --noEmit` exit 0. Perhatikan `../quota` harus resolve (lihat `src/quota/index.ts` — `getRateLimiter` diexport situ).

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/latex/ packages/services/test/section-proposal.test.ts
git commit -m "feat(latex): SectionProposalService — proposal gated dry-run compile + accept CAS"
```

---

### Task 11: Route API proposal

**Files:**
- Modify: `apps/api/src/routes/workspaces.ts`
- Test: `apps/api/test/proposals.test.ts`

**Interfaces:**
- Produces (dipakai hooks Task 14):
  - `GET  /sections/:id/proposals` → `PendingProposalView | null`
  - `POST /sections/:id/proposals/:pid/accept` → `AcceptProposalResult` (union)
  - `POST /sections/:id/proposals/:pid/reject` → `{ ok: true }`
- CATATAN: `propose` TIDAK di-expose HTTP (hanya tool agen — `author:'agent'` tak pernah dari input HTTP).

- [ ] **Step 1: Failing test** — `apps/api/test/proposals.test.ts` pola Task 4: 401 tanpa token; `GET /sections/nonexistent/proposals` dengan token → 404 structured; `POST /sections/x/proposals/y/accept` token + id asing → 404 `proposal_not_found` (setelah section 404 — cukup assert `res.status` 404 + `code` string).

- [ ] **Step 2: Route** — import `SectionProposalService` dari `@aqsha/services/latex` (sudah diimport untuk `LatexBuildService` — gabung). Tambah setelah blok anotasi:

```ts
  // ── Proposal suntingan agen ──────────────────────────────────────────────
  .get(
    "/sections/:id/proposals",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return SectionProposalService.getPending(db, { ownerUserId, sectionId: params.id });
    },
    { auth: true },
  )
  .post(
    "/sections/:id/proposals/:pid/accept",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return SectionProposalService.accept(db, { ownerUserId, proposalId: params.pid });
    },
    { auth: true },
  )
  .post(
    "/sections/:id/proposals/:pid/reject",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return SectionProposalService.reject(db, { ownerUserId, proposalId: params.pid });
    },
    { auth: true },
  )
```

- [ ] **Step 3: Build + test → lulus, commit**

Run: `bun run build:dist && cd apps/api && DATABASE_URL=<db-dev> bun test test/proposals.test.ts`
Expected: PASS.

```bash
git add apps/api/src/routes/workspaces.ts apps/api/test/proposals.test.ts
git commit -m "feat(api): endpoint proposal bab (pending/accept/reject)"
```

---

### Task 12: Tool Mastra `get_section_source` + `propose_section_edit` + instruksi

**Sebelum menulis: verifikasi API `createTool` vs `@mastra/core` terpasang (pola persis `propose-artifact.ts`).**

**Files:**
- Create: `apps/agent/src/mastra/tools/get-section-source.ts`
- Create: `apps/agent/src/mastra/tools/propose-section-edit.ts`
- Modify: `apps/agent/src/mastra/tools/index.ts`
- Modify: `apps/agent/src/mastra/instructions.ts` (blok loop suntingan bab)

**Interfaces:**
- Consumes: `AnnotationService` + `SectionLatexService` + `SectionService` (barrel root `@aqsha/services` — aman: barrel root tak memuat modul Bun), `SectionProposalService` (`@aqsha/services/latex` — agent jalan di Bun, boleh), `callerId`/`threadScopeId` dari `../lib/tool-context`, `getServiceDb` dari `../lib/db`.
- Produces: tool `get_section_source` (readTools), `propose_section_edit` (writeTools). Result propose diteruskan apa adanya (union service) — FE mendeteksi `tool-result` `propose_section_edit` dengan `ok:true` (Task 14).

- [ ] **Step 1: `get-section-source.ts`**

```ts
import { AnnotationService, SectionLatexService, SectionService } from "@aqsha/services";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * get_section_source — READ. Sumber LaTeX terkini sebuah bab + anotasi terbuka user
 * (teks terseleksi + baris sumber + catatan). WAJIB dipanggil sebelum propose_section_edit:
 * contentVersion yang dikembalikan adalah basis CAS proposal, dan kutipan `edits.oldText`
 * harus berasal dari sumber ini, bukan ingatan.
 */
export const getSectionSource = createTool({
  id: "get_section_source",
  description:
    "Baca sumber LaTeX terkini satu bab proyek + daftar anotasi terbuka user di PDF-nya (teks yang ditandai, baris sumber hasil pemetaan, dan catatan). Panggil ini SEBELUM mengusulkan suntingan; gunakan kutipan persis dari sumber ini sebagai anchor edits.",
  inputSchema: z.object({
    sectionId: z.string().min(1).describe("Id bab (workspace section)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    try {
      const section = await SectionService.assertSectionOwner(db, ownerUserId, input.sectionId);
      const doc = await SectionLatexService.getDocument(db, {
        ownerUserId,
        sectionId: input.sectionId,
      });
      const annotations = await AnnotationService.list(db, {
        ownerUserId,
        sectionId: input.sectionId,
      });
      return {
        ok: true as const,
        sectionId: section.id,
        sectionTitle: section.title,
        contentVersion: doc?.contentVersion ?? 0,
        source: doc?.source ?? "",
        openAnnotations: annotations
          .filter((a) => a.status === "open" || a.status === "sent")
          .map((a) => ({
            id: a.id,
            kind: a.kind,
            page: a.page,
            selectedText: a.selectedText,
            note: a.note,
            sourceLine: a.sourceLine,
          })),
      };
    } catch {
      return {
        ok: false as const,
        message: "Bab tidak ditemukan atau bukan milik pengguna.",
      };
    }
  },
});
```

- [ ] **Step 2: `propose-section-edit.ts`**

```ts
import { SectionProposalService } from "@aqsha/services/latex";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * propose_section_edit — WRITE. Usulkan suntingan sumber LaTeX bab. Server memvalidasi lewat
 * dry-run compile: `ok:false compile_error` = perbaiki sendiri lalu panggil ulang (self-repair);
 * `ok:false edit_mismatch` = anchor salah, baca ulang sumber. `ok:true` = proposal menunggu
 * keputusan user (Terima/Tolak) di halaman bab — JANGAN klaim dokumen sudah berubah.
 */
export const proposeSectionEdit = createTool({
  id: "propose_section_edit",
  description:
    "Usulkan suntingan sumber LaTeX satu bab. Untuk suntingan terarah kirim `edits` (pasangan oldText→newText; oldText = kutipan PERSIS & UNIK dari sumber terkini). Untuk menulis bab dari kosong / tulis-ulang menyeluruh kirim `fullSource`. Usulan divalidasi compile di server: bila gagal, perbaiki dan panggil ulang. Bila berhasil, user meninjau diff dan memutuskan — jangan klaim perubahan sudah diterapkan; minta user meninjau di halaman bab.",
  inputSchema: z.object({
    sectionId: z.string().min(1).describe("Id bab yang disunting."),
    edits: z
      .array(
        z.object({
          oldText: z.string().min(1).describe("Kutipan persis & unik dari sumber terkini."),
          newText: z.string().describe("Teks pengganti (boleh kosong untuk menghapus)."),
        }),
      )
      .max(32)
      .optional()
      .describe("Suntingan terarah; pakai INI bila bab sudah berisi."),
    fullSource: z
      .string()
      .optional()
      .describe("Sumber lengkap pengganti — hanya untuk bab kosong / tulis-ulang total."),
    summary: z
      .string()
      .min(1)
      .max(500)
      .describe("Ringkasan perubahan untuk user (bahasa Indonesia, 1-2 kalimat)."),
    respondsToAnnotationIds: z
      .array(z.string())
      .max(64)
      .optional()
      .describe("Id anotasi yang dijawab suntingan ini (dari konteks pesan / get_section_source)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    return SectionProposalService.propose(getServiceDb(), {
      ownerUserId,
      sectionId: input.sectionId,
      edits: input.edits,
      fullSource: input.fullSource,
      summary: input.summary,
      respondsToAnnotationIds: input.respondsToAnnotationIds,
      threadId: threadScopeId(ctx),
    });
  },
});
```

- [ ] **Step 3: Registrasi di `tools/index.ts`**

```ts
import { getSectionSource } from "./get-section-source";
import { proposeSectionEdit } from "./propose-section-edit";
```
Di `readTools` tambah `get_section_source: getSectionSource,` (setelah `request_document_edit`); di `writeTools` tambah `propose_section_edit: proposeSectionEdit,` (setelah `propose_artifact`).

- [ ] **Step 4: Blok instruksi** — di `apps/agent/src/mastra/instructions.ts`, tambah section pada instruksi bersama (ikuti struktur file; tempatkan dekat pembahasan dokumen/artifact) dengan isi:

```
## Menyunting bab proyek (LaTeX)

Bab karya tulis disimpan sebagai sumber LaTeX. Saat user meminta revisi bab — biasanya lewat
anotasi PDF yang menempel pada pesan (konteks "Anotasi bab") — alurnya SELALU:
1. `get_section_source` untuk membaca sumber terkini + anotasi terbuka (jangan mengandalkan ingatan).
2. Susun suntingan: `propose_section_edit` dengan `edits` (kutipan oldText persis & unik) untuk
   perubahan terarah, atau `fullSource` untuk bab kosong/tulis-ulang. Isi bab TANPA \chapter/\section
   judul bab — heading disisipkan sistem. Sitasi = \cite{key} dari perpustakaan proyek.
3. Hasil `ok:false` = perbaiki (compile_error: baca errors line+pesan; edit_mismatch: baca ulang
   sumber, perbaiki anchor) lalu panggil ulang. Maksimal 3 percobaan; setelah itu jelaskan kendalanya.
4. Hasil `ok:true` = usulan menunggu keputusan user. JANGAN klaim dokumen berubah — sampaikan
   ringkasan suntingan dan minta user meninjau diff di halaman bab (Terima/Tolak).
Sertakan `respondsToAnnotationIds` bila suntingan menjawab anotasi tertentu.
```

- [ ] **Step 5: Typecheck agent + smoke**

Run: `bun run build:dist && cd apps/agent && bunx tsc --noEmit`
Expected: exit 0. Smoke dev: `bun run dev:agent` boot tanpa error registrasi tool.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/mastra/tools/ apps/agent/src/mastra/instructions.ts
git commit -m "feat(agent): tool get_section_source + propose_section_edit + instruksi loop suntingan bab"
```

---

### Task 13: Seam clientContext bab di chat + kirim antrian anotasi

**WAJIB skill `svelte-code-writer`.**

**Files:**
- Modify: `apps/svelte/src/lib/features/thread-experience/components/MastraChatThreadSurface.svelte`
- Modify: `apps/svelte/src/lib/features/explore/components/ExploreThreadChat.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/components/ProjectSidePanel.svelte`
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`
- Create: `apps/svelte/src/lib/features/sections/lib/annotation-context.ts`
- Test: `apps/svelte/src/lib/features/sections/lib/annotation-context.spec.ts`

**Interfaces:**
- Produces:
  - `MastraChatThreadSurface` props baru (opsional, default no-op): `getExtraClientContext?: () => string[]`, `onTurnSent?: (threadId: string) => void`.
  - `ExploreThreadChat` props baru diteruskan + `onAgentSettled?: (threadId: string) => void` (dipicu transisi `agent.status` busy→ready).
  - `ProjectSidePanel` props baru diteruskan ke `ExploreThreadChat`: `getExtraClientContext?`, `onTurnSent?`, `onAgentSettled?`.
  - `buildAnnotationClientContext(input: { sectionId: string; sectionTitle: string; annotations: AnnotationView[] }): string` (pure).

- [ ] **Step 1: Failing test serialisasi**

`annotation-context.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAnnotationClientContext } from './annotation-context';
import type { AnnotationView } from '../api';

const base: AnnotationView = {
	id: 'a1', kind: 'highlight', page: 2,
	rects: [{ x: 1, y: 2, w: 3, h: 4 }],
	selectedText: 'metode kuantitatif', note: 'perjelas alasannya',
	sourceFile: 'sections/s1.tex', sourceLine: 14, sourceVersion: 3,
	status: 'open', threadId: null, messageId: null, createdAt: 0, updatedAt: 0
};

describe('buildAnnotationClientContext', () => {
	it('memuat sectionId, judul, dan detail tiap anotasi', () => {
		const out = buildAnnotationClientContext({
			sectionId: 's1', sectionTitle: 'Bab 1 Pendahuluan', annotations: [base]
		});
		expect(out).toContain('s1');
		expect(out).toContain('Bab 1 Pendahuluan');
		expect(out).toContain('a1');
		expect(out).toContain('metode kuantitatif');
		expect(out).toContain('perjelas alasannya');
		expect(out).toContain('baris 14');
	});
	it('anotasi tanpa mapping tetap termuat tanpa baris', () => {
		const out = buildAnnotationClientContext({
			sectionId: 's1', sectionTitle: 'Bab 1',
			annotations: [{ ...base, sourceLine: null, sourceFile: null }]
		});
		expect(out).toContain('a1');
		expect(out).not.toContain('baris');
	});
});
```

Run → FAIL (modul belum ada).

- [ ] **Step 2: Implementasi `annotation-context.ts`**

```ts
import type { AnnotationView } from '../api';

/**
 * Serialisasi antrian anotasi → satu context message untuk Astra. Berisi data mentah
 * (id + teks + baris + catatan) — alur kerja tool ada di instruksi agen, bukan di sini.
 */
export function buildAnnotationClientContext(input: {
	sectionId: string;
	sectionTitle: string;
	annotations: AnnotationView[];
}): string {
	const lines = input.annotations.map((a, i) => {
		const loc = a.sourceLine != null ? `, baris ${a.sourceLine}` : '';
		const excerpt = a.selectedText ? ` — teks: "${a.selectedText}"` : '';
		const note = a.note ? ` — catatan: ${a.note}` : '';
		return `${i + 1}. [id:${a.id}] (${a.kind}, hal. ${a.page}${loc})${excerpt}${note}`;
	});
	return [
		`Anotasi bab "${input.sectionTitle}" (sectionId: ${input.sectionId}) dari user:`,
		...lines
	].join('\n');
}
```

Run test → PASS.

- [ ] **Step 3: Prop seam di `MastraChatThreadSurface.svelte`** — tambah dua props opsional; di `onComposerSend` gabungkan sebelum kirim:

```ts
const extra = getExtraClientContext?.() ?? [];
const mergedContext = [...(payload.clientContext ?? []), ...extra];
const opts = {
	clientContext: mergedContext.length > 0 ? mergedContext : undefined,
	richText: payload.richText,
	attachmentIds: payload.attachmentIds,
	agentKind: payload.agentKind
};
```
dan setelah `const run = …`: `onTurnSent?.(threadId);` (dipanggil segera — antrian ikut turn ini, sukses/gagal stream tidak mengubah fakta terkirim; queue-while-busy tetap membawa context karena merge terjadi sebelum enqueue).

- [ ] **Step 4: `ExploreThreadChat.svelte`** — terima + teruskan `getExtraClientContext`/`onTurnSent` ke surface; tambah `onAgentSettled` via effect:

```ts
let prevBusy = false;
$effect(() => {
	const a = agent;
	if (!a) return;
	const busy = a.status !== 'ready';
	if (prevBusy && !busy) onAgentSettled?.(threadId);
	prevBusy = busy;
});
```

- [ ] **Step 5: `ProjectSidePanel.svelte`** — tiga props opsional baru, teruskan ke `ExploreThreadChat` (default undefined → perilaku rumah proyek tak berubah).

- [ ] **Step 6: Wire di `SectionEditorPage.svelte`**

```ts
const markSent = useMarkAnnotationsSent(() => sectionId);
const qc = useQueryClient();

function annotationContextParts(): string[] {
	const open = (annotations.data ?? []).filter(
		(a) => a.status === 'open' && selectedAnnotationIds.has(a.id)
	);
	if (open.length === 0 || !section) return [];
	return [
		buildAnnotationClientContext({
			sectionId,
			sectionTitle: section.title,
			annotations: open
		})
	];
}

function handleTurnSent(threadId: string): void {
	const ids = [...selectedAnnotationIds];
	if (ids.length === 0) return;
	selectedAnnotationIds.clear();
	markSent.mutate({ ids, threadId });
}

function handleAgentSettled(): void {
	void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionProposal(sectionId) });
	void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionAnnotations(sectionId) });
}
```
Teruskan ke `ProjectSidePanel`: `getExtraClientContext={annotationContextParts}`, `onTurnSent={handleTurnSent}`, `onAgentSettled={handleAgentSettled}`. Di `AnnotationQueuePanel`, checkbox men-toggle `selectedAnnotationIds`; hint di panel: "N anotasi terpilih akan dikirim bersama pesan berikutnya".

- [ ] **Step 7: Verifikasi manual** — pilih 2 anotasi → tab chat → kirim "Perbaiki bagian yang kutandai" → tool call `get_section_source` + `propose_section_edit` tampil di thread (ToolRow) → anotasi jadi "terkirim" → saat turn selesai, query proposal ter-invalidate.

- [ ] **Step 8: Typecheck + commit**

```bash
git add apps/svelte/src/lib/features/
git commit -m "feat(svelte): antrian anotasi → clientContext thread + mark-sent + settle invalidation"
```

---

### Task 14: Kartu proposal — diff + Terima/Tolak + compile resmi

**WAJIB skill `svelte-code-writer`.** Tambah dependency `diff` di apps/svelte: `cd apps/svelte && bun add diff && bun add -d @types/diff`.

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/api.ts` (hooks proposal)
- Create: `apps/svelte/src/lib/features/sections/components/ProposalReviewCard.svelte`
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`

**Interfaces:**
- Consumes: endpoint Task 11; `requestCompile()` Task 7; lib `diff` (`diffLines`).
- Produces: `PendingProposalView` type FE; hooks `usePendingProposal(sectionId, enabled?)`, `useAcceptProposal(sectionId)`, `useRejectProposal(sectionId)`.

- [ ] **Step 1: Hooks proposal di `features/sections/api.ts`**

```ts
export type PendingProposalView = {
	id: string;
	sectionId: string;
	baseVersion: number;
	proposedSource: string;
	summary: string;
	annotationIds: string[];
	threadId: string | null;
	createdAt: number;
	currentSource: string;
	currentVersion: number;
	isStale: boolean;
} | null;

export type AcceptProposalResult =
	| { status: 'accepted'; contentVersion: number }
	| { status: 'stale'; currentVersion: number };

export function usePendingProposal(sectionId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionProposal(sectionId()),
		enabled: enabled() && Boolean(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).proposals.get()) as PendingProposalView
	}));
}

export function useAcceptProposal(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (proposalId: string) =>
			unwrap(
				await api.sections({ id: sectionId() }).proposals({ pid: proposalId }).accept.post()
			) as AcceptProposalResult,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionProposal(sectionId()) });
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionDocument(sectionId()) });
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useRejectProposal(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (proposalId: string) =>
			unwrap(
				await api.sections({ id: sectionId() }).proposals({ pid: proposalId }).reject.post()
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionProposal(sectionId()) });
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}
```

- [ ] **Step 2: `ProposalReviewCard.svelte`** — props `{ proposal: NonNullable<PendingProposalView>; accepting: boolean; onAccept: () => void; onReject: () => void }`:
  - Header: "Usulan suntingan Astra" + ringkasan (`summary`).
  - Diff unified: `import { diffLines } from 'diff'`; `const parts = $derived(diffLines(proposal.currentSource, proposal.proposedSource))`; render tiap part per baris — `added` hijau (`bg-mint/20 text-foreground` + prefix `+`), `removed` merah (`bg-coral/20` + prefix `-`), konteks polos; container `max-h-96 overflow-auto font-mono text-[12px]` dengan `overflow-x-auto`.
  - `proposal.isStale` → banner "Sumber berubah sejak usulan dibuat" + tombol Terima disabled; hanya Tolak.
  - Tombol keycap: "Terima" (primary, spinner saat `accepting`), "Tolak" (secondary/outline).

- [ ] **Step 3: Wire di `SectionEditorPage.svelte`**

```ts
const proposal = usePendingProposal(() => sectionId);
const acceptProposal = useAcceptProposal(() => sectionId);
const rejectProposal = useRejectProposal(() => sectionId);

function handleAccept(): void {
	const p = proposal.data;
	if (!p) return;
	acceptProposal.mutate(p.id, {
		onSuccess: (res) => {
			if (res.status === 'accepted') {
				toast.success('Suntingan diterapkan. Menyusun ulang PDF…');
				requestCompile();
			} else {
				toast.warning('Sumber sudah berubah — usulan dibatalkan. Minta Astra menyusun ulang.');
			}
		},
		onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menerapkan usulan.'))
	});
}
```
Render `ProposalReviewCard` di atas viewer saat `proposal.data` ada (Collapsible terbuka default). Tolak → `rejectProposal.mutate(p.id)` + toast netral.

- [ ] **Step 4: Verifikasi manual loop penuh** — anotasi → kirim → Astra propose (tool ok) → kartu muncul → diff benar → Terima → autosave author agent (Badge versi naik) → compile jalan → PDF baru; anotasi terjawab jadi "selesai". Uji juga Tolak (anotasi kembali open) dan stale (edit sumber via PUT sebelum Terima → banner stale).

- [ ] **Step 5: Typecheck + commit**

```bash
git add apps/svelte/src/lib/features/sections/ apps/svelte/package.json apps/svelte/bun.lock*
git commit -m "feat(svelte): kartu proposal Astra — diff unified + terima/tolak + compile resmi"
```

---

### Task 15: Quick action "Minta Astra perbaiki" + CTA bab kosong

**WAJIB skill `svelte-code-writer`.**

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`
- Modify: `apps/svelte/src/lib/features/sections/components/SectionBuildErrorPanel.svelte` (aktifkan tombol)

**Interfaces:**
- Consumes: `ComposerMentions.setComposerDraft` (instance halaman, Task 7), `SectionBuildErrorPanel.onAskAstra` (Task 7 Step 4).

- [ ] **Step 1: Wire `onAskAstra`** di halaman:

```ts
function askAstraFixBuild(): void {
	const errors = build.data?.errors ?? [];
	const list = errors
		.slice(0, 10)
		.map((e) => `- ${e.line != null ? `baris ${e.line}: ` : ''}${e.message}`)
		.join('\n');
	mentions.setComposerDraft(
		`Compile bab ini gagal. Perbaiki sumbernya.\n\nError:\n${list}`
	);
	panelTab = 'chat';
}
```
Teruskan `onAskAstra={askAstraFixBuild}` ke `SectionBuildErrorPanel`. (Draft channel = user tetap menekan kirim — konsisten HITL.)

- [ ] **Step 2: CTA bab kosong** (empty-state Task 7) — pastikan draft prefill "Tuliskan draf awal bab …" berfungsi dan agen membalas dengan `propose_section_edit fullSource` (uji manual; instruksi agen Task 12 sudah mengarahkan).

- [ ] **Step 3: Verifikasi manual** — rusak sumber sengaja (mis. `\begin{itemize}` tanpa end via PUT) → compile → panel error → "Minta Astra perbaiki" → composer terisi → kirim → proposal perbaikan muncul → Terima → build hijau.

- [ ] **Step 4: Commit**

```bash
git add apps/svelte/src/lib/features/sections/
git commit -m "feat(svelte): quick action minta Astra perbaiki build + CTA tulis bab kosong"
```

---

### Task 16: E2E gaya gate + checkpoint 6b

**Files:**
- Test: `packages/services/test/latex-phase6-e2e.test.ts`

- [ ] **Step 1: Tulis e2e** (gating identik `latex-phase5-e2e.test.ts`: toolchain + `DATABASE_URL` + `S3_BUCKET`; seed pola sama — user, workspace, 1 bab + 1 bibliography, 1 citation ter-link):

Alur asersi:
1. `saveDocument` bab → `compileSection` → build ok.
2. `parseSynctex` dari `synctex_r2_key` build (via `LatexBuildRepo` + `StorageService.readBytes`) → ambil satu record file bab → `AnnotationService.create` dengan `page`/rects dari koordinat record (konversi `spToPdfPoint`) → assert `sourceFile === sections/<id>.tex` dan `sourceLine` ± 2 dari record.
3. `synctexForwardLookup` untuk `(sections/<id>.tex, sourceLine)` → halaman sama.
4. `SectionProposalService.propose` dengan edits `oldText` salah → `edit_mismatch`; dengan `fullSource` berisi LaTeX rusak (`\begin{itemize}` tanpa end) → `compile_error` dengan `errors.length > 0` DAN build tersimpan TIDAK berubah (`builtAt` sama).
5. `propose` valid (edits mengganti satu kalimat, `respondsToAnnotationIds: [anotasi]`) → `ok:true`; `getPending` → `isStale false`.
6. `accept` → `accepted`; revisi terakhir `author='agent'`; anotasi ber-status `resolved`; `compileSection` ulang → build baru ok.
(enforceRateLimit false di seluruh propose — test tanpa redis.)

- [ ] **Step 2: Jalankan**

Run: `cd packages/services && DATABASE_URL=<db-dev> S3_BUCKET=<bucket-dev> bun test test/latex-phase6-e2e.test.ts`
Expected: PASS (toolchain lokal macOS: tectonic + tectonic-biber sudah terpasang sejak gate).

- [ ] **Step 3: Suite penuh + verifikasi manual 6b**

Run (root): `bun run build:dist && bun run typecheck; bun run test; bun run lint`
Expected: paritas checkpoint 6a (tanpa regresi baru). Manual: loop penuh Task 14 Step 4 + Task 15 Step 3 di `bun dev`.

- [ ] **Step 4: Cek versioning/changelog** — konsul `docs/product/versioning-and-changelog.md`: fitur user-facing tapi `apps/svelte` belum cutover → kemungkinan besar TANPA entri changelog (pola fase 5); catat keputusannya di pesan commit terakhir.

- [ ] **Step 5: Commit penutup**

```bash
git add packages/services/test/latex-phase6-e2e.test.ts
git commit -m "test(latex): e2e fase 6 — anotasi ter-map + loop proposal accept; tandai fase 6 selesai"
```

---

## Self-review checklist (dijalankan penulis plan — hasil: lolos)

- Spec coverage: anchor seleksi+pin (T6/T7), persistensi+lifecycle (T1/T3), jalur thread+chips (T13), proposal gated+pre-validate+self-repair (T10/T12), tabel domain proposal (T1), whole-proposal diff (T14), preview full-doc (T8), forward lookup+re-anchor best-effort (T2/T6), mark-sent endpoint (T4), quick action perbaiki (T15), error handling union/throw (T3/T10), testing unit/integrasi/e2e (T2/T3/T10/T16), prasyarat sandbox tercatat (Global Constraints).
- Deviasi terhadap spec yang disengaja (catat di laporan implementasi): accept = urutan `saveDocument` (tx atomik) → transisi status proposal, BUKAN satu transaksi tunggal — `saveDocument` membuka transaksinya sendiri; invariant "tidak pernah menimpa" tetap dijaga CAS, dan crash di antara langkah menyisakan pending yang aman (accept ulang → stale → superseded).
- Konsistensi tipe: `AnnotationView`/`LatexBuildView`/`PendingProposalView` FE mirror service; nama hook & queryKeys konsisten antar task; `sectionFilePath` dipakai konsisten untuk atribusi file bab.
