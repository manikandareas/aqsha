# Kedalaman Agent Proyek Typst — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menjadikan Astra di halaman proyek asisten penulisan yang sadar dokumen Typst — konteks kaya per turn, enam tool proyek baru, pin anotasi bernomor di preview, dan review proposal per-hunk sebagai diff inline di CodeMirror.

**Architecture:** Seluruh logika baru mendarat di `packages/services/src/typst/` sebagai modul murni yang diuji dengan `bun test`; tool Mastra dan route Elysia hanyalah pemanggil tipis. Sisi klien `apps/svelte` menambah satu extension CodeMirror dan satu lapisan pin di atas preview SVG yang sudah ada, memakai kembali `overlayBoxes()` dan `mountTypstEditor()`.

**Tech Stack:** Bun 1.3.10, TypeScript, Drizzle + Postgres, Elysia, Mastra (`@mastra/core`), SvelteKit 2 + Svelte 5 runes, CodeMirror 6, `diff`, TanStack Query.

Spec: `docs/superpowers/specs/2026-07-26-typst-project-agent-depth-design.md`.

## Global Constraints

- Package manager **selalu `bun`** (pinned 1.3.10). Jangan npm/pnpm/yarn.
- Migrasi Drizzle hidup di `packages/db/migrations`. Buat lewat `bun run db:generate`, jangan tulis file SQL manual kecuali langkah menyuruhnya.
- `@aqsha/db` dan `@aqsha/services` di-build ke `dist/`. Sesudah mengubah keduanya, jalankan `bun run build:dist` sebelum menjalankan/typecheck `apps/api` atau `apps/agent`.
- `apps/svelte` **dilarang** mengimpor `@aqsha/services` atau `@aqsha/db`. Modul murni yang dibutuhkan kedua sisi diduplikasi secara sadar (pola yang sudah ada di `apps/svelte/src/lib/plan/catalog.ts`).
- Ikon di `apps/svelte` **hanya** dari `$lib/icons`. Dilarang mengimpor `lucide-react` langsung. Nama ikon yang belum ada ditambahkan di `packages/ui-svelte/src/icons.ts` berbasis Hugeicons.
- Copy bahasa Indonesia, **sentence case** — tanpa Title Case dan tanpa huruf kapital penuh.
- Komentar menjelaskan **kenapa**, bukan apa. **Dilarang** menyebut nomor task, fase, nama plan/spec, atau tiket di dalam komentar kode.
- Tes runes Svelte (`$state`/`$derived`) wajib berkas `*.svelte.test.ts` supaya plugin Svelte mengompilasinya; `apps/svelte` **tidak punya** harness tes komponen (spec browser sudah dihapus di `8adb807d`), jadi komponen diverifikasi lewat `bun run check` + verifikasi browser manual.
- `bun run typecheck` di root menyertakan `@aqsha/web` yang **sudah gagal sejak sebelum pekerjaan ini** — itu baseline, bukan regresi. Ukur paket yang kamu sentuh saja.
- Semua operasi data wajib terisolasi pemilik: setiap query menyertakan `ownerUserId`, setiap tool mengambil proyek dari scope thread (`threadScopeId(ctx)`), bukan dari argumen model.
- Commit tiap task selesai. Pesan commit `feat:`/`fix:`/`refactor:`/`test:` diikuti ringkas bahasa Inggris.

**Perintah verifikasi yang dipakai berulang:**

| Tujuan | Perintah |
| --- | --- |
| Tes services | `cd packages/services && bun test --timeout 30000 test/<file>` |
| Typecheck services | `cd packages/services && bun run typecheck` |
| Build dist | `bun run build:dist` |
| Typecheck agent | `cd apps/agent && bun run typecheck` |
| Typecheck api | `cd apps/api && bun run typecheck` |
| Check svelte | `cd apps/svelte && bun run check` |
| Tes svelte | `cd apps/svelte && bun run test` |

---

## Peta berkas

**Dibuat:**

| Berkas | Tanggung jawab |
| --- | --- |
| `packages/services/src/typst/outline.ts` | Model baca + transform kerangka Typst (murni) |
| `packages/services/src/typst/project-facts.ts` | Rakit fakta proyek + render manifest (murni + satu pembaca DB) |
| `packages/services/src/typst/document-report.ts` | Laporan integritas dokumen (murni + compile) |
| `packages/services/test/typst-outline.test.ts` | Tes outline |
| `packages/services/test/typst-project-facts.test.ts` | Tes fakta + manifest |
| `packages/services/test/typst-document-report.test.ts` | Tes laporan |
| `packages/services/test/typst-proposal-hunk-decisions.test.ts` | Tes keputusan hunk bertahap |
| `apps/agent/src/mastra/tools/get-document-outline.ts` | Tool peta dokumen |
| `apps/agent/src/mastra/tools/read-document-section.ts` | Tool baca satu bab |
| `apps/agent/src/mastra/tools/list-project-references.ts` | Tool daftar bib proyek |
| `apps/agent/src/mastra/tools/add-reference-to-project.ts` | Tool tambah referensi |
| `apps/agent/src/mastra/tools/check-document.ts` | Tool pemeriksa dokumen |
| `apps/agent/src/mastra/tools/propose-outline.ts` | Tool usul struktur bab |
| `apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.ts` | Aksi cepat empty state (murni) |
| `apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.spec.ts` | Tesnya |
| `apps/svelte/src/lib/features/document/lib/annotation-pins.ts` | Penomoran + posisi pin (murni) |
| `apps/svelte/src/lib/features/document/lib/annotation-pins.spec.ts` | Tesnya |
| `apps/svelte/src/lib/features/document/components/AnnotationPinLayer.svelte` | Render pin + popover |
| `apps/svelte/src/lib/features/document/lib/annotation-reanchor.ts` | Penambatan ulang anotasi lewat pencarian teks |
| `apps/svelte/src/lib/features/document/lib/annotation-reanchor.spec.ts` | Tesnya |
| `apps/svelte/src/lib/features/document/lib/proposal-diff-extension.ts` | Extension CodeMirror diff inline |
| `apps/svelte/src/lib/features/document/lib/proposal-diff-decorations.spec.ts` | Tes pemetaan baris diff |

**Diubah:**

| Berkas | Perubahan |
| --- | --- |
| `packages/services/src/typst/project-bib.ts` | Tambah `listProjectReferences` |
| `packages/services/src/typst/document-proposal.service.ts` | `decideHunk`, `proposeOutline`, `getPending` sisa hunk |
| `packages/services/src/typst/index.ts` | Ekspor modul baru |
| `packages/db/src/schema/documentEditProposals.ts` | Tiga kolom baru |
| `packages/db/migrations/0046_*.sql` | Migrasi kolom |
| `apps/agent/src/mastra/tools/index.ts` | Registrasi enam tool |
| `apps/agent/src/mastra/instructions.ts` | Seksi mode proyek + demosi jalur Markdown |
| `apps/agent/src/mastra/processors/workspace-project-manifest.ts` | Manifest dari `project-facts` |
| `apps/api/src/routes/workspaces.ts` | Endpoint keputusan hunk |
| `apps/svelte/src/lib/features/document/api.ts` | Tipe sisa hunk + hook keputusan |
| `apps/svelte/src/lib/features/document/components/TypstPreview.svelte` | Pasang lapisan pin |
| `apps/svelte/src/lib/features/document/components/TypstSourceEditor.svelte` | Terima hunk sisa |
| `apps/svelte/src/lib/features/document/lib/typst-editor.ts` | Pasang extension diff |
| `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte` | Wiring akhir |
| `apps/svelte/src/lib/features/threads/components/composer/Composer.svelte` | Prop saran dinamis |
| `apps/svelte/src/lib/features/threads/components/composer/ComposerSuggestionList.svelte` | Terima daftar saran |

**Dihapus:** `apps/svelte/src/lib/features/document/components/ProposalReviewCard.svelte`.

---

# Fase A — Otak proyek (Task 1–8)

## Task 1: Modul outline Typst di services

**Files:**
- Create: `packages/services/src/typst/outline.ts`
- Create: `packages/services/test/typst-outline.test.ts`
- Modify: `packages/services/src/typst/index.ts`

**Interfaces:**
- Consumes: tidak ada (modul murni, tanpa DB).
- Produces:
  - `type OutlineHeading = { index: number; chapterIndex: number | null; level: number; title: string; line: number; words: number; isEmpty: boolean }`
  - `type OutlineSection = { index: number; title: string; level: number; startLine: number; endLine: number; text: string }`
  - `type OutlineOperation = { op: "insert"; afterChapterIndex: number | null; title: string } | { op: "rename"; chapterIndex: number; title: string } | { op: "move"; chapterIndex: number; toChapterIndex: number } | { op: "remove"; chapterIndex: number }`
  - `parseTypstOutline(source: string): OutlineHeading[]`
  - `sliceOutlineSection(source: string, index: number): OutlineSection | null`
  - `findOutlineSectionByTitle(source: string, title: string): OutlineSection | null`
  - `applyOutlineOperations(source: string, ops: OutlineOperation[]): string`
  - `countWords(text: string): number`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `packages/services/test/typst-outline.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  applyOutlineOperations,
  findOutlineSectionByTitle,
  parseTypstOutline,
  sliceOutlineSection,
} from "../src/typst/outline";

const SOURCE = [
  '#set page(numbering: "1")',
  "",
  "= Pendahuluan",
  "",
  "Latar belakang penelitian ini adalah lima kata.",
  "",
  "== Rumusan Masalah",
  "",
  "Satu dua tiga.",
  "",
  "= Metode Penelitian",
  "",
  "= Hasil",
  "",
  "Ada isi di sini.",
].join("\n");

describe("parseTypstOutline", () => {
  test("membaca level, baris, dan jumlah kata subtree", () => {
    const outline = parseTypstOutline(SOURCE);
    expect(outline).toHaveLength(4);
    expect(outline[0]).toEqual({
      index: 0,
      chapterIndex: 0,
      level: 1,
      title: "Pendahuluan",
      line: 3,
      words: 10,
      isEmpty: false,
    });
    expect(outline[1]).toEqual({
      index: 1,
      chapterIndex: null,
      level: 2,
      title: "Rumusan Masalah",
      line: 7,
      words: 3,
      isEmpty: false,
    });
  });

  test("menandai bab tanpa isi sebagai kosong", () => {
    const outline = parseTypstOutline(SOURCE);
    expect(outline[2]).toMatchObject({ title: "Metode Penelitian", words: 0, isEmpty: true });
    expect(outline[3]).toMatchObject({ title: "Hasil", words: 4, isEmpty: false });
  });

  test("mengabaikan heading di dalam komentar baris", () => {
    expect(parseTypstOutline("// = Bukan bab\n= Bab")).toHaveLength(1);
  });
});

describe("sliceOutlineSection", () => {
  test("memotong satu bab beserta rentang barisnya", () => {
    const section = sliceOutlineSection(SOURCE, 2);
    expect(section).toEqual({
      index: 2,
      title: "Metode Penelitian",
      level: 1,
      startLine: 11,
      endLine: 12,
      text: "= Metode Penelitian\n",
    });
  });

  test("memotong subbab sampai heading selevel berikutnya", () => {
    expect(sliceOutlineSection(SOURCE, 1)?.text).toBe("== Rumusan Masalah\n\nSatu dua tiga.\n");
  });

  test("mengembalikan null untuk indeks di luar jangkauan", () => {
    expect(sliceOutlineSection(SOURCE, 9)).toBeNull();
  });
});

describe("findOutlineSectionByTitle", () => {
  test("cocok tanpa peduli huruf besar dan spasi berlebih", () => {
    expect(findOutlineSectionByTitle(SOURCE, "  metode   penelitian ")?.index).toBe(2);
  });

  test("mengembalikan null bila judul tak ada", () => {
    expect(findOutlineSectionByTitle(SOURCE, "Simpulan")).toBeNull();
  });
});

describe("applyOutlineOperations", () => {
  test("mengganti nama bab tanpa menyentuh isinya", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "rename", chapterIndex: 1, title: "Metode" },
    ]);
    expect(next.split("\n")[10]).toBe("= Metode");
    expect(next).toContain("Satu dua tiga.");
  });

  test("menghapus bab beserta subbabnya", () => {
    const next = applyOutlineOperations(SOURCE, [{ op: "remove", chapterIndex: 0 }]);
    expect(next).not.toContain("Rumusan Masalah");
    expect(next).toContain("= Metode Penelitian");
    expect(next.startsWith('#set page(numbering: "1")')).toBe(true);
  });

  test("menyisipkan bab baru sesudah bab yang ditunjuk", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "insert", afterChapterIndex: 0, title: "Tinjauan Pustaka" },
    ]);
    const chapters = parseTypstOutline(next)
      .filter((h) => h.level === 1)
      .map((h) => h.title);
    expect(chapters).toEqual(["Pendahuluan", "Tinjauan Pustaka", "Metode Penelitian", "Hasil"]);
  });

  test("menyisipkan di akhir dokumen saat afterChapterIndex null", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "insert", afterChapterIndex: null, title: "Simpulan" },
    ]);
    const chapters = parseTypstOutline(next)
      .filter((h) => h.level === 1)
      .map((h) => h.title);
    expect(chapters[chapters.length - 1]).toBe("Simpulan");
  });

  test("memindahkan bab beserta isinya", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "move", chapterIndex: 2, toChapterIndex: 0 },
    ]);
    const chapters = parseTypstOutline(next)
      .filter((h) => h.level === 1)
      .map((h) => h.title);
    expect(chapters).toEqual(["Hasil", "Pendahuluan", "Metode Penelitian"]);
    expect(next).toContain("Ada isi di sini.");
  });

  test("menolak operasi pada indeks bab yang tak ada", () => {
    expect(() => applyOutlineOperations(SOURCE, [{ op: "remove", chapterIndex: 7 }])).toThrow(
      "Bab tidak ditemukan",
    );
  });

  test("menerapkan operasi berurutan atas hasil operasi sebelumnya", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "remove", chapterIndex: 0 },
      { op: "rename", chapterIndex: 0, title: "Metodologi" },
    ]);
    expect(parseTypstOutline(next)[0]).toMatchObject({ title: "Metodologi", level: 1 });
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd packages/services && bun test --timeout 30000 test/typst-outline.test.ts`
Expected: FAIL — `Cannot find module '../src/typst/outline'`.

- [ ] **Step 3: Tulis implementasinya**

Buat `packages/services/src/typst/outline.ts`:

```ts
/**
 * Kerangka dokumen Typst: pembacaan heading berlevel beserta jumlah kata subtree, pemotongan
 * satu bagian, dan transformasi struktur bab. Murni supaya dapat diuji tanpa DB maupun compile.
 * Operasi struktur sengaja hanya menyentuh bab level-1 karena itulah satuan yang dikelola user
 * lewat daftar isi; subbab ikut terbawa sebagai isi babnya.
 */

export type OutlineHeading = {
  /** Urutan kemunculan lintas semua level, 0-based. */
  index: number;
  /** Urutan di antara bab level-1, atau null untuk heading yang lebih dalam. */
  chapterIndex: number | null;
  level: number;
  title: string;
  /** Baris sumber 1-based. */
  line: number;
  /** Jumlah kata badan heading ini termasuk seluruh subbabnya, tanpa teks judul. */
  words: number;
  isEmpty: boolean;
};

export type OutlineSection = {
  index: number;
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  text: string;
};

export type OutlineOperation =
  | { op: "insert"; afterChapterIndex: number | null; title: string }
  | { op: "rename"; chapterIndex: number; title: string }
  | { op: "move"; chapterIndex: number; toChapterIndex: number }
  | { op: "remove"; chapterIndex: number };

const HEADING_RE = /^(={1,6})[ \t]+(\S.*?)[ \t]*$/;

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith("//");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

type RawHeading = { index: number; chapterIndex: number | null; level: number; title: string; line: number };

function rawHeadings(lines: string[]): RawHeading[] {
  const out: RawHeading[] = [];
  let chapters = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (isCommentLine(line)) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const level = m[1]!.length;
    out.push({
      index: out.length,
      chapterIndex: level === 1 ? chapters++ : null,
      level,
      title: m[2]!,
      line: i + 1,
    });
  }
  return out;
}

/** Baris terakhir subtree heading ke-`i` (sampai sebelum heading berikut yang selevel atau lebih tinggi). */
function subtreeEndLine(heads: RawHeading[], i: number, totalLines: number): number {
  const head = heads[i]!;
  const next = heads.slice(i + 1).find((h) => h.level <= head.level);
  return next ? next.line - 1 : totalLines;
}

export function parseTypstOutline(source: string): OutlineHeading[] {
  const lines = source.split("\n");
  const heads = rawHeadings(lines);
  return heads.map((head, i) => {
    const endLine = subtreeEndLine(heads, i, lines.length);
    let words = 0;
    for (let ln = head.line + 1; ln <= endLine; ln += 1) {
      const body = lines[ln - 1]!;
      // Judul subbab bukan isi bab — jangan ikut dihitung.
      if (HEADING_RE.test(body)) continue;
      words += countWords(body);
    }
    return {
      index: head.index,
      chapterIndex: head.chapterIndex,
      level: head.level,
      title: head.title,
      line: head.line,
      words,
      isEmpty: words === 0,
    };
  });
}

export function sliceOutlineSection(source: string, index: number): OutlineSection | null {
  const lines = source.split("\n");
  const heads = rawHeadings(lines);
  const head = heads[index];
  if (!head) return null;
  const endLine = subtreeEndLine(heads, index, lines.length);
  return {
    index,
    title: head.title,
    level: head.level,
    startLine: head.line,
    endLine,
    text: lines.slice(head.line - 1, endLine).join("\n"),
  };
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function findOutlineSectionByTitle(source: string, title: string): OutlineSection | null {
  const needle = normalizeTitle(title);
  if (!needle) return null;
  const heads = rawHeadings(source.split("\n"));
  const hit =
    heads.find((h) => normalizeTitle(h.title) === needle) ??
    heads.find((h) => normalizeTitle(h.title).includes(needle));
  return hit ? sliceOutlineSection(source, hit.index) : null;
}

/** Dokumen dipecah jadi preamble (sebelum bab pertama) + satu blok baris per bab level-1. */
function splitChapters(source: string): { preamble: string[]; blocks: string[][] } {
  const lines = source.split("\n");
  const heads = rawHeadings(lines).filter((h) => h.level === 1);
  if (heads.length === 0) return { preamble: lines, blocks: [] };
  const preamble = lines.slice(0, heads[0]!.line - 1);
  const blocks = heads.map((head, i) => {
    const end = heads[i + 1] ? heads[i + 1]!.line - 1 : lines.length;
    return lines.slice(head.line - 1, end);
  });
  return { preamble, blocks };
}

function joinChapters(preamble: string[], blocks: string[][]): string {
  return [...preamble, ...blocks.flat()].join("\n");
}

function assertChapter(blocks: string[][], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) {
    throw new Error("Bab tidak ditemukan");
  }
}

export function applyOutlineOperations(source: string, ops: OutlineOperation[]): string {
  let current = source;
  for (const op of ops) {
    const { preamble, blocks } = splitChapters(current);
    if (op.op === "insert") {
      const block = [`= ${op.title.trim()}`, ""];
      if (op.afterChapterIndex === null) {
        blocks.push(block);
      } else {
        assertChapter(blocks, op.afterChapterIndex);
        blocks.splice(op.afterChapterIndex + 1, 0, block);
      }
    } else if (op.op === "rename") {
      assertChapter(blocks, op.chapterIndex);
      blocks[op.chapterIndex] = [`= ${op.title.trim()}`, ...blocks[op.chapterIndex]!.slice(1)];
    } else if (op.op === "remove") {
      assertChapter(blocks, op.chapterIndex);
      blocks.splice(op.chapterIndex, 1);
    } else {
      assertChapter(blocks, op.chapterIndex);
      const [moved] = blocks.splice(op.chapterIndex, 1);
      const target = Math.min(Math.max(op.toChapterIndex, 0), blocks.length);
      blocks.splice(target, 0, moved!);
    }
    current = joinChapters(preamble, blocks);
  }
  return current;
}
```

- [ ] **Step 4: Jalankan tes sampai hijau**

Run: `cd packages/services && bun test --timeout 30000 test/typst-outline.test.ts`
Expected: PASS, 13 tes hijau.

- [ ] **Step 5: Ekspor modul**

Tambahkan di `packages/services/src/typst/index.ts`, tepat sesudah baris `export { scanTypstCiteKeys, stripTypstComments } from "./cite-scan";`:

```ts
export {
  applyOutlineOperations,
  countWords,
  findOutlineSectionByTitle,
  type OutlineHeading,
  type OutlineOperation,
  type OutlineSection,
  parseTypstOutline,
  sliceOutlineSection,
} from "./outline";
```

- [ ] **Step 6: Typecheck**

Run: `cd packages/services && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 7: Commit**

```bash
git add packages/services/src/typst/outline.ts packages/services/src/typst/index.ts packages/services/test/typst-outline.test.ts
git commit -m "feat(services): add Typst outline model and chapter operations"
```

---

## Task 2: Fakta proyek dan render manifest

**Files:**
- Create: `packages/services/src/typst/project-facts.ts`
- Create: `packages/services/test/typst-project-facts.test.ts`
- Modify: `packages/services/src/typst/project-bib.ts`
- Modify: `packages/services/src/typst/index.ts`

**Interfaces:**
- Consumes: `parseTypstOutline`, `OutlineHeading` (Task 1); `scanTypstCiteKeys` dari `./cite-scan`.
- Produces:
  - `type ProjectReference = { citationId: string; key: string; authors: string; year: string; title: string; doi: string | null }`
  - `listProjectReferences(db, input: { ownerUserId: string; workspaceId: string }): Promise<ProjectReference[]>` (di `project-bib.ts`)
  - `type ProjectFacts = { workspaceId: string; workspaceName: string; mainFileName: string; contentVersion: number; totalWords: number; headings: OutlineHeading[]; referenceCount: number; orphanCiteKeys: string[]; unusedReferenceKeys: string[]; openAnnotationCount: number; pendingProposal: { id: string; hunkCount: number; isStale: boolean } | null }`
  - `citeIntegrity(source: string, referenceKeys: string[]): { orphanCiteKeys: string[]; unusedReferenceKeys: string[] }`
  - `renderProjectManifest(facts: ProjectFacts): string`
  - `ProjectFactsService.get(db, input: { ownerUserId: string; workspaceId: string }): Promise<ProjectFacts | null>`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `packages/services/test/typst-project-facts.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseTypstOutline } from "../src/typst/outline";
import { citeIntegrity, type ProjectFacts, renderProjectManifest } from "../src/typst/project-facts";

const SOURCE = [
  "= Pendahuluan",
  "",
  "Menurut @smith2020 dan @hantu2021 hasilnya berbeda.",
  "",
  "= Metode Penelitian",
].join("\n");

function facts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    workspaceId: "ws_1",
    workspaceName: "Skripsi Bias Seleksi",
    mainFileName: "skripsi.typ",
    contentVersion: 42,
    totalWords: 7,
    headings: parseTypstOutline(SOURCE),
    referenceCount: 2,
    orphanCiteKeys: ["hantu2021"],
    unusedReferenceKeys: ["lee2019"],
    openAnnotationCount: 2,
    pendingProposal: null,
    ...overrides,
  };
}

describe("citeIntegrity", () => {
  test("memisahkan sitasi yatim dari referensi menganggur", () => {
    expect(citeIntegrity(SOURCE, ["smith2020", "lee2019"])).toEqual({
      orphanCiteKeys: ["hantu2021"],
      unusedReferenceKeys: ["lee2019"],
    });
  });

  test("tidak menghitung duplikat sitasi dua kali", () => {
    expect(citeIntegrity("@a dan @a lagi", []).orphanCiteKeys).toEqual(["a"]);
  });

  test("bersih saat semua sitasi punya referensi", () => {
    expect(citeIntegrity("@a", ["a"])).toEqual({ orphanCiteKeys: [], unusedReferenceKeys: [] });
  });
});

describe("renderProjectManifest", () => {
  test("memuat identitas proyek dan versi dokumen", () => {
    const text = renderProjectManifest(facts());
    expect(text).toContain('Proyek aktif: "Skripsi Bias Seleksi" (workspaceId: ws_1)');
    expect(text).toContain("skripsi.typ");
    expect(text).toContain("contentVersion 42");
  });

  test("mencantumkan bab beserta jumlah kata dan penanda kosong", () => {
    const text = renderProjectManifest(facts());
    expect(text).toContain("1. = Pendahuluan (7 kata)");
    expect(text).toContain("2. = Metode Penelitian (kosong)");
  });

  test("melaporkan sitasi yatim dan referensi menganggur", () => {
    const text = renderProjectManifest(facts());
    expect(text).toContain("sitasi yatim: @hantu2021");
    expect(text).toContain("referensi menganggur: 1");
  });

  test("menyebut proposal tertunda saat ada", () => {
    const text = renderProjectManifest(
      facts({ pendingProposal: { id: "p_1", hunkCount: 3, isStale: false } }),
    );
    expect(text).toContain("Proposal tertunda: 3 bagian menunggu keputusan user");
  });

  test("menyatakan dokumen belum ditulis saat tak ada bab", () => {
    const text = renderProjectManifest(facts({ headings: [], totalWords: 0, contentVersion: 0 }));
    expect(text).toContain("Dokumen masih kosong");
  });

  test("dibungkus penanda system-reminder", () => {
    const text = renderProjectManifest(facts());
    expect(text.startsWith("<system-reminder>")).toBe(true);
    expect(text.trimEnd().endsWith("</system-reminder>")).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd packages/services && bun test --timeout 30000 test/typst-project-facts.test.ts`
Expected: FAIL — `Cannot find module '../src/typst/project-facts'`.

- [ ] **Step 3: Tambahkan pembaca referensi proyek**

Sisipkan di `packages/services/src/typst/project-bib.ts`, sesudah fungsi `composeProjectBib` yang sudah ada:

```ts
export type ProjectReference = {
  citationId: string;
  key: string;
  authors: string;
  year: string;
  title: string;
  doi: string | null;
};

/**
 * Referensi proyek dalam bentuk terstruktur (bukan teks .bib) — dipakai manifest, pemeriksa
 * dokumen, dan tool daftar referensi supaya key yang dipakai agent selalu key yang sama dengan
 * yang tertulis di refs.bib saat compile.
 */
export async function listProjectReferences(
  db: Db,
  input: { ownerUserId: string; workspaceId: string },
): Promise<ProjectReference[]> {
  const links = await WorkspaceCitationLinkRepo.listByWorkspace(db, input.workspaceId);
  const ids = [...new Set(links.map((l) => l.citationId))];
  if (ids.length === 0) return [];
  const keyById = await CitationService.ensureBibKeys(db, {
    ownerUserId: input.ownerUserId,
    citationIds: ids,
  });
  const rows = (await CitationRepo.findByIds(db, input.ownerUserId, ids)).filter((r) => !r.deletedAt);
  return rows.map((row) => {
    const csl = row.cslJson as CslItem;
    const authors = (csl.author ?? [])
      .map((a) => a.family ?? a.literal ?? "")
      .filter(Boolean)
      .join(", ");
    const issuedYear = csl.issued?.["date-parts"]?.[0]?.[0];
    return {
      citationId: row.id,
      key: keyById[row.id]!,
      authors,
      year: issuedYear ? String(issuedYear) : "",
      title: csl.title ?? "",
      doi: csl.DOI ?? null,
    };
  });
}
```

- [ ] **Step 4: Tulis modul fakta proyek**

Buat `packages/services/src/typst/project-facts.ts`:

```ts
import { ChatThreadRepo, type Db } from "@aqsha/db";
import { AnnotationService } from "../annotation.service";
import { WorkspaceDocumentService } from "../workspace-document.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { scanTypstCiteKeys } from "./cite-scan";
import { DocumentProposalService } from "./document-proposal.service";
import { resolveMainTypFilename } from "./main-filename";
import { countWords, type OutlineHeading, parseTypstOutline } from "./outline";
import { listProjectReferences } from "./project-bib";

export type ProjectFacts = {
  workspaceId: string;
  workspaceName: string;
  mainFileName: string;
  contentVersion: number;
  totalWords: number;
  headings: OutlineHeading[];
  referenceCount: number;
  orphanCiteKeys: string[];
  unusedReferenceKeys: string[];
  openAnnotationCount: number;
  pendingProposal: { id: string; hunkCount: number; isStale: boolean } | null;
};

/** Sitasi yang tak punya entri bib, dan entri bib yang tak pernah disitasi. Keduanya unik & terurut kemunculan. */
export function citeIntegrity(
  source: string,
  referenceKeys: string[],
): { orphanCiteKeys: string[]; unusedReferenceKeys: string[] } {
  const known = new Set(referenceKeys);
  const cited = new Set<string>();
  const orphanCiteKeys: string[] = [];
  for (const key of scanTypstCiteKeys(source)) {
    cited.add(key);
    if (!known.has(key) && !orphanCiteKeys.includes(key)) orphanCiteKeys.push(key);
  }
  return {
    orphanCiteKeys,
    unusedReferenceKeys: referenceKeys.filter((key) => !cited.has(key)),
  };
}

function headingLine(heading: OutlineHeading, position: number): string {
  const marker = "=".repeat(heading.level);
  const size = heading.isEmpty ? "kosong" : `${heading.words} kata`;
  return `  ${position}. ${marker} ${heading.title} (${size})`;
}

/**
 * Manifest yang disuntik tiap turn. Sengaja memuat PETA (bab, panjang, cacat) dan bukan ISI:
 * biaya prompt tetap stabil, sementara orientasi tak lagi menghabiskan satu ronde tool call.
 */
export function renderProjectManifest(facts: ProjectFacts): string {
  const lines: string[] = [
    "<system-reminder>",
    `Proyek aktif: "${facts.workspaceName}" (workspaceId: ${facts.workspaceId}).`,
  ];

  if (facts.headings.length === 0 && facts.totalWords === 0) {
    lines.push(`Dokumen masih kosong (${facts.mainFileName}, contentVersion ${facts.contentVersion}).`);
  } else {
    lines.push(
      `Dokumen: ${facts.mainFileName}, contentVersion ${facts.contentVersion}, ${facts.totalWords} kata.`,
      "Kerangka:",
      ...facts.headings.map((h, i) => headingLine(h, i + 1)),
    );
  }

  lines.push(
    `Referensi proyek: ${facts.referenceCount} entri` +
      (facts.orphanCiteKeys.length > 0
        ? `; sitasi yatim: ${facts.orphanCiteKeys.map((k) => `@${k}`).join(", ")}`
        : "") +
      (facts.unusedReferenceKeys.length > 0
        ? `; referensi menganggur: ${facts.unusedReferenceKeys.length}`
        : "") +
      ".",
    `Anotasi terbuka: ${facts.openAnnotationCount}.`,
    facts.pendingProposal
      ? `Proposal tertunda: ${facts.pendingProposal.hunkCount} bagian menunggu keputusan user${facts.pendingProposal.isStale ? " (basi)" : ""}. Jangan membuat proposal baru sebelum diselesaikan.`
      : "Proposal tertunda: tidak ada.",
    "</system-reminder>",
  );
  return lines.join("\n");
}

export const ProjectFactsService = {
  /** Fakta proyek untuk manifest dan tool peta. `null` bila thread tak terikat proyek milik user. */
  async get(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<ProjectFacts | null> {
    const [workspace, doc] = await Promise.all([
      WorkspaceService.get(db, input.ownerUserId, input.workspaceId),
      WorkspaceDocumentService.getDocument(db, input),
    ]);
    if (!workspace) return null;
    const source = doc?.source ?? "";
    const [references, annotations, pending] = await Promise.all([
      listProjectReferences(db, input),
      AnnotationService.list(db, input),
      DocumentProposalService.getPending(db, input),
    ]);
    const integrity = citeIntegrity(
      source,
      references.map((r) => r.key),
    );
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      mainFileName: resolveMainTypFilename(workspace.kind),
      contentVersion: doc?.contentVersion ?? 0,
      totalWords: countWords(source),
      headings: parseTypstOutline(source),
      referenceCount: references.length,
      orphanCiteKeys: integrity.orphanCiteKeys,
      unusedReferenceKeys: integrity.unusedReferenceKeys,
      openAnnotationCount: annotations.filter((a) => a.status === "open" || a.status === "sent")
        .length,
      pendingProposal: pending
        ? { id: pending.id, hunkCount: pending.hunks.length, isStale: pending.isStale }
        : null,
    };
  },

  /** Proyek yang menaungi thread, bila ada. Dipakai tool agar model tak perlu menebak workspaceId. */
  async workspaceIdForThread(
    db: Db,
    input: { ownerUserId: string; threadId: string },
  ): Promise<string | null> {
    const thread = await ChatThreadRepo.findById(db, input.threadId);
    if (!thread || thread.ownerUserId !== input.ownerUserId) return null;
    return thread.workspaceId ?? null;
  },
};
```

> Catatan import: samakan jalur `WorkspaceService` dan `AnnotationService` dengan yang dipakai `document-proposal.service.ts` di berkas yang sama; bila berbeda, ikuti yang sudah ada di situ, jangan menambah alias baru.

- [ ] **Step 5: Jalankan tes sampai hijau**

Run: `cd packages/services && bun test --timeout 30000 test/typst-project-facts.test.ts`
Expected: PASS, 9 tes hijau.

- [ ] **Step 6: Ekspor dan typecheck**

Tambahkan di `packages/services/src/typst/index.ts`:

```ts
export { composeProjectBib, listProjectReferences, type ProjectReference } from "./project-bib";
export {
  citeIntegrity,
  type ProjectFacts,
  ProjectFactsService,
  renderProjectManifest,
} from "./project-facts";
```

Hapus baris `export { composeProjectBib } from "./project-bib";` yang lama supaya tidak dobel.

Run: `cd packages/services && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 7: Commit**

```bash
git add packages/services/src/typst/project-facts.ts packages/services/src/typst/project-bib.ts packages/services/src/typst/index.ts packages/services/test/typst-project-facts.test.ts
git commit -m "feat(services): assemble project facts and manifest renderer"
```

---

## Task 3: Tool peta dokumen dan instruksi mode proyek

**Files:**
- Create: `apps/agent/src/mastra/tools/get-document-outline.ts`
- Create: `apps/agent/src/mastra/tools/read-document-section.ts`
- Modify: `apps/agent/src/mastra/tools/index.ts`
- Modify: `apps/agent/src/mastra/instructions.ts`

**Interfaces:**
- Consumes: `ProjectFactsService.get`, `ProjectFactsService.workspaceIdForThread`, `sliceOutlineSection`, `findOutlineSectionByTitle` (Task 1–2); `callerId`, `threadScopeId` dari `../lib/tool-context`.
- Produces: entri `get_document_outline` dan `read_document_section` di `readTools`.

`apps/agent` tidak punya test runner, jadi tool sengaja dibuat tipis: seluruh logika sudah teruji di services, dan verifikasi di sini adalah typecheck.

- [ ] **Step 1: Build dist services supaya agent melihat modul baru**

Run: `bun run build:dist`
Expected: selesai tanpa error; `packages/services/dist` diperbarui.

- [ ] **Step 2: Tulis tool peta dokumen**

Buat `apps/agent/src/mastra/tools/get-document-outline.ts`:

```ts
import { ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * get_document_outline — READ murah. Peta bab dokumen proyek tanpa isinya: level, baris, jumlah
 * kata, penanda bab kosong, plus ringkasan referensi & anotasi. Dipakai saat manifest awal turn
 * sudah usang (dokumen berubah di tengah percakapan), bukan sebagai langkah wajib tiap edit.
 */
export const getDocumentOutline = createTool({
  id: "get_document_outline",
  description:
    "Peta bab dokumen Typst proyek: judul, level, baris, jumlah kata, dan bab mana yang masih kosong, plus jumlah referensi dan sitasi yatim. Murah — panggil ini untuk orientasi, bukan get_document_source.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    const facts = await ProjectFactsService.get(db, { ownerUserId, workspaceId });
    if (!facts) {
      return { ok: false as const, message: "Proyek tidak ditemukan." };
    }
    return {
      ok: true as const,
      workspaceId: facts.workspaceId,
      mainFileName: facts.mainFileName,
      contentVersion: facts.contentVersion,
      totalWords: facts.totalWords,
      headings: facts.headings,
      referenceCount: facts.referenceCount,
      orphanCiteKeys: facts.orphanCiteKeys,
      openAnnotationCount: facts.openAnnotationCount,
      pendingProposal: facts.pendingProposal,
    };
  },
});
```

- [ ] **Step 3: Tulis tool baca satu bab**

Buat `apps/agent/src/mastra/tools/read-document-section.ts`:

```ts
import { WorkspaceDocumentService } from "@aqsha/services";
import {
  findOutlineSectionByTitle,
  ProjectFactsService,
  sliceOutlineSection,
} from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * read_document_section — READ terarah. Mengembalikan SATU bagian dokumen apa adanya sehingga
 * kutipan `oldText` proposal berasal dari teks nyata, bukan ingatan model. `contentVersion` yang
 * ikut dikembalikan adalah basis yang sama dengan yang divalidasi saat proposal dibuat.
 */
export const readDocumentSection = createTool({
  id: "read_document_section",
  description:
    "Baca satu bab/subbab dokumen Typst proyek beserta rentang barisnya. Pakai `headingIndex` dari get_document_outline atau `title` judulnya. Kutipan `edits.oldText` untuk propose_document_edit WAJIB berasal dari teks yang dikembalikan tool ini.",
  inputSchema: z.object({
    headingIndex: z.number().int().min(0).optional().describe("Indeks heading dari peta dokumen."),
    title: z.string().min(1).optional().describe("Judul bab bila indeksnya tak diketahui."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    const doc = await WorkspaceDocumentService.getDocument(db, { ownerUserId, workspaceId });
    const source = doc?.source ?? "";
    const section =
      typeof input.headingIndex === "number"
        ? sliceOutlineSection(source, input.headingIndex)
        : input.title
          ? findOutlineSectionByTitle(source, input.title)
          : null;
    if (!section) {
      return {
        ok: false as const,
        message: "Bagian tidak ditemukan. Panggil get_document_outline untuk melihat bab yang ada.",
      };
    }
    return { ok: true as const, contentVersion: doc?.contentVersion ?? 0, section };
  },
});
```

- [ ] **Step 4: Daftarkan kedua tool**

Di `apps/agent/src/mastra/tools/index.ts`, tambahkan import (jaga urutan alfabet berkas yang sudah ada):

```ts
import { getDocumentOutline } from "./get-document-outline";
import { readDocumentSection } from "./read-document-section";
```

Lalu di dalam `readTools`, ganti blok komentar + entri `get_document_source` menjadi:

```ts
  // Peta bab proyek (murah) + baca satu bab; jalur orientasi & anchor sebelum propose_document_edit.
  get_document_outline: getDocumentOutline,
  read_document_section: readDocumentSection,
  // Sumber Typst penuh — hanya untuk dokumen kosong / tulis-ulang menyeluruh.
  get_document_source: getDocumentSource,
```

- [ ] **Step 5: Ganti seksi instruksi Typst**

Di `apps/agent/src/mastra/instructions.ts`, ganti **seluruh** seksi `## Menyunting dokumen proyek (Typst)` (dari judulnya sampai sebelum `## Metodologi (skills)`) dengan:

```
## Mode proyek (dokumen Typst)

Saat percakapan berlangsung di halaman proyek, kamu menerima manifest proyek di awal giliran: nama proyek, kerangka bab beserta jumlah kata, bab yang masih kosong, jumlah referensi, sitasi yatim, anotasi terbuka, dan status proposal. **Pakai manifest itu untuk orientasi — jangan memanggil tool hanya untuk mengetahui struktur dokumen.**

**Ruting permintaan — patuhi apa adanya:**

- **Permintaan menyentuh teks karya tulis** (tulis, tambahkan, lanjutkan, perbaiki, ringkas, panjangkan, ganti, hapus, rapikan, ubah gaya) → langsung \`read_document_section\` untuk mendapat kutipan persis, lalu \`propose_document_edit\`. **Jangan bertanya lebih dulu** apakah user ingin dokumennya diubah — di halaman proyek, jawabannya selalu ya.
- **Pertanyaan** (apa, mengapa, bagaimana, carikan, bandingkan, jelaskan) → jawab di chat; jangan menyentuh dokumen.
- **JANGAN PERNAH** menulis draf panjang di chat lalu menawarkan "mau saya masukkan ke dokumen?". Draf karya tulis selalu berjalan lewat proposal.
- Bab sasaran belum ada → tulis heading beserta isinya dalam **satu** proposal, bukan dua langkah.
- Manifest terasa usang (dokumen berubah di tengah percakapan, mis. sesudah proposal diterima) → \`get_document_outline\` untuk menyegarkan peta.

**Tool proyek:**

- \`get_document_outline\` — peta bab (murah). \`read_document_section\` — isi satu bab + rentang baris; sumber anchor \`oldText\`.
- \`get_document_source\` — sumber penuh; HANYA untuk dokumen kosong atau tulis-ulang menyeluruh.
- \`list_project_references\` — isi bib proyek. \`add_reference_to_project\` — tambahkan sumber baru (tawarkan dulu ke user) dan pakai \`key\` yang dikembalikannya sebagai \`@key\`. **Jangan pernah menulis \`@key\` yang tidak muncul di daftar referensi proyek.**
- \`check_document\` — compile + sitasi yatim + bab kosong + heading ganda. Pakai saat user menanyakan "apa yang masih kurang", dan sebelum menutup pekerjaan besar.
- \`propose_outline\` — usulkan struktur bab (tambah/urutkan/ganti nama/hapus). Untuk isi, tetap \`propose_document_edit\`.
- \`search_workspace_citations\` — hanya bila user meminta Citation Library global atau sumber proyek tidak cukup.

**Aturan proposal:** tulis Typst tanpa preamble (dokumen sudah punya \`#set\`), heading bab \`= Judul\`, sitasi \`@key\`. Proposal selalu menunggu keputusan user — jangan mengeklaim dokumen sudah berubah. Bila ada proposal tertunda, minta user menyelesaikannya dan jangan membuat proposal baru. Bila tool membalas \`compile_error\` atau \`edit_mismatch\`, baca ulang bagian terkait dan perbaiki, maksimal tiga kali; \`retry_exhausted\` berarti berhenti dan jelaskan diagnostiknya.
```

Lalu di seksi `## Mengedit dokumen (\`request_document_edit\`)`, ganti seluruh isinya (pertahankan judulnya) dengan satu paragraf:

```
Jalur ini HANYA untuk artefak dokumen **Markdown** yang disunting lewat AI editor native (bukan dokumen Typst proyek). Panggil \`request_document_edit\` dengan \`artifactId\` persis dari konteks tersemat atau \`list_artifacts\`; editor menampilkan diff untuk ditinjau user, jadi jangan mengeklaim dokumen sudah tersimpan. **Bila percakapan ini punya proyek Typst aktif, jalur edit yang benar selalu \`propose_document_edit\` — bukan tool ini.**
```

- [ ] **Step 6: Sebutkan tool baru di daftar tool ringkas**

Di seksi `## Tools`, pada butir **Workspace & artefak**, tambahkan kalimat penutup:

```
Di halaman proyek, dokumen Typst punya jalurnya sendiri — lihat "Mode proyek (dokumen Typst)".
```

- [ ] **Step 7: Typecheck agent**

Run: `cd apps/agent && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/mastra/tools/get-document-outline.ts apps/agent/src/mastra/tools/read-document-section.ts apps/agent/src/mastra/tools/index.ts apps/agent/src/mastra/instructions.ts
git commit -m "feat(agent): add document map tools and project-mode instructions"
```

---

## Task 4: Manifest proyek dari fakta nyata

**Files:**
- Modify: `apps/agent/src/mastra/processors/workspace-project-manifest.ts`

**Interfaces:**
- Consumes: `ProjectFactsService.get`, `ProjectFactsService.workspaceIdForThread`, `renderProjectManifest` (Task 2).
- Produces: tidak ada API baru; processor tetap dipakai `createAstraAgent` lewat daftar `inputProcessors` yang sudah ada.

- [ ] **Step 1: Ganti isi processor**

Ganti **seluruh** isi `apps/agent/src/mastra/processors/workspace-project-manifest.ts` dengan:

```ts
import { ProjectFactsService, renderProjectManifest } from "@aqsha/services/typst";
import type { ProcessInputArgs } from "@mastra/core/processors";
import { getServiceDb } from "../lib/db";
import { resolveOwnerThread } from "../lib/owner-thread";

/**
 * Menyuntik peta proyek tepercaya dari thread aktif: identitas, kerangka bab beserta panjangnya,
 * cacat sitasi, anotasi terbuka, dan status proposal — tanpa memasukkan isi dokumen ke prompt.
 * Peta ini menggantikan satu ronde tool call yang dulu terpakai hanya untuk orientasi.
 */
export const workspaceProjectManifestProcessor = {
  id: "workspace-project-manifest" as const,
  async processInput({ requestContext, messages, systemMessages }: ProcessInputArgs) {
    const { ownerUserId, threadId } = resolveOwnerThread(requestContext, messages);
    if (!ownerUserId || !threadId) return messages;

    try {
      const db = getServiceDb();
      const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
        ownerUserId,
        threadId,
      });
      if (!workspaceId) return messages;
      const facts = await ProjectFactsService.get(db, { ownerUserId, workspaceId });
      if (!facts) return messages;

      systemMessages.push({ role: "system", content: renderProjectManifest(facts) });
      return { messages, systemMessages };
    } catch (err) {
      console.error("[workspace-project-manifest] failed", err);
      return messages;
    }
  },
};
```

- [ ] **Step 2: Typecheck agent**

Run: `cd apps/agent && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 3: Verifikasi manual di runtime**

Jalankan `bun run dev:agent` bersama API dan web, buka satu proyek yang sudah punya beberapa bab, kirim pesan apa pun, lalu periksa log agent atau trace Langfuse: system message harus memuat baris `Kerangka:` dengan daftar bab dan jumlah kata yang cocok dengan dokumen di layar. Bila proyek kosong, manifest harus berbunyi `Dokumen masih kosong`.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/mastra/processors/workspace-project-manifest.ts
git commit -m "feat(agent): inject project outline manifest each turn"
```

---

## Task 5: Pemeriksa dokumen

**Files:**
- Create: `packages/services/src/typst/document-report.ts`
- Create: `packages/services/test/typst-document-report.test.ts`
- Create: `apps/agent/src/mastra/tools/check-document.ts`
- Modify: `packages/services/src/typst/index.ts`
- Modify: `apps/agent/src/mastra/tools/index.ts`

**Interfaces:**
- Consumes: `parseTypstOutline` (Task 1), `citeIntegrity`, `listProjectReferences` (Task 2), `TypstCompileService.compile`, `composeProjectBib`, `resolveMainTypFilename`.
- Produces:
  - `type DocumentIssues = { orphanCiteKeys: string[]; unusedReferenceKeys: string[]; emptyHeadings: { index: number; title: string; line: number }[]; duplicateHeadings: string[] }`
  - `inspectDocumentSource(source: string, referenceKeys: string[]): DocumentIssues`
  - `type DocumentReport = DocumentIssues & { compiles: boolean; compileErrors: { file: string; line: number; message: string; severity: "error" | "warning" }[]; totalWords: number; chapterCount: number }`
  - `DocumentReportService.check(db, input: { ownerUserId: string; workspaceId: string }): Promise<DocumentReport>`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `packages/services/test/typst-document-report.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { inspectDocumentSource } from "../src/typst/document-report";

const SOURCE = [
  "= Pendahuluan",
  "",
  "Menurut @smith2020 hasilnya jelas, tapi @hantu2021 menyanggah.",
  "",
  "= Metode Penelitian",
  "",
  "= Pendahuluan",
  "",
  "Duplikat judul.",
].join("\n");

describe("inspectDocumentSource", () => {
  test("mengumpulkan sitasi yatim", () => {
    expect(inspectDocumentSource(SOURCE, ["smith2020"]).orphanCiteKeys).toEqual(["hantu2021"]);
  });

  test("mengumpulkan referensi yang tak pernah disitasi", () => {
    expect(inspectDocumentSource(SOURCE, ["smith2020", "lee2019"]).unusedReferenceKeys).toEqual([
      "lee2019",
    ]);
  });

  test("menandai bab tanpa isi", () => {
    expect(inspectDocumentSource(SOURCE, []).emptyHeadings).toEqual([
      { index: 1, title: "Metode Penelitian", line: 5 },
    ]);
  });

  test("menandai judul bab yang kembar", () => {
    expect(inspectDocumentSource(SOURCE, []).duplicateHeadings).toEqual(["Pendahuluan"]);
  });

  test("dokumen sehat tak melaporkan apa pun", () => {
    const clean = "= Bab\n\nIsi @a lengkap.";
    expect(inspectDocumentSource(clean, ["a"])).toEqual({
      orphanCiteKeys: [],
      unusedReferenceKeys: [],
      emptyHeadings: [],
      duplicateHeadings: [],
    });
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd packages/services && bun test --timeout 30000 test/typst-document-report.test.ts`
Expected: FAIL — `Cannot find module '../src/typst/document-report'`.

- [ ] **Step 3: Tulis modul laporan**

Buat `packages/services/src/typst/document-report.ts`:

```ts
import type { Db } from "@aqsha/db";
import { WorkspaceDocumentService } from "../workspace-document.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { TypstCompileService } from "./compile.service";
import { resolveMainTypFilename } from "./main-filename";
import { countWords, parseTypstOutline } from "./outline";
import { composeProjectBib, listProjectReferences } from "./project-bib";
import { citeIntegrity } from "./project-facts";
import type { TypstDiagnostic } from "./types";

export type DocumentIssues = {
  orphanCiteKeys: string[];
  unusedReferenceKeys: string[];
  emptyHeadings: { index: number; title: string; line: number }[];
  duplicateHeadings: string[];
};

export type DocumentReport = DocumentIssues & {
  compiles: boolean;
  compileErrors: TypstDiagnostic[];
  totalWords: number;
  chapterCount: number;
};

/** Cacat yang dapat dinilai dari sumber saja — tanpa compile, tanpa DB. */
export function inspectDocumentSource(source: string, referenceKeys: string[]): DocumentIssues {
  const outline = parseTypstOutline(source);
  const seen = new Set<string>();
  const duplicateHeadings: string[] = [];
  for (const heading of outline) {
    const key = heading.title.trim().toLowerCase();
    if (seen.has(key)) {
      if (!duplicateHeadings.includes(heading.title)) duplicateHeadings.push(heading.title);
    }
    seen.add(key);
  }
  return {
    ...citeIntegrity(source, referenceKeys),
    emptyHeadings: outline
      .filter((h) => h.isEmpty)
      .map((h) => ({ index: h.index, title: h.title, line: h.line })),
    duplicateHeadings,
  };
}

export const DocumentReportService = {
  /** Laporan lengkap: cacat sumber + hasil dry-run compile dengan bib proyek terkini. */
  async check(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<DocumentReport> {
    const workspace = await WorkspaceService.get(db, input.ownerUserId, input.workspaceId);
    const doc = await WorkspaceDocumentService.getDocument(db, input);
    const source = doc?.source ?? "";
    const references = await listProjectReferences(db, input);
    const issues = inspectDocumentSource(
      source,
      references.map((r) => r.key),
    );
    const bib = await composeProjectBib(db, input);
    const compiled = await TypstCompileService.compile({
      mainTyp: source,
      bib,
      mainFileName: resolveMainTypFilename(workspace?.kind),
    });
    return {
      ...issues,
      compiles: compiled.ok,
      compileErrors: compiled.ok ? [] : compiled.errors,
      totalWords: countWords(source),
      chapterCount: parseTypstOutline(source).filter((h) => h.level === 1).length,
    };
  },
};
```

> Bila `TypstCompileResult` memakai nama field selain `ok`/`errors`, ikuti bentuk yang dipakai `document-proposal.service.ts` pada pemanggilan `TypstCompileService.compile` — jangan menebak.

- [ ] **Step 4: Jalankan tes sampai hijau**

Run: `cd packages/services && bun test --timeout 30000 test/typst-document-report.test.ts`
Expected: PASS, 5 tes hijau.

- [ ] **Step 5: Ekspor dari services**

Tambahkan di `packages/services/src/typst/index.ts`:

```ts
export {
  type DocumentIssues,
  type DocumentReport,
  DocumentReportService,
  inspectDocumentSource,
} from "./document-report";
```

Run: `cd packages/services && bun run typecheck && cd ../.. && bun run build:dist`
Expected: keduanya keluar tanpa error.

- [ ] **Step 6: Tulis tool `check_document`**

Buat `apps/agent/src/mastra/tools/check-document.ts`:

```ts
import { DocumentReportService, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * check_document — READ yang menjalankan dry-run compile, jadi lebih mahal dari tool peta.
 * Pakai saat user menanyakan kesiapan dokumen atau sebelum menutup pekerjaan besar, bukan rutin
 * di tiap giliran.
 */
export const checkDocument = createTool({
  id: "check_document",
  description:
    "Periksa kesiapan dokumen Typst proyek: apakah compile bersih, sitasi yang tak punya entri referensi, referensi yang tak pernah disitasi, bab kosong, dan judul bab kembar. Memakai compile — panggil seperlunya, bukan tiap giliran.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    const report = await DocumentReportService.check(db, { ownerUserId, workspaceId });
    return { ok: true as const, report };
  },
});
```

- [ ] **Step 7: Daftarkan tool**

Di `apps/agent/src/mastra/tools/index.ts` tambahkan `import { checkDocument } from "./check-document";` lalu di `readTools`, tepat sesudah `read_document_section`:

```ts
  // Pemeriksa integritas dokumen (menjalankan compile) — untuk pertanyaan "apa yang masih kurang".
  check_document: checkDocument,
```

Run: `cd apps/agent && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 8: Commit**

```bash
git add packages/services/src/typst/document-report.ts packages/services/src/typst/index.ts packages/services/test/typst-document-report.test.ts apps/agent/src/mastra/tools/check-document.ts apps/agent/src/mastra/tools/index.ts
git commit -m "feat: add document integrity report and check_document tool"
```

---

## Task 6: Tool referensi proyek

**Files:**
- Create: `apps/agent/src/mastra/tools/list-project-references.ts`
- Create: `apps/agent/src/mastra/tools/add-reference-to-project.ts`
- Modify: `apps/agent/src/mastra/tools/index.ts`

**Interfaces:**
- Consumes: `listProjectReferences`, `citeIntegrity`, `ProjectFactsService.workspaceIdForThread` (Task 2); `CitationLinkService.createInWorkspace` dan `CitationLinkService.addToWorkspace` dari `@aqsha/services/citations`; `WorkspaceDocumentService.getDocument`.
- Produces: entri `list_project_references` di `readTools`, `add_reference_to_project` di `writeTools`.

- [ ] **Step 1: Tulis tool daftar referensi**

Buat `apps/agent/src/mastra/tools/list-project-references.ts`:

```ts
import { WorkspaceDocumentService } from "@aqsha/services";
import { citeIntegrity, listProjectReferences, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * list_project_references — READ. Isi bib proyek beserta penanda terpakai/menganggur. Ini satu-
 * satunya sumber sah untuk `@key`: key yang tak muncul di sini tidak akan ada di refs.bib saat
 * compile, sehingga sitasi yang mengutipnya menjadi yatim.
 */
export const listProjectReferencesTool = createTool({
  id: "list_project_references",
  description:
    "Daftar referensi (bib) proyek aktif: key, penulis, tahun, judul, DOI, dan apakah key itu sudah disitasi di dokumen. Pakai key dari sini saat menulis `@key`; jangan pernah mengarang key.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    const [references, doc] = await Promise.all([
      listProjectReferences(db, { ownerUserId, workspaceId }),
      WorkspaceDocumentService.getDocument(db, { ownerUserId, workspaceId }),
    ]);
    const integrity = citeIntegrity(
      doc?.source ?? "",
      references.map((r) => r.key),
    );
    const unused = new Set(integrity.unusedReferenceKeys);
    return {
      ok: true as const,
      references: references.map((r) => ({ ...r, cited: !unused.has(r.key) })),
      orphanCiteKeys: integrity.orphanCiteKeys,
    };
  },
});
```

- [ ] **Step 2: Tulis tool tambah referensi**

Buat `apps/agent/src/mastra/tools/add-reference-to-project.ts`:

```ts
import { CitationLinkService } from "@aqsha/services/citations";
import { listProjectReferences, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * add_reference_to_project — WRITE. Menautkan sumber ke bib proyek dan mengembalikan `key` yang
 * dipakai compile. Dipanggil sesudah user setuju; tanpa langkah ini, `@key` yang ditulis agent
 * menjadi sitasi yatim karena entri bib-nya tak pernah ada.
 */
export const addReferenceToProject = createTool({
  id: "add_reference_to_project",
  description:
    "Tambahkan satu referensi ke bib proyek aktif lewat DOI, atau lewat metadata manual bila DOI tak ada. Mengembalikan `key` yang WAJIB dipakai sebagai `@key` di dokumen. Tawarkan dulu ke user dan tunggu persetujuannya sebelum memanggil tool ini.",
  inputSchema: z.object({
    doi: z.string().min(3).optional().describe("DOI sumber, mis. 10.1234/abcd."),
    manual: z
      .object({
        title: z.string().min(1),
        authors: z.string().min(1).describe("Nama penulis dipisah titik koma."),
        year: z.string().min(4).max(4),
        containerTitle: z.string().optional().describe("Nama jurnal/penerbit."),
        url: z.string().optional(),
      })
      .optional()
      .describe("Metadata manual; pakai hanya bila DOI tidak tersedia."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    if (!input.doi && !input.manual) {
      return { ok: false as const, message: "Sertakan `doi` atau `manual`." };
    }
    try {
      const created = input.doi
        ? await CitationLinkService.createInWorkspace(db, {
            ownerUserId,
            workspaceId,
            kind: "doi",
            doi: input.doi,
          })
        : await CitationLinkService.createInWorkspace(db, {
            ownerUserId,
            workspaceId,
            kind: "manual",
            fields: {
              title: input.manual!.title,
              authors: input.manual!.authors,
              year: input.manual!.year,
              containerTitle: input.manual!.containerTitle,
              url: input.manual!.url,
            },
          });
      void created;
      const references = await listProjectReferences(db, { ownerUserId, workspaceId });
      // Key dibangkitkan server saat link dibuat; ambil dari daftar terkini agar selalu key nyata.
      const added = references[references.length - 1];
      return {
        ok: true as const,
        references,
        hint: added
          ? `Gunakan @${added.key} untuk mengutip sumber ini.`
          : "Referensi tertaut; panggil list_project_references untuk melihat key-nya.",
      };
    } catch (err) {
      return {
        ok: false as const,
        message:
          err instanceof Error ? err.message : "Referensi gagal ditambahkan ke proyek.",
      };
    }
  },
});
```

> `ManualCitationInput` adalah tipe milik `@aqsha/services/citations`. Buka `packages/services/src/citations/citation-normalize.ts`, sesuaikan nama field manual di atas dengan bentuk nyata tipe itu, dan hapus field yang tidak ada. Jangan menambahkan field baru ke tipe tersebut.

- [ ] **Step 3: Daftarkan kedua tool**

Di `apps/agent/src/mastra/tools/index.ts`:

```ts
import { addReferenceToProject } from "./add-reference-to-project";
import { listProjectReferencesTool } from "./list-project-references";
```

Di `readTools`, sesudah `check_document`:

```ts
  // Bib proyek — satu-satunya sumber sah untuk `@key`.
  list_project_references: listProjectReferencesTool,
```

Di `writeTools`, sesudah `propose_document_edit`:

```ts
  // Tambah sumber ke bib proyek; konfirmasi percakapan seperti write lain.
  add_reference_to_project: addReferenceToProject,
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/agent && bun run typecheck`
Expected: keluar tanpa error. Bila gagal karena bentuk `ManualCitationInput`, perbaiki pemetaan field di Step 2 sesuai tipe nyatanya.

- [ ] **Step 5: Verifikasi manual**

Jalankan stack dev, buka satu proyek, minta Astra: "tambahkan referensi DOI 10.1145/3313831.3376727 ke proyek ini lalu sitasi di bab pendahuluan". Astra harus menawarkan dulu, lalu sesudah kamu setuju memanggil `add_reference_to_project`, dan `@key` yang muncul di proposalnya harus sama dengan key yang dikembalikan tool. Buka tab References proyek untuk memastikan entri benar-benar tertaut.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/mastra/tools/list-project-references.ts apps/agent/src/mastra/tools/add-reference-to-project.ts apps/agent/src/mastra/tools/index.ts
git commit -m "feat(agent): add project reference tools"
```

---

## Task 7: Usulan struktur bab

**Files:**
- Modify: `packages/services/src/typst/document-proposal.service.ts`
- Create: `apps/agent/src/mastra/tools/propose-outline.ts`
- Modify: `apps/agent/src/mastra/tools/index.ts`

**Interfaces:**
- Consumes: `applyOutlineOperations`, `OutlineOperation` (Task 1); `DocumentProposalService.propose` yang sudah ada.
- Produces: `DocumentProposalService.proposeOutline(db, input: { ownerUserId: string; workspaceId: string; threadId: string | null; operations: OutlineOperation[]; summary: string; resubmitInstruction: string }): Promise<ProposeDocumentEditResult>`

Usulan struktur sengaja bermuara ke pipeline proposal yang sama: user hanya pernah mempelajari satu cara meninjau.

- [ ] **Step 1: Baca jalur propose yang ada**

Buka `packages/services/src/typst/document-proposal.service.ts` dan baca `propose` (mulai baris 152). Catat bagaimana ia menyusun `proposedSource`, menjalankan compile, dan menulis baris proposal — `proposeOutline` harus memakai jalur yang sama, bukan menyalinnya.

- [ ] **Step 2: Tambahkan `proposeOutline`**

Sisipkan method baru di dalam objek `DocumentProposalService`, tepat sesudah `propose`:

```ts
  /**
   * Usulan struktur bab. Operasi diterjemahkan menjadi sumber usulan lalu masuk jalur `propose`
   * yang sama seperti suntingan isi, sehingga validasi compile, batas satu pending per proyek,
   * dan reviewer-nya identik.
   */
  async proposeOutline(
    db: Db,
    input: {
      ownerUserId: string;
      workspaceId: string;
      threadId: string | null;
      operations: OutlineOperation[];
      summary: string;
      resubmitInstruction: string;
    },
  ): Promise<ProposeDocumentEditResult> {
    const doc = await WorkspaceDocumentService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
    });
    let proposedSource: string;
    try {
      proposedSource = applyOutlineOperations(doc?.source ?? "", input.operations);
    } catch (err) {
      return {
        status: "edit_mismatch",
        message: err instanceof Error ? err.message : "Operasi kerangka tidak dapat diterapkan",
      };
    }
    return this.propose(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      fullSource: proposedSource,
      summary: input.summary,
      resubmitInstruction: input.resubmitInstruction,
      annotationIds: [],
    });
  },
```

Tambahkan `import { applyOutlineOperations, type OutlineOperation } from "./outline";` di bagian import berkas itu.

> Sesuaikan nama parameter yang diteruskan ke `this.propose` dengan signature nyatanya (mis. bila ia menerima `edits` dan `fullSource` sebagai union, atau menamai `annotationIds` berbeda). Bila `ProposeDocumentEditResult` tidak punya varian `edit_mismatch` dengan field `message`, pakai varian gagal yang memang ada di tipe itu.

- [ ] **Step 3: Verifikasi typecheck services**

Run: `cd packages/services && bun run typecheck && cd ../.. && bun run build:dist`
Expected: keduanya keluar tanpa error.

- [ ] **Step 4: Tulis tool `propose_outline`**

Buat `apps/agent/src/mastra/tools/propose-outline.ts`:

```ts
import { ChatThreadRepo } from "@aqsha/db";
import { DocumentProposalService, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * propose_outline — WRITE lewat proposal. Untuk struktur bab saja; isi bab tetap lewat
 * propose_document_edit. Indeks bab mengacu ke urutan bab level-1 (0-based) seperti yang
 * dikembalikan get_document_outline pada field `chapterIndex`.
 */
export const proposeOutline = createTool({
  id: "propose_outline",
  description:
    "Usulkan perubahan struktur bab dokumen Typst proyek: tambah, ganti nama, pindahkan, atau hapus bab. `chapterIndex` = urutan bab level-1 (0-based) dari get_document_outline. Untuk mengubah ISI bab, pakai propose_document_edit. Usulan divalidasi compile dan menunggu keputusan user.",
  inputSchema: z.object({
    operations: z
      .array(
        z.discriminatedUnion("op", [
          z.object({
            op: z.literal("insert"),
            afterChapterIndex: z
              .number()
              .int()
              .min(0)
              .nullable()
              .describe("Sisipkan sesudah bab ini; null = di akhir dokumen."),
            title: z.string().min(1),
          }),
          z.object({ op: z.literal("rename"), chapterIndex: z.number().int().min(0), title: z.string().min(1) }),
          z.object({
            op: z.literal("move"),
            chapterIndex: z.number().int().min(0),
            toChapterIndex: z.number().int().min(0),
          }),
          z.object({ op: z.literal("remove"), chapterIndex: z.number().int().min(0) }),
        ]),
      )
      .min(1)
      .max(32),
    summary: z.string().min(1).max(500).describe("Ringkasan perubahan untuk user (bahasa Indonesia)."),
    resubmitInstruction: z
      .string()
      .min(1)
      .max(1200)
      .describe("Instruksi singkat yang diisikan ke composer bila usulan menjadi basi."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const threadId = threadScopeId(ctx);
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId,
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    void ChatThreadRepo;
    const result = await DocumentProposalService.proposeOutline(db, {
      ownerUserId,
      workspaceId,
      threadId,
      operations: input.operations,
      summary: input.summary,
      resubmitInstruction: input.resubmitInstruction,
    });
    return result;
  },
});
```

Hapus baris `void ChatThreadRepo;` beserta importnya bila memang tak terpakai sesudah signature `propose` diketahui.

- [ ] **Step 5: Daftarkan tool**

Di `apps/agent/src/mastra/tools/index.ts` tambahkan `import { proposeOutline } from "./propose-outline";` lalu di `writeTools`:

```ts
  // Usul struktur bab; bermuara ke reviewer proposal yang sama dengan suntingan isi.
  propose_outline: proposeOutline,
```

Run: `cd apps/agent && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 6: Verifikasi manual**

Buka proyek baru yang dokumennya masih kosong, lalu minta: "buatkan kerangka bab skripsi kuantitatif". Astra harus memanggil `propose_outline`, dan hasilnya muncul sebagai proposal biasa dengan banner "tinjau usulan" — bukan jenis kartu baru.

- [ ] **Step 7: Commit**

```bash
git add packages/services/src/typst/document-proposal.service.ts apps/agent/src/mastra/tools/propose-outline.ts apps/agent/src/mastra/tools/index.ts
git commit -m "feat: propose chapter outline through the shared proposal pipeline"
```

---

## Task 8: Aksi cepat kontekstual di empty state chat

**Files:**
- Create: `apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.ts`
- Create: `apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.spec.ts`
- Modify: `apps/svelte/src/lib/features/threads/components/composer/ComposerSuggestionList.svelte`
- Modify: `apps/svelte/src/lib/features/threads/components/composer/Composer.svelte`
- Modify: `apps/svelte/src/lib/features/thread-experience/components/MastraChatThreadSurface.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/components/ProjectChatPane.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte`

**Interfaces:**
- Consumes: `parseDocumentOutline` dari `$lib/features/document/lib/outline`; `AnnotationView` dari `$lib/features/document/api`.
- Produces:
  - `type QuickAction = { label: string; prompt: string }`
  - `projectQuickActions(input: { source: string; bib: string; annotations: readonly { status: string }[] }): QuickAction[]`

Perhitungan berjalan sepenuhnya di klien dari data yang sudah ada di halaman — tidak ada endpoint baru.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { projectQuickActions } from './project-quick-actions';

const SOURCE = [
	'= Pendahuluan',
	'',
	'Menurut @smith2020 dan @hantu2021 hasilnya berbeda sekali sungguh.',
	'',
	'= Metode Penelitian',
	'',
	'= Hasil',
	'',
	'Ada isi.'
].join('\n');

const BIB = '@article{smith2020, title={A}}';

describe('projectQuickActions', () => {
	it('menawarkan melanjutkan bab kosong pertama', () => {
		const actions = projectQuickActions({ source: SOURCE, bib: BIB, annotations: [] });
		expect(actions[0]?.label).toBe('Lanjutkan bab Metode Penelitian — masih kosong');
		expect(actions[0]?.prompt).toContain('Metode Penelitian');
	});

	it('menawarkan memperbaiki sitasi yatim', () => {
		const actions = projectQuickActions({ source: SOURCE, bib: BIB, annotations: [] });
		expect(actions.some((a) => a.label === 'Periksa 1 sitasi yatim')).toBe(true);
	});

	it('menawarkan menjawab anotasi terbuka', () => {
		const actions = projectQuickActions({
			source: SOURCE,
			bib: BIB,
			annotations: [{ status: 'open' }, { status: 'sent' }, { status: 'resolved' }]
		});
		expect(actions.some((a) => a.label === 'Jawab 2 anotasi terbuka')).toBe(true);
	});

	it('menawarkan menyusun kerangka saat dokumen kosong', () => {
		const actions = projectQuickActions({ source: '', bib: '', annotations: [] });
		expect(actions[0]?.label).toBe('Susun kerangka bab');
	});

	it('tak pernah mengembalikan lebih dari empat aksi', () => {
		const actions = projectQuickActions({
			source: SOURCE,
			bib: BIB,
			annotations: [{ status: 'open' }]
		});
		expect(actions.length).toBeLessThanOrEqual(4);
	});

	it('mengembalikan daftar kosong saat tak ada yang perlu dikerjakan', () => {
		expect(projectQuickActions({ source: '= Bab\n\nIsi lengkap.', bib: '', annotations: [] })).toEqual(
			[]
		);
	});
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd apps/svelte && bun run test -- project-quick-actions`
Expected: FAIL — modul `./project-quick-actions` tidak ditemukan.

- [ ] **Step 3: Tulis implementasinya**

Buat `apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.ts`:

```ts
import { parseDocumentOutline } from '$lib/features/document/lib/outline';

export type QuickAction = { label: string; prompt: string };

const CITE_RE = /(^|[^\w@])@([A-Za-z0-9][\w:.-]*)/g;
const BIB_KEY_RE = /@\w+\s*\{\s*([^,\s}]+)/g;

/** Key yang benar-benar ada di bib proyek. */
function bibKeys(bib: string): Set<string> {
	const keys = new Set<string>();
	for (const m of bib.matchAll(BIB_KEY_RE)) keys.add(m[1]!);
	return keys;
}

/** Sitasi `@key` di sumber yang tak punya entri bib. */
function orphanCiteKeys(source: string, bib: string): string[] {
	const known = bibKeys(bib);
	const orphans: string[] = [];
	for (const m of source.matchAll(CITE_RE)) {
		const key = m[2]!.replace(/[.\-:]+$/, '');
		if (key && !known.has(key) && !orphans.includes(key)) orphans.push(key);
	}
	return orphans;
}

function wordsAfter(lines: string[], startLine: number, endLine: number): number {
	let words = 0;
	for (let ln = startLine + 1; ln <= endLine; ln += 1) {
		const text = lines[ln - 1]?.trim() ?? '';
		if (text === '' || text.startsWith('=')) continue;
		words += text.split(/\s+/).length;
	}
	return words;
}

/**
 * Saran pembuka yang dihitung dari keadaan dokumen nyata — memperkenalkan kemampuan Astra tanpa
 * menambah chrome permanen. Urutannya sengaja: kekosongan struktural lebih mendesak daripada
 * pemolesan, dan anotasi terbuka adalah permintaan user yang belum terjawab.
 */
export function projectQuickActions(input: {
	source: string;
	bib: string;
	annotations: readonly { status: string }[];
}): QuickAction[] {
	const actions: QuickAction[] = [];
	const outline = parseDocumentOutline(input.source);
	const lines = input.source.split('\n');

	if (outline.length === 0) {
		actions.push({
			label: 'Susun kerangka bab',
			prompt: 'Susun kerangka bab untuk proyek ini beserta urutan yang lazim.'
		});
	} else {
		const chapters = outline.map((entry, i) => ({
			title: entry.title,
			words: wordsAfter(
				lines,
				entry.sourceLine,
				outline[i + 1] ? outline[i + 1]!.sourceLine - 1 : lines.length
			)
		}));
		const empty = chapters.find((c) => c.words === 0);
		if (empty) {
			actions.push({
				label: `Lanjutkan bab ${empty.title} — masih kosong`,
				prompt: `Tulis isi bab ${empty.title} sesuai konteks proyek ini.`
			});
		}
		const thinnest = chapters
			.filter((c) => c.words > 0)
			.sort((a, b) => a.words - b.words)[0];
		if (thinnest) {
			actions.push({
				label: `Rapikan bab ${thinnest.title} · ${thinnest.words} kata`,
				prompt: `Rapikan dan perdalam bab ${thinnest.title}.`
			});
		}
	}

	const orphans = orphanCiteKeys(input.source, input.bib);
	if (orphans.length > 0) {
		actions.push({
			label: `Periksa ${orphans.length} sitasi yatim`,
			prompt: 'Periksa sitasi yang belum punya entri referensi, lalu tambahkan sumbernya.'
		});
	}

	const open = input.annotations.filter((a) => a.status === 'open' || a.status === 'sent').length;
	if (open > 0) {
		actions.push({
			label: `Jawab ${open} anotasi terbuka`,
			prompt: 'Kerjakan anotasi yang masih terbuka di dokumen ini.'
		});
	}

	return actions.slice(0, 4);
}
```

- [ ] **Step 4: Jalankan tes sampai hijau**

Run: `cd apps/svelte && bun run test -- project-quick-actions`
Expected: PASS, 6 tes hijau.

- [ ] **Step 5: Buat daftar saran menerima data dari luar**

Di `apps/svelte/src/lib/features/threads/components/composer/ComposerSuggestionList.svelte`, ganti blok `let { ... } = $props();` dan pemakaian `composerSuggestions` menjadi:

```svelte
	let {
		onSelectSuggestion,
		landing = false,
		items = composerSuggestions
	}: {
		onSelectSuggestion: (prompt: string) => void;
		landing?: boolean;
		items?: readonly { label: string; prompt: string }[];
	} = $props();
```

lalu ubah `{#each composerSuggestions as item, index (item.label)}` menjadi `{#each items as item, index (item.label)}`, dan ikon per baris menjadi tahan panjang daftar:

```svelte
				<Icon icon={suggestionIcons[index % suggestionIcons.length]!} class="size-3.5" />
```

- [ ] **Step 6: Teruskan saran lewat Composer dan chat surface**

Di `Composer.svelte`, tambahkan prop `suggestions` (default `undefined`) di blok `$props()` dan tipenya `readonly { label: string; prompt: string }[] | undefined`, lalu teruskan ke **kedua** pemakaian `ComposerSuggestionList` dengan `items={suggestions ?? composerSuggestions}`. Import `composerSuggestions` di `Composer.svelte` bila belum ada.

Di `MastraChatThreadSurface.svelte`, tambahkan prop `suggestions` bertipe sama dan teruskan ke `Composer` di samping `showSuggestions`/`showLandingSuggestions` yang sudah ada.

Di `ProjectChatPane.svelte`, tambahkan prop `suggestions` bertipe sama dan teruskan ke `ChatSurface`.

- [ ] **Step 7: Hitung saran di halaman proyek**

Di `ProjectHomePage.svelte`, tambahkan import:

```ts
	import { projectQuickActions } from '../lib/project-quick-actions';
```

Turunkan gerbang dokumen supaya saran tetap terhitung saat tab Chat dibuka lebih dulu di layar sempit — ganti argumen kedua `useWorkspaceDocument` dan `useWorkspaceBib` dari `documentQueriesActive` menjadi `backgroundQueriesActive`:

```ts
	const documentQuery = useWorkspaceDocument(
		() => workspaceId,
		() => backgroundQueriesActive
	);
	const bibQuery = useWorkspaceBib(
		() => workspaceId,
		() => backgroundQueriesActive
	);
```

Tambahkan turunan saran:

```ts
	const quickActions = $derived(
		projectQuickActions({
			source: documentQuery.data?.source ?? '',
			bib: bibQuery.data?.bib ?? '',
			annotations: annotations.data ?? []
		})
	);
```

lalu teruskan ke pane chat di snippet `chatPanel`:

```svelte
			<ProjectChatPane leading={leftToggle} suggestions={quickActions} />
```

- [ ] **Step 8: Verifikasi**

Run: `cd apps/svelte && bun run check`
Expected: 0 error.

Run: `cd apps/svelte && bun run test`
Expected: seluruh suite hijau.

Verifikasi browser: buka proyek yang punya bab kosong dan sitasi yatim, mulai chat baru di dalam proyek. Saran yang muncul harus menyebut nama bab dan jumlah nyata; klik satu saran harus mengisi composer (bukan langsung mengirim); saran hilang sesudah pesan pertama terkirim. Ulangi di lebar <1100px dengan tab Chat sebagai tab awal untuk memastikan saran tetap terisi.

- [ ] **Step 9: Commit**

```bash
git add apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.ts apps/svelte/src/lib/features/workspaces/lib/project-quick-actions.spec.ts apps/svelte/src/lib/features/threads/components/composer/ComposerSuggestionList.svelte apps/svelte/src/lib/features/threads/components/composer/Composer.svelte apps/svelte/src/lib/features/thread-experience/components/MastraChatThreadSurface.svelte apps/svelte/src/lib/features/workspaces/components/ProjectChatPane.svelte apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte
git commit -m "feat(svelte): offer document-aware quick actions in project chat"
```

---

# Fase B — Pin anotasi di preview (Task 9–11)

## Task 9: Penomoran dan penempatan pin

**Files:**
- Create: `apps/svelte/src/lib/features/document/lib/annotation-pins.ts`
- Create: `apps/svelte/src/lib/features/document/lib/annotation-pins.spec.ts`

**Interfaces:**
- Consumes: tidak ada (murni).
- Produces:
  - `type PinCandidate = { id: string; page: number; top: number; left: number; status: 'open' | 'sent'; floating: boolean }`
  - `type PlacedPin = PinCandidate & { number: number }`
  - `placePins(candidates: readonly PinCandidate[], options?: { minGap?: number }): PlacedPin[]`

Nomor pin mengikuti urutan dokumen (halaman lalu posisi vertikal), bukan urutan pembuatan, supaya ❶ selalu yang paling atas.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `apps/svelte/src/lib/features/document/lib/annotation-pins.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { placePins, type PinCandidate } from './annotation-pins';

function pin(id: string, page: number, top: number): PinCandidate {
	return { id, page, top, left: 100, status: 'open', floating: false };
}

describe('placePins', () => {
	it('menomori mengikuti urutan halaman lalu posisi vertikal', () => {
		const placed = placePins([pin('c', 2, 10), pin('a', 1, 300), pin('b', 1, 40)]);
		expect(placed.map((p) => p.id)).toEqual(['b', 'a', 'c']);
		expect(placed.map((p) => p.number)).toEqual([1, 2, 3]);
	});

	it('menggeser pin yang terlalu rapat agar tak menumpuk', () => {
		const placed = placePins([pin('a', 1, 100), pin('b', 1, 108)], { minGap: 26 });
		expect(placed[0]!.top).toBe(100);
		expect(placed[1]!.top).toBe(126);
	});

	it('tidak menggeser pin yang sudah cukup renggang', () => {
		const placed = placePins([pin('a', 1, 100), pin('b', 1, 200)], { minGap: 26 });
		expect(placed[1]!.top).toBe(200);
	});

	it('menghitung jarak per halaman, bukan lintas halaman', () => {
		const placed = placePins([pin('a', 1, 400), pin('b', 2, 10)], { minGap: 26 });
		expect(placed[1]!.top).toBe(10);
	});

	it('mempertahankan status dan penanda melayang', () => {
		const placed = placePins([{ ...pin('a', 1, 10), status: 'sent', floating: true }]);
		expect(placed[0]).toMatchObject({ status: 'sent', floating: true, number: 1 });
	});

	it('mengembalikan daftar kosong untuk masukan kosong', () => {
		expect(placePins([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd apps/svelte && bun run test -- annotation-pins`
Expected: FAIL — modul `./annotation-pins` tidak ditemukan.

- [ ] **Step 3: Tulis implementasinya**

Buat `apps/svelte/src/lib/features/document/lib/annotation-pins.ts`:

```ts
export type PinCandidate = {
	id: string;
	page: number;
	top: number;
	left: number;
	status: 'open' | 'sent';
	/** Teks acuan anotasi tak lagi ditemukan di dokumen; pin hanya boleh ditawari hapus. */
	floating: boolean;
};

export type PlacedPin = PinCandidate & { number: number };

const DEFAULT_MIN_GAP = 26;

/**
 * Urutkan pin mengikuti urutan baca dokumen lalu geser yang bertabrakan ke bawah. Penomoran
 * dihitung dari urutan akhir sehingga nomor pin selalu naik saat mata bergerak turun — pembacaan
 * ini yang membuat nomor pin dan nomor chip composer dapat dipercaya sebagai rujukan yang sama.
 */
export function placePins(
	candidates: readonly PinCandidate[],
	options: { minGap?: number } = {}
): PlacedPin[] {
	const minGap = options.minGap ?? DEFAULT_MIN_GAP;
	const sorted = [...candidates].sort((a, b) => a.page - b.page || a.top - b.top);
	let lastPage: number | null = null;
	let lastTop = Number.NEGATIVE_INFINITY;
	return sorted.map((candidate, i) => {
		if (candidate.page !== lastPage) {
			lastPage = candidate.page;
			lastTop = Number.NEGATIVE_INFINITY;
		}
		const top = Math.max(candidate.top, lastTop + minGap);
		lastTop = top;
		return { ...candidate, top, number: i + 1 };
	});
}
```

- [ ] **Step 4: Jalankan tes sampai hijau**

Run: `cd apps/svelte && bun run test -- annotation-pins`
Expected: PASS, 6 tes hijau.

- [ ] **Step 5: Commit**

```bash
git add apps/svelte/src/lib/features/document/lib/annotation-pins.ts apps/svelte/src/lib/features/document/lib/annotation-pins.spec.ts
git commit -m "feat(svelte): order and place annotation pins by document position"
```

---

## Task 10: Lapisan pin dan popover aksinya

**Files:**
- Create: `apps/svelte/src/lib/features/document/components/AnnotationPinLayer.svelte`
- Modify: `apps/svelte/src/lib/features/document/components/TypstPreview.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/lib/project-annotation-bridge.svelte.ts`
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte`

**Interfaces:**
- Consumes: `placePins`, `PlacedPin` (Task 9); `overlayBoxes` dari `../lib/annotation-selection`; `AnnotationView` dari `../api`.
- Produces:
  - Prop komponen `AnnotationPinLayer`: `{ pins: PlacedPin[]; annotationsById: Map<string, AnnotationView>; stageEl: HTMLElement | null; scrollEl: HTMLElement | null; activeId: string | null; contextIds: ReadonlySet<string>; onFocus: (id: string) => void; onToggleContext: (id: string) => void; onAsk: (id: string) => void; onDismiss: (id: string) => void }`
  - Method baru di `ProjectAnnotationBridge`: `toggleContext(id: string): void`, `ask(id: string): void`

- [ ] **Step 1: Tulis lapisan pin**

Buat `apps/svelte/src/lib/features/document/components/AnnotationPinLayer.svelte`:

```svelte
<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, MessageSquareIcon, SparklesIcon, Trash2Icon } from '$lib/icons';
	import type { AnnotationView } from '../api';
	import type { PlacedPin } from '../lib/annotation-pins';

	/**
	 * Penanda anotasi permanen di atas preview: lingkaran bernomor yang menempel pada bloknya,
	 * hover memunculkan catatan, klik membuka aksi. Semua node ber-atribut `data-annotation-ui`
	 * supaya hit-test mode anotasi mengabaikannya.
	 */
	let {
		pins,
		annotationsById,
		stageEl,
		scrollEl,
		activeId,
		contextIds,
		onFocus,
		onToggleContext,
		onAsk,
		onDismiss
	}: {
		pins: PlacedPin[];
		annotationsById: Map<string, AnnotationView>;
		stageEl: HTMLElement | null;
		scrollEl: HTMLElement | null;
		activeId: string | null;
		contextIds: ReadonlySet<string>;
		onFocus: (id: string) => void;
		onToggleContext: (id: string) => void;
		onAsk: (id: string) => void;
		onDismiss: (id: string) => void;
	} = $props();

	const PANEL_W = 264;
	const PANEL_GAP = 12;

	let openId = $state<string | null>(null);
	let hoverId = $state<string | null>(null);
	let panelH = $state(0);

	const openPin = $derived(pins.find((p) => p.id === openId) ?? null);
	const hoverPin = $derived(
		openId ? null : (pins.find((p) => p.id === hoverId) ?? null)
	);

	function panelPosition(pin: PlacedPin, height: number) {
		if (!stageEl || !scrollEl) return null;
		const stageWidth = stageEl.clientWidth;
		const width = Math.min(PANEL_W, Math.max(200, stageWidth - 16));
		const visibleTop = scrollEl.scrollTop - stageEl.offsetTop;
		const visibleBottom = visibleTop + scrollEl.clientHeight;
		const left = Math.min(Math.max(pin.left, 8), Math.max(8, stageWidth - width - 8));
		let top = pin.top + PANEL_GAP + 22;
		if (top + height > visibleBottom - 12) top = pin.top - height - PANEL_GAP;
		return { left, top: Math.max(top, visibleTop + 8), width };
	}

	const openPanel = $derived(openPin ? panelPosition(openPin, panelH || 170) : null);
	const hoverPanel = $derived(hoverPin ? panelPosition(hoverPin, 76) : null);

	function toggle(id: string): void {
		openId = openId === id ? null : id;
		if (openId) onFocus(id);
	}
</script>

{#each pins as pin (pin.id)}
	{@const annotation = annotationsById.get(pin.id)}
	<button
		type="button"
		data-annotation-ui
		aria-label={`Anotasi ${pin.number}${annotation?.note ? `: ${annotation.note}` : ''}`}
		aria-expanded={openId === pin.id}
		class={[
			'absolute z-30 grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-micro font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			pin.floating
				? 'border-dashed border-muted-foreground/60 bg-card text-muted-foreground opacity-60'
				: pin.status === 'sent'
					? 'border-card bg-lemon text-lemon-foreground'
					: 'border-lemon bg-card text-foreground',
			contextIds.has(pin.id) && 'ring-2 ring-mint',
			activeId === pin.id && 'ring-2 ring-lemon'
		]}
		style:left={`${pin.left}px`}
		style:top={`${pin.top}px`}
		onmouseenter={() => (hoverId = pin.id)}
		onmouseleave={() => (hoverId = null)}
		onclick={() => toggle(pin.id)}
	>
		{pin.number}
	</button>
{/each}

{#if hoverPin && hoverPanel}
	{@const annotation = annotationsById.get(hoverPin.id)}
	<div
		data-annotation-ui
		role="tooltip"
		class="pointer-events-none absolute z-40 rounded-md bg-foreground px-2 py-1.5 text-label text-background"
		style:left={`${hoverPanel.left}px`}
		style:top={`${hoverPanel.top}px`}
		style:width={`${hoverPanel.width}px`}
	>
		<p class="line-clamp-3">{annotation?.note ?? 'Tanpa catatan'}</p>
		<p class="mt-1 text-micro opacity-70">
			{hoverPin.floating
				? 'teks sudah berubah'
				: hoverPin.status === 'sent'
					? 'terkirim ke Astra'
					: 'belum dikirim'}
		</p>
	</div>
{/if}

{#if openPin && openPanel}
	{@const annotation = annotationsById.get(openPin.id)}
	<div
		data-annotation-ui
		role="dialog"
		aria-label={`Anotasi ${openPin.number}`}
		bind:clientHeight={panelH}
		class="absolute z-40 flex flex-col gap-2 rounded-lg border-2 border-border bg-card p-2 shadow-[0_2px_0_0_var(--border)]"
		style:left={`${openPanel.left}px`}
		style:top={`${openPanel.top}px`}
		style:width={`${openPanel.width}px`}
	>
		{#if annotation?.selectedText}
			<p class="line-clamp-2 border-l-2 border-lemon pl-2 text-label text-muted-foreground">
				"{annotation.selectedText}"
			</p>
		{/if}
		<p class="text-sm">{annotation?.note ?? 'Tanpa catatan'}</p>
		{#if openPin.floating}
			<p class="text-label text-muted-foreground">
				Teks acuan sudah berubah, jadi anotasi ini tak bisa ditunjuk lagi.
			</p>
			<div class="flex justify-end">
				<Button
					type="button"
					size="sm"
					variant="outline"
					onclick={() => {
						openId = null;
						onDismiss(openPin.id);
					}}
				>
					<Icon icon={Trash2Icon} class="size-3.5" /> Hapus
				</Button>
			</div>
		{:else}
			<div class="flex flex-wrap items-center justify-end gap-1.5">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onclick={() => onToggleContext(openPin.id)}
				>
					<Icon icon={MessageSquareIcon} class="size-3.5" />
					{contextIds.has(openPin.id) ? 'Lepas konteks' : 'Jadikan konteks'}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onclick={() => {
						openId = null;
						onDismiss(openPin.id);
					}}
				>
					<Icon icon={Trash2Icon} class="size-3.5" /> Hapus
				</Button>
				<Button
					type="button"
					size="sm"
					onclick={() => {
						openId = null;
						onAsk(openPin.id);
					}}
				>
					<Icon icon={SparklesIcon} class="size-3.5" /> Minta Astra
				</Button>
			</div>
		{/if}
	</div>
{/if}
```

Bila `Trash2Icon` belum ada di `$lib/icons`, tambahkan ekspornya di `packages/ui-svelte/src/icons.ts` berbasis Hugeicons — jangan mengimpor `lucide-react`.

- [ ] **Step 2: Hitung pin di preview**

Di `TypstPreview.svelte`, tambahkan import:

```ts
	import AnnotationPinLayer from './AnnotationPinLayer.svelte';
	import { placePins, type PinCandidate } from '../lib/annotation-pins';
	import { SvelteMap } from 'svelte/reactivity';
```

Tambahkan state pin di samping `overlayItems`:

```ts
	let pinCandidates = $state<PinCandidate[]>([]);
	const pins = $derived(placePins(pinCandidates));
	const annotationsById = $derived(
		new SvelteMap((annotations ?? []).map((a) => [a.id, a] as const))
	);
```

Di dalam `refreshOverlays()`, kumpulkan kandidat pin bersamaan dengan overlay — sesudah `items.push({...})`, tambahkan di dalam blok `if (boxes.length > 0)`:

```ts
					const first = boxes[0]!;
					candidates.push({
						id: a.id,
						page: a.page,
						// Pin duduk di kiri-luar blok supaya tak menutupi teks dokumen.
						left: Math.max(first.left - 14, 10),
						top: first.top + 8,
						status: a.status === 'sent' ? 'sent' : 'open',
						floating: false
					});
```

Deklarasikan `const candidates: PinCandidate[] = [];` di awal fungsi bersama `items`, dan di akhir fungsi tambahkan `pinCandidates = candidates;` tepat sesudah `overlayItems = items;`. Pada jalur early-return (`if (!svgHost || !stageEl)`), set `pinCandidates = []` juga.

Render lapisannya tepat sebelum `<AnnotationModeLayer … />`:

```svelte
				<AnnotationPinLayer
					{pins}
					{annotationsById}
					{stageEl}
					{scrollEl}
					activeId={activeAnnotationId ?? null}
					contextIds={selectedAnnotationIds ?? new Set()}
					onFocus={(id) => onSelectAnnotation?.(id)}
					onToggleContext={(id) => onToggleAnnotationContext?.(id)}
					onAsk={(id) => onAskAnnotation?.(id)}
					onDismiss={(id) => onDismissAnnotation?.(id)}
				/>
```

Tambahkan tiga prop opsional baru ke blok `$props()` `TypstPreview.svelte`, bertipe `((id: string) => void) | undefined`: `onToggleAnnotationContext`, `onAskAnnotation`, `onDismissAnnotation`.

- [ ] **Step 3: Tambahkan aksi ke bridge anotasi**

Di `project-annotation-bridge.svelte.ts`, tambahkan ke `ProjectAnnotationBridgeOptions`:

```ts
	setComposerDraft: (text: string) => void;
	selectChat: () => void;
```

lalu tambahkan dua method pada kelasnya:

```ts
	toggleContext = (id: string): void => {
		const existing = this.#options.mentions.selectionRefs.find(
			(ref) => ref.kind === 'document-annotation' && ref.annotationId === id
		);
		if (existing) {
			this.#options.mentions.removeSelectionRefByKey(contextRefKey(existing));
			return;
		}
		const annotation = this.#options.getAnnotations().find((item) => item.id === id);
		if (!annotation) return;
		const selectedText = annotation.selectedText ?? '';
		const elementLabel = annotation.selectedText ?? 'Bagian dokumen';
		this.#options.mentions.addSelectionRef({
			kind: 'document-annotation',
			workspaceId: this.#options.workspaceId(),
			annotationId: annotation.id,
			page: annotation.page,
			selectedText,
			note: annotation.note ?? '',
			elementLabel,
			label: buildDocumentAnnotationMentionLabel(elementLabel, selectedText)
		});
	};

	/** Siapkan giliran untuk anotasi ini: pasang sebagai konteks, isi composer, pindah ke Chat. */
	ask = (id: string): void => {
		const annotation = this.#options.getAnnotations().find((item) => item.id === id);
		if (!annotation) return;
		const alreadyContext = this.#options.mentions.selectionRefs.some(
			(ref) => ref.kind === 'document-annotation' && ref.annotationId === id
		);
		if (!alreadyContext) this.toggleContext(id);
		this.#options.setComposerDraft(
			annotation.note?.trim() ? annotation.note.trim() : 'Kerjakan anotasi ini.'
		);
		this.#options.selectChat();
	};
```

Import `contextRefKey` dari `@aqsha/chat-core` di berkas itu.

- [ ] **Step 4: Sambungkan di halaman proyek**

Di `ProjectHomePage.svelte`, lengkapi konstruksi `annotationBridge` dengan dua opsi baru:

```ts
		setComposerDraft: (text) => mentions.setComposerDraft(text),
		selectChat: () => selectLeftMode('chat')
```

lalu teruskan aksi ke `Preview`:

```svelte
					onToggleAnnotationContext={annotationBridge.toggleContext}
					onAskAnnotation={annotationBridge.ask}
					onDismissAnnotation={(id) => {
						void dismissAnnotations.mutateAsync({ ids: [id] });
					}}
```

- [ ] **Step 5: Verifikasi**

Run: `cd apps/svelte && bun run check`
Expected: 0 error.

Verifikasi browser pada satu proyek dengan dua anotasi:
1. Pin ❶ dan ❷ muncul terurut dari atas dan tetap menempel saat scroll dan saat zoom diubah.
2. Hover memunculkan catatan beserta status; anotasi yang sudah terkirim tampak terisi, yang belum tampak bergaris.
3. Klik membuka popover; *Jadikan konteks* menambahkan chip di composer dan pin mendapat ring mint; *Lepas konteks* mengembalikannya.
4. *Minta Astra* mengisi composer dengan catatan anotasi dan memindahkan panel ke Chat, tanpa mengirim otomatis.
5. *Hapus* menghilangkan pin.
6. Di lebar <1100px, buka tab Preview dan pastikan popover tetap muat di layar (membalik ke atas saat pin dekat batas bawah).

- [ ] **Step 6: Commit**

```bash
git add apps/svelte/src/lib/features/document/components/AnnotationPinLayer.svelte apps/svelte/src/lib/features/document/components/TypstPreview.svelte apps/svelte/src/lib/features/workspaces/lib/project-annotation-bridge.svelte.ts apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte
git commit -m "feat(svelte): mark annotated blocks with numbered pins"
```

---

## Task 11: Anotasi melayang dan nomor di chip composer

**Files:**
- Create: `apps/svelte/src/lib/features/document/lib/annotation-reanchor.ts`
- Create: `apps/svelte/src/lib/features/document/lib/annotation-reanchor.spec.ts`
- Modify: `apps/svelte/src/lib/features/document/components/TypstPreview.svelte`
- Modify: `apps/svelte/src/lib/features/workspaces/lib/project-annotation-bridge.svelte.ts`

**Interfaces:**
- Consumes: `normalizeHeadingText` dari `./outline`.
- Produces:
  - `locateNormalizedText(nodeTexts: readonly string[], needle: string): { startNode: number; endNode: number } | null`
  - `buildTextIndex(root: Element): { nodes: Text[]; texts: string[] }`
  - `findAnnotationAnchor(root: Element, selectedText: string): Element | null`

Anotasi menyimpan koordinat absolut, jadi begitu dokumen berubah pin bernomor akan duduk di teks yang salah. Pencarian ulang teks memindahkan pin yang masih bisa ditemukan dan menandai sisanya melayang.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `apps/svelte/src/lib/features/document/lib/annotation-reanchor.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { locateNormalizedText } from './annotation-reanchor';

describe('locateNormalizedText', () => {
	it('menemukan teks yang terpecah ke beberapa node', () => {
		expect(locateNormalizedText(['Metode pen', 'elitian ini'], 'metode penelitian')).toEqual({
			startNode: 0,
			endNode: 1
		});
	});

	it('mengabaikan perbedaan spasi dan huruf besar', () => {
		expect(locateNormalizedText(['  METODE   Penelitian '], 'metode penelitian')).toEqual({
			startNode: 0,
			endNode: 0
		});
	});

	it('mengembalikan null saat teks tak ada', () => {
		expect(locateNormalizedText(['Pendahuluan'], 'metode')).toBeNull();
	});

	it('mengembalikan null untuk needle kosong', () => {
		expect(locateNormalizedText(['apa pun'], '   ')).toBeNull();
	});

	it('menunjuk kemunculan pertama saat teks berulang', () => {
		expect(locateNormalizedText(['bab', 'bab'], 'bab')).toEqual({ startNode: 0, endNode: 0 });
	});
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd apps/svelte && bun run test -- annotation-reanchor`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Tulis implementasinya**

Buat `apps/svelte/src/lib/features/document/lib/annotation-reanchor.ts`:

```ts
import { normalizeHeadingText } from './outline';

/**
 * Cari rentang node teks yang memuat `needle` sesudah kedua sisi dinormalisasi. Lapisan teks SVG
 * Typst memecah kalimat ke banyak node dengan spasi tak konsisten, jadi pencocokan hanya masuk akal
 * pada bentuk ternormalisasi. Murni supaya logikanya dapat diuji tanpa DOM.
 */
export function locateNormalizedText(
	nodeTexts: readonly string[],
	needle: string
): { startNode: number; endNode: number } | null {
	const target = normalizeHeadingText(needle);
	if (!target) return null;
	const starts: number[] = [];
	let acc = '';
	for (const text of nodeTexts) {
		starts.push(acc.length);
		acc += normalizeHeadingText(text);
	}
	const at = acc.indexOf(target);
	if (at < 0) return null;
	const end = at + target.length;
	let startNode = 0;
	let endNode = starts.length - 1;
	for (let i = 0; i < starts.length; i += 1) {
		if (starts[i]! <= at) startNode = i;
		if (starts[i]! < end) endNode = i;
	}
	return { startNode, endNode };
}

/** Seluruh node teks di bawah `root` beserta isinya, dalam urutan dokumen. */
export function buildTextIndex(root: Element): { nodes: Text[]; texts: string[] } {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	const texts: string[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		nodes.push(n as Text);
		texts.push(n.textContent ?? '');
	}
	return { nodes, texts };
}

/** Elemen terdekat yang memuat awal `selectedText`, atau null bila teksnya sudah hilang. */
export function findAnnotationAnchor(root: Element, selectedText: string): Element | null {
	const { nodes, texts } = buildTextIndex(root);
	const hit = locateNormalizedText(texts, selectedText);
	if (!hit) return null;
	return nodes[hit.startNode]?.parentElement ?? null;
}
```

- [ ] **Step 4: Jalankan tes sampai hijau**

Run: `cd apps/svelte && bun run test -- annotation-reanchor`
Expected: PASS, 5 tes hijau.

- [ ] **Step 5: Pakai penambatan ulang di preview**

Di `TypstPreview.svelte`, import `findAnnotationAnchor` dari `../lib/annotation-reanchor`.

Di dalam `refreshOverlays()`, untuk tiap anotasi yang punya `selectedText`, coba tambatkan ulang **sebelum** memakai `rects` tersimpan:

```ts
			const anchored = a.selectedText ? findAnnotationAnchor(svgHost, a.selectedText) : null;
			// Koordinat tersimpan bersifat absolut; sesudah dokumen berubah hanya pencarian teks yang
			// masih dapat dipercaya untuk menempatkan pin.
			const boxes = anchored
				? [anchorBox(anchored, stageEl)]
				: overlayBoxes(svgHost, stageEl, a.page, a.rects);
			const floating = Boolean(a.selectedText) && anchored === null;
```

Tambahkan helper di berkas yang sama:

```ts
	/** Kotak elemen ter-tambat dalam koordinat stage. */
	function anchorBox(el: Element, stage: HTMLElement) {
		const box = el.getBoundingClientRect();
		const stageBox = stage.getBoundingClientRect();
		return {
			left: box.left - stageBox.left,
			top: box.top - stageBox.top,
			width: box.width,
			height: box.height
		};
	}
```

Teruskan `floating` ke kandidat pin (`floating` menggantikan nilai `false` yang ditulis di Task 10), dan lewati sorotan kotak untuk anotasi melayang supaya tak ada highlight menyesatkan:

```ts
			if (!floating && boxes.length > 0) {
				items.push({ id: a.id, active: a.id === activeAnnotationId, selected: selectedAnnotationIds?.has(a.id) ?? false, boxes });
			}
```

Pin melayang tetap didorong ke `candidates` memakai `overlayBoxes` lama sebagai posisi terakhir yang diketahui.

- [ ] **Step 6: Nomor pin di chip composer**

Di `project-annotation-bridge.svelte.ts`, tambahkan opsi `getPinNumber: (id: string) => number | null` ke `ProjectAnnotationBridgeOptions`, lalu sisipkan nomornya saat menyusun label chip di `create` dan `toggleContext`:

```ts
		const pinNumber = this.#options.getPinNumber(annotation.id);
		const elementLabel = pinNumber ? `${pinNumber}. ${baseLabel}` : baseLabel;
```

di mana `baseLabel` adalah nilai `elementLabel` yang sebelumnya dipakai. Di `ProjectHomePage.svelte`, sediakan opsi itu dari daftar pin yang di-expose `TypstPreview` lewat prop terikat baru `bind:pinNumbers` bertipe `Map<string, number>`; isi map itu di preview dari hasil `placePins`.

- [ ] **Step 7: Verifikasi**

Run: `cd apps/svelte && bun run check && bun run test`
Expected: 0 error, seluruh tes hijau.

Verifikasi browser: buat anotasi pada satu kalimat, lalu ubah kalimat itu lewat Editor sampai teksnya berbeda. Sesudah preview ter-compile ulang, pin anotasi itu harus tampil redup dengan tooltip "teks sudah berubah" dan hanya menawarkan *Hapus*. Anotasi pada kalimat yang hanya bergeser posisinya (mis. karena bab di atasnya bertambah) harus pindah mengikuti kalimatnya, bukan menjadi melayang. Chip di composer harus memuat nomor yang sama dengan pin.

- [ ] **Step 8: Commit**

```bash
git add apps/svelte/src/lib/features/document/lib/annotation-reanchor.ts apps/svelte/src/lib/features/document/lib/annotation-reanchor.spec.ts apps/svelte/src/lib/features/document/components/TypstPreview.svelte apps/svelte/src/lib/features/workspaces/lib/project-annotation-bridge.svelte.ts apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte
git commit -m "feat(svelte): re-anchor annotations and flag ones whose text moved on"
```

---

# Fase C — Proposal per-hunk dan diff inline (Task 12–16)

## Task 12: Basis stabil untuk keputusan bertahap

**Files:**
- Modify: `packages/db/src/schema/documentEditProposals.ts`
- Create: `packages/db/migrations/0046_*.sql` (dihasilkan `bun run db:generate`)

**Interfaces:**
- Produces: kolom `base_source: text not null default ''`, `hunk_decisions: jsonb not null default '{}'`, `applied_version: integer` pada `document_edit_proposals`; tipe `DocumentEditProposal` ikut bertambah field `baseSource`, `hunkDecisions`, `appliedVersion`.

Indeks hunk harus terikat ke snapshot sumber saat proposal dibuat. Tanpa itu, penerimaan hunk pertama menaikkan versi dokumen dan seluruh sisa proposal langsung dinilai basi.

- [ ] **Step 1: Tambahkan kolom di schema**

Di `packages/db/src/schema/documentEditProposals.ts`, sisipkan tiga kolom sesudah `proposedSource`:

```ts
    /** Snapshot sumber saat proposal dibuat; indeks hunk selalu dihitung terhadap ini. */
    baseSource: text("base_source").notNull().default(""),
    /** Peta indeks hunk → "accepted" | "rejected"; hunk yang belum diputuskan tak muncul di sini. */
    hunkDecisions: jsonb("hunk_decisions")
      .$type<Record<string, "accepted" | "rejected">>()
      .notNull()
      .default({}),
    /** Versi dokumen terakhir yang ditulis proposal ini; kebasian diukur terhadap nilai ini. */
    appliedVersion: integer("applied_version"),
```

Perbarui juga komentar blok di atas tabel supaya menerangkan basis stabil, menggantikan kalimat yang menyebut accept sebagai operasi tunggal.

- [ ] **Step 2: Hasilkan migrasi**

Run: `bun run db:generate`
Expected: berkas baru `packages/db/migrations/0046_*.sql` berisi tiga `ALTER TABLE ... ADD COLUMN`.

Baca berkas hasilnya dan pastikan tidak ada `DROP` apa pun. Bila ada, hentikan dan periksa schema.

- [ ] **Step 3: Jalankan migrasi**

Run: `bun run db:migrate`
Expected: migrasi 0046 tercatat berhasil.

- [ ] **Step 4: Netralkan proposal pending lama**

Proposal yang sudah pending sebelum migrasi tidak punya `base_source`, sehingga indeks hunknya tak dapat dipercaya. Perlakukan sebagai basi lewat guard, bukan lewat penghapusan data. Tambahkan di `getPending` (Task 13) syarat: `row.baseSource === "" && row.status === "pending"` ⇒ `isStale: true`.

Catat ini sekarang; implementasinya menyusul di Task 13, Step 4.

- [ ] **Step 5: Typecheck**

Run: `cd packages/db && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/documentEditProposals.ts packages/db/migrations
git commit -m "feat(db): anchor proposal hunks to a stable base snapshot"
```

---

## Task 13: Keputusan hunk bertahap di service

**Files:**
- Modify: `packages/services/src/typst/hunks.ts`
- Modify: `packages/services/src/typst/document-proposal.service.ts`
- Create: `packages/services/test/typst-proposal-hunk-decisions.test.ts`
- Modify: `packages/services/src/typst/index.ts`

**Interfaces:**
- Consumes: `computeProposalHunks`, `applyHunkSelection` (sudah ada).
- Produces:
  - `type HunkDecision = "accepted" | "rejected"`
  - `type HunkDecisions = Record<string, HunkDecision>`
  - `resolveHunkDecisions(baseSource: string, proposedSource: string, decisions: HunkDecisions): { hunks: ProposalHunk[]; appliedSource: string; targetSource: string; remainingHunks: ProposalHunk[]; allDecided: boolean; acceptedCount: number }`
  - `DocumentProposalService.decideHunk(db, input: { ownerUserId: string; proposalId: string; hunkIndex: number; decision: HunkDecision }): Promise<DecideHunkResult>`
  - `type DecideHunkResult = { status: "recorded"; contentVersion: number; remainingHunks: ProposalHunk[]; closed: boolean } | { status: "compile_error"; compileErrors: TypstDiagnostic[] } | { status: "stale"; currentVersion: number }`
  - `PendingProposalView` bertambah field `remainingHunks: ProposalHunk[]`, `decidedCount: number`, `totalHunks: number`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `packages/services/test/typst-proposal-hunk-decisions.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { resolveHunkDecisions } from "../src/typst/hunks";

const BASE = ["= Bab Satu", "", "Alpha.", "", "= Bab Dua", "", "Beta.", "", "= Bab Tiga", "", "Gamma."].join("\n");
const PROPOSED = BASE.replace("Alpha.", "Alpha diperluas.").replace("Gamma.", "Gamma diperluas.");

describe("resolveHunkDecisions", () => {
  test("tanpa keputusan, seluruh hunk masih tersisa dan sumber tak berubah", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, {});
    expect(r.hunks).toHaveLength(2);
    expect(r.appliedSource).toBe(BASE);
    expect(r.remainingHunks).toHaveLength(2);
    expect(r.allDecided).toBe(false);
    expect(r.acceptedCount).toBe(0);
  });

  test("hunk yang diterima masuk ke sumber dan hilang dari sisa", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "accepted" });
    expect(r.appliedSource).toContain("Alpha diperluas.");
    expect(r.appliedSource).toContain("Gamma.");
    expect(r.remainingHunks).toHaveLength(1);
    expect(r.acceptedCount).toBe(1);
  });

  test("hunk yang ditolak tidak mengubah sumber tapi tetap hilang dari sisa", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "rejected" });
    expect(r.appliedSource).toBe(BASE);
    expect(r.remainingHunks).toHaveLength(1);
    expect(r.acceptedCount).toBe(0);
  });

  test("sisa hunk dianchor ke sumber tersimpan, bukan ke basis", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "accepted" });
    const remaining = r.remainingHunks[0]!;
    const appliedLines = r.appliedSource.split("\n");
    expect(appliedLines[remaining.oldStart - 1]).toBeDefined();
    expect(remaining.lines.some((l) => l === "-Gamma.")).toBe(true);
    expect(remaining.lines.some((l) => l === "+Gamma diperluas.")).toBe(true);
  });

  test("semua diterima menghasilkan sumber usulan utuh", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "accepted", "1": "accepted" });
    expect(r.appliedSource).toBe(PROPOSED);
    expect(r.remainingHunks).toHaveLength(0);
    expect(r.allDecided).toBe(true);
  });

  test("semua ditolak mengembalikan sumber basis dan menutup keputusan", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "rejected", "1": "rejected" });
    expect(r.appliedSource).toBe(BASE);
    expect(r.allDecided).toBe(true);
    expect(r.acceptedCount).toBe(0);
  });

  test("keputusan campuran memakai target gabungan diterima dan belum diputuskan", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "1": "accepted" });
    expect(r.appliedSource).toContain("Gamma diperluas.");
    expect(r.targetSource).toBe(PROPOSED);
    expect(r.remainingHunks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd packages/services && bun test --timeout 30000 test/typst-proposal-hunk-decisions.test.ts`
Expected: FAIL — `resolveHunkDecisions` bukan ekspor `../src/typst/hunks`.

- [ ] **Step 3: Tulis inti keputusan**

Tambahkan di akhir `packages/services/src/typst/hunks.ts`:

```ts
export type HunkDecision = "accepted" | "rejected";
export type HunkDecisions = Record<string, HunkDecision>;

/**
 * Hitung keadaan proposal dari peta keputusan. `appliedSource` adalah dokumen yang seharusnya
 * tersimpan sekarang (basis + hunk yang diterima); `remainingHunks` adalah hunk yang belum
 * diputuskan, sudah dianchor ke `appliedSource` sehingga klien tak perlu menggeser baris sendiri.
 */
export function resolveHunkDecisions(
  baseSource: string,
  proposedSource: string,
  decisions: HunkDecisions,
): {
  hunks: ProposalHunk[];
  appliedSource: string;
  targetSource: string;
  remainingHunks: ProposalHunk[];
  allDecided: boolean;
  acceptedCount: number;
} {
  const hunks = computeProposalHunks(baseSource, proposedSource);
  const accepted = new Set<number>();
  const undecided = new Set<number>();
  for (const hunk of hunks) {
    const decision = decisions[String(hunk.index)];
    if (decision === "accepted") accepted.add(hunk.index);
    else if (decision !== "rejected") undecided.add(hunk.index);
  }
  const appliedSource = applyHunkSelection(baseSource, hunks, accepted);
  const targetSource = applyHunkSelection(
    baseSource,
    hunks,
    new Set([...accepted, ...undecided]),
  );
  return {
    hunks,
    appliedSource,
    targetSource,
    remainingHunks: computeProposalHunks(appliedSource, targetSource),
    allDecided: undecided.size === 0,
    acceptedCount: accepted.size,
  };
}
```

- [ ] **Step 4: Jalankan tes sampai hijau**

Run: `cd packages/services && bun test --timeout 30000 test/typst-proposal-hunk-decisions.test.ts`
Expected: PASS, 7 tes hijau.

- [ ] **Step 5: Simpan snapshot basis saat proposal dibuat**

Di `document-proposal.service.ts`, pada jalur `propose` yang menulis baris proposal, sertakan dua field baru: `baseSource` diisi sumber dokumen saat proposal dibuat (nilai yang sudah dipakai untuk menghitung diff), dan `appliedVersion` diisi sama dengan `baseVersion`.

- [ ] **Step 6: Ubah `getPending`**

Ganti bagian `return { … }` pada `getPending` menjadi memakai keputusan tersimpan:

```ts
    const decisions = (row.hunkDecisions ?? {}) as HunkDecisions;
    const resolved = resolveHunkDecisions(row.baseSource, row.proposedSource, decisions);
    const appliedVersion = row.appliedVersion ?? row.baseVersion;
    // Proposal lama dari sebelum snapshot basis ada tak punya indeks hunk yang dapat dipercaya.
    const isStale = row.baseSource === "" || currentVersion !== appliedVersion;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      baseVersion: row.baseVersion,
      proposedSource: row.proposedSource,
      summary: row.summary,
      resubmitInstruction: row.resubmitInstruction,
      annotationIds: row.annotationIds,
      threadId: row.threadId,
      createdAt: row.createdAt,
      currentSource: doc?.source ?? "",
      currentVersion,
      isStale,
      hunks: resolved.hunks,
      remainingHunks: isStale ? [] : resolved.remainingHunks,
      decidedCount: resolved.hunks.length - resolved.remainingHunks.length,
      totalHunks: resolved.hunks.length,
    };
```

Tambahkan ketiga field baru ke tipe `PendingProposalView`.

- [ ] **Step 7: Tulis `decideHunk`**

Tambahkan method baru di `DocumentProposalService`, sesudah `accept`:

```ts
  /**
   * Putuskan satu hunk. Tolak hanya mencatat keputusan — tanpa compile, tanpa tulis. Terima
   * menghitung ulang dokumen dari basis + seluruh hunk yang diterima, meng-compile, lalu menyimpan
   * dengan CAS terhadap versi yang terakhir ditulis proposal ini. Proposal tertutup sendiri saat
   * hunk terakhir diputuskan.
   */
  async decideHunk(
    db: Db,
    input: {
      ownerUserId: string;
      proposalId: string;
      hunkIndex: number;
      decision: HunkDecision;
      enforceRateLimit?: boolean;
    },
  ): Promise<DecideHunkResult> {
    const proposal = await assertPendingProposal(db, input.ownerUserId, input.proposalId);
    const doc = await WorkspaceDocumentService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: proposal.workspaceId,
    });
    const currentVersion = doc?.contentVersion ?? 0;
    const appliedVersion = proposal.appliedVersion ?? proposal.baseVersion;
    if (proposal.baseSource === "" || currentVersion !== appliedVersion) {
      await DocumentEditProposalRepo.updateById(db, proposal.id, {
        status: "superseded",
        decidedAt: Date.now(),
      });
      return { status: "stale", currentVersion };
    }

    const decisions: HunkDecisions = {
      ...((proposal.hunkDecisions ?? {}) as HunkDecisions),
      [String(input.hunkIndex)]: input.decision,
    };
    const before = resolveHunkDecisions(proposal.baseSource, proposal.proposedSource, {
      ...((proposal.hunkDecisions ?? {}) as HunkDecisions),
    });
    if (!Number.isInteger(input.hunkIndex) || input.hunkIndex < 0 || input.hunkIndex >= before.hunks.length) {
      throwAppError({
        message: "Hunk tidak ditemukan",
        code: "invalid_hunk_selection",
        severity: "warning",
        status: 422,
      });
    }
    const after = resolveHunkDecisions(proposal.baseSource, proposal.proposedSource, decisions);

    let nextVersion = currentVersion;
    if (after.appliedSource !== before.appliedSource) {
      if (Buffer.byteLength(after.appliedSource, "utf8") > TYPST_SOURCE_MAX_BYTES) {
        throwAppError({
          message: "Sumber hasil keputusan terlalu besar. Maksimum 2 MB.",
          code: "typst_source_too_large",
          severity: "warning",
          status: 413,
        });
      }
      // Sumber yang identik dengan usulan sudah lolos compile saat proposal dibuat.
      if (after.appliedSource !== proposal.proposedSource) {
        if (input.enforceRateLimit !== false) await consumeCompileQuota(input.ownerUserId);
        const bib = await composeProjectBib(db, {
          ownerUserId: input.ownerUserId,
          workspaceId: proposal.workspaceId,
        });
        const mainFileName = await mainFileNameForWorkspace(db, proposal.workspaceId);
        const compiled = await TypstCompileService.compile({
          mainTyp: after.appliedSource,
          bib,
          mainFileName,
        });
        if (!compiled.ok) return { status: "compile_error", compileErrors: compiled.errors };
      }
      const saved = await WorkspaceDocumentService.saveDocument(db, {
        ownerUserId: input.ownerUserId,
        workspaceId: proposal.workspaceId,
        source: after.appliedSource,
        ...(appliedVersion > 0 ? { baseVersion: appliedVersion } : {}),
        author: "agent",
      });
      if (saved.status === "stale_write") {
        await DocumentEditProposalRepo.updateById(db, proposal.id, {
          status: "superseded",
          decidedAt: Date.now(),
        });
        return { status: "stale", currentVersion: saved.currentVersion };
      }
      nextVersion = saved.contentVersion;
    }

    const now = Date.now();
    await DocumentEditProposalRepo.updateById(db, proposal.id, {
      hunkDecisions: decisions,
      appliedVersion: nextVersion,
      ...(after.allDecided
        ? { status: after.acceptedCount > 0 ? "accepted" : "rejected", decidedAt: now }
        : {}),
    });
    if (after.allDecided) {
      await DocumentAnnotationRepo.updateProposalStatusByIds(
        db,
        input.ownerUserId,
        proposal.workspaceId,
        proposal.annotationIds,
        { status: after.acceptedCount > 0 ? "resolved" : "open", updatedAt: now },
      );
    }
    return {
      status: "recorded",
      contentVersion: nextVersion,
      remainingHunks: after.remainingHunks,
      closed: after.allDecided,
    };
  },
```

Tambahkan tipe hasilnya di dekat `AcceptProposalResult`:

```ts
export type DecideHunkResult =
  | { status: "recorded"; contentVersion: number; remainingHunks: ProposalHunk[]; closed: boolean }
  | { status: "compile_error"; compileErrors: TypstDiagnostic[] }
  | { status: "stale"; currentVersion: number };
```

Sesuaikan import di berkas itu: `HunkDecision`, `HunkDecisions`, `resolveHunkDecisions` dari `./hunks`.

- [ ] **Step 8: Selaraskan `accept` dengan basis baru**

`accept` tetap menjadi jalur aksi borong. Ubah dua hal saja: baca basis dari `proposal.baseSource` (bukan dari dokumen berjalan) saat menghitung `computeProposalHunks`, dan pakai `proposal.appliedVersion ?? proposal.baseVersion` sebagai pembanding versi serta `baseVersion` CAS. Hunk yang sudah diputuskan sebelumnya harus ikut dihormati: gabungkan `acceptedHunkIndexes` dengan indeks yang sudah `accepted` di `hunkDecisions`.

- [ ] **Step 9: Ekspor dan verifikasi**

Tambahkan di `packages/services/src/typst/index.ts`:

```ts
export {
  type DecideHunkResult,
  type HunkDecision,
  type HunkDecisions,
  resolveHunkDecisions,
} from "./hunks";
```

Run: `cd packages/services && bun test --timeout 30000 && bun run typecheck`
Expected: seluruh tes services hijau kecuali kegagalan yang sudah ada sebelum pekerjaan ini (catat baselinenya sebelum mulai), typecheck bersih.

Run: `bun run build:dist`
Expected: selesai tanpa error.

- [ ] **Step 10: Commit**

```bash
git add packages/services/src/typst/hunks.ts packages/services/src/typst/document-proposal.service.ts packages/services/src/typst/index.ts packages/services/test/typst-proposal-hunk-decisions.test.ts
git commit -m "feat(services): decide proposal hunks incrementally against a stable base"
```

---

## Task 14: Endpoint keputusan hunk dan hook klien

**Files:**
- Modify: `apps/api/src/routes/workspaces.ts`
- Modify: `apps/svelte/src/lib/features/document/api.ts`

**Interfaces:**
- Consumes: `DocumentProposalService.decideHunk` (Task 13).
- Produces:
  - Route `POST /workspaces/:id/proposals/:pid/hunks/:index` body `{ decision: "accept" | "reject" }`
  - Tipe klien `DecideHunkResult` dan hook `useDecideHunk(workspaceId: () => string)` dengan `mutate({ proposalId, hunkIndex, decision })`
  - `PendingProposalView` klien bertambah `remainingHunks`, `decidedCount`, `totalHunks`

- [ ] **Step 1: Tambahkan route**

Di `apps/api/src/routes/workspaces.ts`, sisipkan sesudah route `/proposals/:pid/accept`:

```ts
  .post(
    "/workspaces/:id/proposals/:pid/hunks/:index",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return DocumentProposalService.decideHunk(db, {
        ownerUserId,
        proposalId: params.pid,
        hunkIndex: Number(params.index),
        decision: body.decision === "accept" ? "accepted" : "rejected",
      });
    },
    {
      auth: true,
      params: t.Object({ id: t.String(), pid: t.String(), index: t.Integer({ minimum: 0 }) }),
      body: t.Object({ decision: t.Union([t.Literal("accept"), t.Literal("reject")]) }),
    },
  )
```

- [ ] **Step 2: Verifikasi api**

Run: `cd apps/api && bun run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 3: Perluas tipe klien**

Di `apps/svelte/src/lib/features/document/api.ts`, tambahkan ke `PendingProposalView`:

```ts
	remainingHunks: ProposalHunk[];
	decidedCount: number;
	totalHunks: number;
```

dan tipe hasil keputusan di bawah `AcceptProposalResult`:

```ts
export type DecideHunkResult =
	| { status: 'recorded'; contentVersion: number; remainingHunks: ProposalHunk[]; closed: boolean }
	| { status: 'compile_error'; compileErrors: TypstCompileError[] }
	| { status: 'stale'; currentVersion: number };
```

- [ ] **Step 4: Tambahkan hook**

Tambahkan sesudah `useRejectProposal`:

```ts
export function useDecideHunk(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			proposalId: string;
			hunkIndex: number;
			decision: 'accept' | 'reject';
		}) =>
			unwrap(
				await api
					.workspaces({ id: workspaceId() })
					.proposals({ pid: input.proposalId })
					.hunks({ index: input.hunkIndex })
					.post({ decision: input.decision })
			) as DecideHunkResult,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.proposals(workspaceId()) });
		}
	}));
}
```

Sesuaikan bentuk pemanggilan Eden Treaty dengan pola yang dipakai `useAcceptProposal` di berkas yang sama bila berbeda.

- [ ] **Step 5: Verifikasi**

Run: `cd apps/svelte && bun run check`
Expected: 0 error.

Verifikasi manual dengan `curl` memakai token Clerk yang valid: kirim `POST` ke endpoint baru dengan `decision: "reject"` pada proposal pending, lalu `GET /workspaces/:id/proposals` — `remainingHunks` harus berkurang satu dan `currentVersion` tidak berubah.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/workspaces.ts apps/svelte/src/lib/features/document/api.ts
git commit -m "feat(api): expose per-hunk proposal decisions"
```

---

## Task 15: Extension diff inline di CodeMirror

**Files:**
- Create: `apps/svelte/src/lib/features/document/lib/proposal-diff-extension.ts`
- Create: `apps/svelte/src/lib/features/document/lib/proposal-diff-decorations.spec.ts`
- Modify: `apps/svelte/src/lib/features/document/lib/typst-editor.ts`
- Modify: `apps/svelte/src/lib/features/document/components/TypstSourceEditor.svelte`

**Interfaces:**
- Consumes: `ProposalHunk` dari `../api`; `proposalHunkLabel` dari `./proposal-hunk-label`.
- Produces:
  - `type ProposalDiffState = { hunks: ProposalHunk[]; labelFor: (hunk: ProposalHunk) => string; busyIndex: number | null; errors: Record<number, string[]>; onDecide: (index: number, decision: 'accept' | 'reject') => void }`
  - `setProposalDiff: StateEffect<ProposalDiffState | null>`
  - `proposalDiffExtension(): Extension`
  - `planDiffDecorations(totalLines: number, hunks: readonly ProposalHunk[]): DiffDecorationPlan[]` (murni, diuji)
  - `TypstEditorHandle` bertambah `setProposalDiff(state: ProposalDiffState | null): void`

Buffer editor berisi sumber **tersimpan**, jadi baris `-` memang ada di dokumen dan cukup dihias, sementara baris `+` belum ada dan disisipkan sebagai widget blok yang tak dapat diketik.

- [ ] **Step 1: Tulis tes perencanaan dekorasi**

Buat `apps/svelte/src/lib/features/document/lib/proposal-diff-decorations.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planDiffDecorations } from './proposal-diff-extension';

const HUNK = {
	index: 0,
	oldStart: 3,
	oldLines: 2,
	newStart: 3,
	newLines: 3,
	lines: [' konteks', '-lama', '+baru satu', '+baru dua', ' ekor']
};

describe('planDiffDecorations', () => {
	it('menaruh action bar di baris awal hunk', () => {
		const plan = planDiffDecorations(20, [HUNK]);
		expect(plan[0]).toEqual({ kind: 'bar', line: 3, hunkIndex: 0 });
	});

	it('menandai baris yang dihapus pada nomor baris buffer', () => {
		const plan = planDiffDecorations(20, [HUNK]);
		expect(plan).toContainEqual({ kind: 'removed', line: 4, hunkIndex: 0 });
	});

	it('menyisipkan baris tambahan sesudah baris terakhir yang dikonsumsi', () => {
		const plan = planDiffDecorations(20, [HUNK]);
		expect(plan).toContainEqual({
			kind: 'added',
			line: 4,
			hunkIndex: 0,
			lines: ['baru satu', 'baru dua']
		});
	});

	it('mengabaikan marker no-newline', () => {
		const plan = planDiffDecorations(20, [{ ...HUNK, lines: ['\\ No newline', ' konteks'] }]);
		expect(plan.filter((p) => p.kind !== 'bar')).toEqual([]);
	});

	it('menjepit baris yang melewati akhir dokumen', () => {
		const plan = planDiffDecorations(3, [{ ...HUNK, oldStart: 99 }]);
		expect(plan.every((p) => p.line >= 1 && p.line <= 3)).toBe(true);
	});

	it('mengembalikan rencana kosong tanpa hunk', () => {
		expect(planDiffDecorations(10, [])).toEqual([]);
	});
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

Run: `cd apps/svelte && bun run test -- proposal-diff-decorations`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Tulis extension**

Buat `apps/svelte/src/lib/features/document/lib/proposal-diff-extension.ts`:

```ts
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { ProposalHunk } from '../api';

export type ProposalDiffState = {
	hunks: ProposalHunk[];
	labelFor: (hunk: ProposalHunk) => string;
	busyIndex: number | null;
	errors: Record<number, string[]>;
	onDecide: (index: number, decision: 'accept' | 'reject') => void;
};

export type DiffDecorationPlan =
	| { kind: 'bar'; line: number; hunkIndex: number }
	| { kind: 'removed'; line: number; hunkIndex: number }
	| { kind: 'added'; line: number; hunkIndex: number; lines: string[] };

function clamp(line: number, total: number): number {
	return Math.min(Math.max(line, 1), Math.max(total, 1));
}

/**
 * Terjemahkan hunk unified diff menjadi rencana dekorasi terhadap buffer. Buffer berisi sumber
 * tersimpan, jadi baris '-' dan konteks menempati nomor baris nyata sementara baris '+' hanya
 * punya jangkar: baris terakhir yang sudah dikonsumsi. Murni supaya pemetaan barisnya dapat diuji.
 */
export function planDiffDecorations(
	totalLines: number,
	hunks: readonly ProposalHunk[]
): DiffDecorationPlan[] {
	const plan: DiffDecorationPlan[] = [];
	for (const hunk of hunks) {
		plan.push({ kind: 'bar', line: clamp(hunk.oldStart, totalLines), hunkIndex: hunk.index });
		let oldLine = hunk.oldStart;
		let anchor = hunk.oldStart - 1;
		let pending: string[] = [];
		const flush = () => {
			if (pending.length === 0) return;
			plan.push({
				kind: 'added',
				line: clamp(anchor, totalLines),
				hunkIndex: hunk.index,
				lines: pending
			});
			pending = [];
		};
		for (const raw of hunk.lines) {
			if (raw.startsWith('\\')) continue;
			if (raw.startsWith('+')) {
				pending.push(raw.slice(1));
				continue;
			}
			flush();
			if (raw.startsWith('-')) {
				plan.push({ kind: 'removed', line: clamp(oldLine, totalLines), hunkIndex: hunk.index });
			}
			anchor = oldLine;
			oldLine += 1;
		}
		flush();
	}
	return plan;
}

export const setProposalDiff = StateEffect.define<ProposalDiffState | null>();

const proposalDiffField = StateField.define<ProposalDiffState | null>({
	create: () => null,
	update(value, tr) {
		for (const effect of tr.effects) if (effect.is(setProposalDiff)) return effect.value;
		return value;
	}
});

class AddedLinesWidget extends WidgetType {
	constructor(readonly lines: string[]) {
		super();
	}
	eq(other: AddedLinesWidget): boolean {
		return other.lines.join('\n') === this.lines.join('\n');
	}
	toDOM(): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = 'cm-proposal-added';
		for (const line of this.lines) {
			const row = document.createElement('div');
			row.className = 'cm-proposal-added-line';
			// Baris kosong tetap perlu tinggi agar blok tambahan terbaca utuh.
			row.textContent = line === '' ? ' ' : line;
			wrap.appendChild(row);
		}
		return wrap;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

class HunkBarWidget extends WidgetType {
	constructor(
		readonly hunk: ProposalHunk,
		readonly state: ProposalDiffState
	) {
		super();
	}
	eq(other: HunkBarWidget): boolean {
		return (
			other.hunk.index === this.hunk.index &&
			other.state.busyIndex === this.state.busyIndex &&
			(other.state.errors[this.hunk.index]?.join('|') ?? '') ===
				(this.state.errors[this.hunk.index]?.join('|') ?? '')
		);
	}
	toDOM(): HTMLElement {
		const bar = document.createElement('div');
		bar.className = 'cm-proposal-bar';

		const label = document.createElement('span');
		label.className = 'cm-proposal-bar-label';
		label.textContent = this.state.labelFor(this.hunk);
		bar.appendChild(label);

		const busy = this.state.busyIndex !== null;
		for (const decision of ['accept', 'reject'] as const) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `cm-proposal-bar-action cm-proposal-bar-${decision}`;
			button.textContent = decision === 'accept' ? 'Terima' : 'Tolak';
			button.disabled = busy;
			button.addEventListener('click', (event) => {
				event.preventDefault();
				if (busy) return;
				this.state.onDecide(this.hunk.index, decision);
			});
			bar.appendChild(button);
		}

		const errors = this.state.errors[this.hunk.index];
		if (errors && errors.length > 0) {
			const note = document.createElement('p');
			note.className = 'cm-proposal-bar-error';
			note.textContent = errors.join(' · ');
			bar.appendChild(note);
		}
		return bar;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

function buildDecorations(view: EditorView): DecorationSet {
	const state = view.state.field(proposalDiffField, false);
	if (!state || state.hunks.length === 0) return Decoration.none;
	const doc = view.state.doc;
	const byIndex = new Map(state.hunks.map((h) => [h.index, h] as const));
	const ranges = planDiffDecorations(doc.lines, state.hunks).flatMap((item) => {
		const line = doc.line(item.line);
		if (item.kind === 'bar') {
			const hunk = byIndex.get(item.hunkIndex);
			if (!hunk) return [];
			return [
				Decoration.widget({
					widget: new HunkBarWidget(hunk, state),
					block: true,
					side: -1
				}).range(line.from)
			];
		}
		if (item.kind === 'removed') {
			return [Decoration.line({ class: 'cm-proposal-removed' }).range(line.from)];
		}
		return [
			Decoration.widget({ widget: new AddedLinesWidget(item.lines), block: true, side: 1 }).range(
				line.to
			)
		];
	});
	return Decoration.set(ranges, true);
}

const diffTheme = EditorView.baseTheme({
	'.cm-proposal-removed': {
		backgroundColor: 'color-mix(in oklch, var(--coral) 18%, transparent)'
	},
	'.cm-proposal-added': {
		backgroundColor: 'color-mix(in oklch, var(--mint) 18%, transparent)',
		borderLeft: '2px solid var(--mint)',
		padding: '0 0 0 6px'
	},
	'.cm-proposal-added-line': { whiteSpace: 'pre-wrap' },
	'.cm-proposal-bar': {
		display: 'flex',
		alignItems: 'center',
		gap: '6px',
		flexWrap: 'wrap',
		margin: '6px 0 2px',
		padding: '4px 8px',
		border: '2px solid var(--border)',
		borderRadius: '8px',
		background: 'var(--card)',
		fontSize: '11px'
	},
	'.cm-proposal-bar-label': { flex: '1 1 auto', color: 'var(--muted-foreground)' },
	'.cm-proposal-bar-action': {
		border: '2px solid var(--border)',
		borderRadius: '6px',
		padding: '1px 8px',
		cursor: 'pointer',
		background: 'var(--background)'
	},
	'.cm-proposal-bar-accept': { background: 'var(--mint)', color: 'var(--mint-foreground)' },
	'.cm-proposal-bar-error': {
		flexBasis: '100%',
		margin: '2px 0 0',
		color: 'var(--destructive)'
	}
});

export function proposalDiffExtension(): Extension {
	return [
		proposalDiffField,
		EditorView.decorations.compute([proposalDiffField], () => Decoration.none),
		EditorView.updateListener.of(() => {}),
		diffTheme,
		ViewPluginDecorations
	];
}
```

Ganti dua baris pengganti sementara (`EditorView.decorations.compute(...)` dan `updateListener` kosong) dan `ViewPluginDecorations` dengan satu view plugin nyata:

```ts
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';

const diffDecorationsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.state.field(proposalDiffField, false) !== update.startState.field(proposalDiffField, false)) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations }
);

export function proposalDiffExtension(): Extension {
	return [proposalDiffField, diffDecorationsPlugin, diffTheme];
}
```

Pastikan hanya versi kedua yang tersisa di berkas.

- [ ] **Step 4: Jalankan tes sampai hijau**

Run: `cd apps/svelte && bun run test -- proposal-diff-decorations`
Expected: PASS, 6 tes hijau.

- [ ] **Step 5: Pasang extension di editor**

Di `typst-editor.ts`, import `proposalDiffExtension` dan `setProposalDiff` beserta tipenya, tambahkan `proposalDiffExtension()` ke daftar `extensions` (sesudah `EditorView.lineWrapping`), lalu tambahkan method pada handle yang dikembalikan:

```ts
		setProposalDiff(next) {
			view.dispatch({ effects: setProposalDiff.of(next) });
		},
```

dan tambahkan `setProposalDiff(next: ProposalDiffState | null): void;` ke tipe `TypstEditorHandle`.

- [ ] **Step 6: Teruskan dari komponen editor**

Di `TypstSourceEditor.svelte`, tambahkan prop `proposalDiff: ProposalDiffState | null` (default `null`) dan efek yang meneruskannya:

```ts
	$effect(() => {
		const next = proposalDiff;
		handle?.setProposalDiff(next);
	});
```

Pasang juga sesudah mount, bersama `local.setDiagnostics(seed.diagnostics);`:

```ts
				local.setProposalDiff(untrack(() => proposalDiff));
```

- [ ] **Step 7: Verifikasi**

Run: `cd apps/svelte && bun run check && bun run test`
Expected: 0 error, seluruh tes hijau.

- [ ] **Step 8: Commit**

```bash
git add apps/svelte/src/lib/features/document/lib/proposal-diff-extension.ts apps/svelte/src/lib/features/document/lib/proposal-diff-decorations.spec.ts apps/svelte/src/lib/features/document/lib/typst-editor.ts apps/svelte/src/lib/features/document/components/TypstSourceEditor.svelte
git commit -m "feat(svelte): render proposal hunks as inline editor diff"
```

---

## Task 16: Review inline menggantikan kartu proposal

**Files:**
- Modify: `apps/svelte/src/lib/features/workspaces/lib/project-proposal-controller.svelte.ts`
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte`
- Modify: `apps/svelte/src/lib/features/document/components/TypstPreview.svelte`
- Delete: `apps/svelte/src/lib/features/document/components/ProposalReviewCard.svelte`

**Interfaces:**
- Consumes: `useDecideHunk` (Task 14); `ProposalDiffState`, `setProposalDiff` (Task 15); `proposalHunkLabel` (sudah ada).
- Produces: `ProjectProposalController` bertambah `remainingHunks: ProposalHunk[]`, `diffState: ProposalDiffState | null`, `decide(index, decision)`, `acceptRest()`, `rejectRest()`.

- [ ] **Step 1: Ubah controller proposal**

Di `project-proposal-controller.svelte.ts`:

- Tambahkan opsi `decideHunk: (input: { proposalId: string; hunkIndex: number; decision: 'accept' | 'reject' }, handlers: { onSuccess: (r: DecideHunkResult) => void; onError: (e: unknown) => void }) => void`.
- Tambahkan getter `remainingHunks`: `this.#options.getProposal()?.remainingHunks ?? []`, lalu ubah `hunkCount` menjadi `this.remainingHunks.length` sehingga badge toggle Editor menghitung sisa, bukan total.
- Tambahkan state `#busyIndex = $state<number | null>(null)` dan `#hunkErrors = $state<Record<number, string[]>>({})`.
- Tambahkan `decide`:

```ts
	decide = (hunkIndex: number, decision: 'accept' | 'reject'): void => {
		const proposal = this.#options.getProposal();
		if (!proposal || this.#busyIndex !== null) return;
		this.#busyIndex = hunkIndex;
		this.#options.decideHunk(
			{ proposalId: proposal.id, hunkIndex, decision },
			{
				onSuccess: (result) => {
					this.#busyIndex = null;
					if (result.status === 'compile_error') {
						// Urutan penerimaan bisa berarti: hunk ini tetap terbuka sampai gabungannya sah.
						this.#hunkErrors = {
							...this.#hunkErrors,
							[hunkIndex]: result.compileErrors.map((e) =>
								e.line > 0 ? `baris ${e.line}: ${e.message}` : e.message
							)
						};
						return;
					}
					this.#hunkErrors = {};
					if (result.status === 'stale') {
						toast.warning('Sumber sudah berubah — usulan dibatalkan. Minta Astra menyusun ulang.');
					} else if (result.closed) {
						toast.success('Seluruh usulan sudah diputuskan.');
					}
					this.#options.reload();
					this.#options.onSettled();
				},
				onError: (error) => {
					this.#busyIndex = null;
					toast.error(readableApiErrorMessage(error, 'Gagal menyimpan keputusan.'));
				}
			}
		);
	};
```

- Tambahkan `diffState` yang dipakai editor:

```ts
	get diffState(): ProposalDiffState | null {
		const proposal = this.#options.getProposal();
		if (!proposal || proposal.isStale || proposal.remainingHunks.length === 0) return null;
		return {
			hunks: proposal.remainingHunks,
			labelFor: (hunk) => proposalHunkLabel(proposal.currentSource, hunk),
			busyIndex: this.#busyIndex,
			errors: this.#hunkErrors,
			onDecide: this.decide
		};
	}
```

- Ganti `accept`/`reject` lama menjadi aksi borong `acceptRest()` (mengirim seluruh indeks sisa lewat jalur `accept` yang sudah ada) dan `rejectRest()` (memanggil `reject` proposal). Hapus `beginReview`, `exitReview`, `reviewing`, dan `acceptErrors` beserta seluruh pemakaiannya; `resubmit` tetap ada tanpa `exitReview()`.

- [ ] **Step 2: Sederhanakan halaman proyek**

Di `ProjectHomePage.svelte`:

- Hapus import dan pemakaian `ProposalReviewCard`, serta cabang `{#if proposalController.reviewing && proposal.data}` di snippet `editorPanel` — panel editor selalu menampilkan editor.
- Tambahkan `const decideHunk = useDecideHunk(() => workspaceId);` dan teruskan ke controller sebagai opsi `decideHunk`.
- Teruskan diff ke editor: `proposalDiff={proposalController.diffState}` pada `<Editor … />`.
- Kunci editor selama masih ada hunk terbuka. Ganti prop `editable`:

```svelte
						editable={runtime.editable && proposalController.remainingHunks.length === 0}
```

- Tambahkan banner penjelas di atas editor, tepat sesudah banner `stale` yang sudah ada:

```svelte
				{#if proposalController.remainingHunks.length > 0}
					<div
						class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-mint/15 px-3 py-2 text-label"
						role="status"
					>
						<span>
							Usulan Astra menunggu keputusan · {proposalController.remainingHunks.length} bagian
							tersisa. Editor terkunci sampai semuanya diputuskan.
						</span>
						<div class="flex gap-1.5">
							<Button type="button" size="sm" variant="outline" onclick={proposalController.rejectRest}>
								Tolak sisanya
							</Button>
							<Button type="button" size="sm" onclick={proposalController.acceptRest}>
								Terima sisanya
							</Button>
						</div>
					</div>
				{/if}
```

- Badge pada toggle Editor sudah membaca `proposalController.hunkCount`, yang kini bernilai jumlah sisa — tak perlu diubah.

- [ ] **Step 3: Ubah banner preview jadi penunjuk sisa**

Di `TypstPreview.svelte`, ganti isi banner proposal:

```svelte
		{#if proposalHunkCount > 0}
			<div
				class="m-3 flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card px-3 py-2"
			>
				<span class="text-label">
					Astra mengusulkan suntingan · {proposalHunkCount} bagian tersisa.
				</span>
				<Button type="button" size="sm" onclick={() => onReviewProposal?.()}>Buka editor</Button>
			</div>
		{/if}
```

`onReviewProposal` sekarang cukup memindahkan panel ke Editor: di `ProjectHomePage.svelte` ganti `onReviewProposal={proposalController.beginReview}` menjadi `onReviewProposal={() => selectLeftMode('editor')}`.

- [ ] **Step 4: Hapus kartu lama**

```bash
git rm apps/svelte/src/lib/features/document/components/ProposalReviewCard.svelte
```

Pastikan tak ada lagi rujukan tersisa:

Run: `grep -rn "ProposalReviewCard" apps/svelte/src`
Expected: tanpa hasil.

- [ ] **Step 5: Verifikasi**

Run: `cd apps/svelte && bun run check && bun run test`
Expected: 0 error, seluruh tes hijau.

Verifikasi browser dengan satu proposal tiga hunk:
1. Banner preview menyebut jumlah sisa; tombol memindahkan ke tab Editor.
2. Diff tampil inline: baris lama berlatar coral pada teks nyata, baris baru berlatar mint sebagai blok, action bar berlabel bab di atas tiap hunk.
3. Editor read-only selama masih ada hunk terbuka.
4. Klik **Terima** hunk pertama: teks final langsung tampak di editor, preview ter-compile ulang, banner berubah jadi 2 tersisa.
5. Klik **Tolak** hunk kedua: buffer tak berubah dan tak ada compile, banner jadi 1 tersisa.
6. Putuskan hunk terakhir: banner dan badge hilang, editor kembali dapat disunting, anotasi yang dijawab berpindah ke resolved.
7. Buka dokumen yang sama di tab kedua, simpan perubahan manual di situ, lalu coba memutuskan hunk di tab pertama: statusnya menjadi basi dan hanya menyisakan tolak sisanya serta minta Astra susun ulang.
8. Ulangi alur di lebar <1100px lewat tab Editor.

- [ ] **Step 6: Commit**

```bash
git add apps/svelte/src/lib/features/workspaces/lib/project-proposal-controller.svelte.ts apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte apps/svelte/src/lib/features/document/components/TypstPreview.svelte
git commit -m "feat(svelte): review proposals inline and retire the review card"
```

---

## Penutup

Sesudah Task 16, jalankan gerbang penuh sekali:

```bash
bun run build:dist
cd packages/services && bun test --timeout 30000 && bun run typecheck
cd ../db && bun run typecheck
cd ../../apps/api && bun run typecheck
cd ../agent && bun run typecheck
cd ../svelte && bun run check && bun run test
```

`@aqsha/web` tetap gagal typecheck seperti sebelum pekerjaan ini — jangan mencoba memperbaikinya di sini.

Pertimbangkan entri changelog produk sesuai `docs/product/versioning-and-changelog.md`; perubahan ini terlihat langsung oleh pengguna.
