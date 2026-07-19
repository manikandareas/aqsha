# Research-first Fase 7: Per-hunk Diff Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reviewer bisa terima/tolak per-hunk pada kartu usulan suntingan Astra; hanya hunk terpilih yang diterapkan, subset sejati di-dry-run compile sebelum persist CAS.

**Architecture:** Hunks diturunkan server-side (`structuredPatch` lib `diff@9`) di `getPending` dan dihitung ulang saat `accept`; identitas indeks dijamin guard `baseVersion === currentVersion` (stale → reject-only, tanpa rebase). Rekonstruksi subset via `applyPatch` atas hunk terpilih (non-overlapping, terurut). Fast-path all-selected memakai `proposedSource` yang sudah lolos compile saat propose (tanpa compile ulang). Tanpa migrasi skema.

**Tech Stack:** Bun workspaces, Drizzle/Postgres, Elysia (Eden Treaty), SvelteKit 5 (runes), `diff@^9.0.0`, bun:test.

**Spec:** `docs/superpowers/specs/2026-07-19-research-first-phase7-per-hunk-diff-review-design.md`

## Global Constraints

- Selalu `bun` (1.3.10); jangan npm/pnpm/yarn.
- Komentar kode: jelaskan **why**, TANPA referensi fase/plan/tiket (CLAUDE.md).
- `apps/svelte` tidak boleh impor `@aqsha/db`/`@aqsha/services` — tipe di-mirror manual di `features/sections/api.ts`.
- Migrasi dir = `packages/db/migrations` (fase ini TANPA migrasi — jangan buat).
- Runtime api/agent dev impor kondisi `bun` → source, tapi verifikasi runtime tetap `bun run build:dist` + restart proses.
- Icon svelte: hugeicons via `$lib/icons` / `@aqsha/ui-svelte`; jangan lucide.
- Baseline typecheck svelte: hanya 2 error pre-existing `DetailPanel:158-159`; services typecheck 0 error. Baseline test services: 8 fail pre-existing (tectonic cold-bundle) — jangan tambah fail baru.
- UI copy sentence case, bahasa Indonesia, tanpa all-caps.

---

### Task 1: Modul `hunks.ts` di services + unit tests

**Files:**
- Modify: `packages/services/package.json` (tambah dependency `diff`)
- Create: `packages/services/src/latex/hunks.ts`
- Modify: `packages/services/src/latex/index.ts` (ekspor)
- Test: `packages/services/test/hunks.test.ts`

**Interfaces:**
- Consumes: `structuredPatch`, `applyPatch` dari `diff@9` (sudah ter-install di root via apps/svelte).
- Produces (dipakai Task 2):
  - `type ProposalHunk = { index: number; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }`
  - `computeProposalHunks(baseSource: string, proposedSource: string): ProposalHunk[]`
  - `applyHunkSelection(baseSource: string, hunks: ProposalHunk[], acceptedIndexes: ReadonlySet<number>): string`

Catatan perilaku `diff@9` (sudah diverifikasi dari source ter-install): hunk `lines` berprefiks `' '`/`'-'`/`'+'` dan bisa berisi baris marker `"\ No newline at end of file"` (prefiks `\`). `applyPatch` mengembalikan `false` bila konteks tak cocok.

- [ ] **Step 1: Tambah dependency `diff` ke services**

Di `packages/services/package.json`, tambahkan ke `dependencies` (urut alfabet, setelah `"bullmq"`):

```json
    "diff": "^9.0.0",
```

Run: `bun install`
Expected: sukses, lockfile update kecil (versi sudah ada di root).

- [ ] **Step 2: Tulis unit test yang gagal**

Buat `packages/services/test/hunks.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { applyHunkSelection, computeProposalHunks } from "../src/latex/hunks";

// Dua suntingan berjarak >2×context(3) baris supaya menjadi dua hunk terpisah.
const BASE = [
  "\\section{Pendahuluan}",
  "Kalimat pembuka lama.",
  "Baris tiga.",
  "Baris empat.",
  "Baris lima.",
  "Baris enam.",
  "Baris tujuh.",
  "Baris delapan.",
  "Baris sembilan.",
  "Baris sepuluh.",
  "Penutup lama.",
  "Baris akhir.",
].join("\n");
const PROPOSED = BASE.replace("Kalimat pembuka lama.", "Kalimat pembuka baru.").replace(
  "Penutup lama.",
  "Penutup baru.",
);

describe("computeProposalHunks", () => {
  test("sumber identik → tanpa hunk", () => {
    expect(computeProposalHunks(BASE, BASE)).toEqual([]);
  });

  test("dua suntingan berjauhan → dua hunk terindeks urut", () => {
    const hunks = computeProposalHunks(BASE, PROPOSED);
    expect(hunks.length).toBe(2);
    expect(hunks.map((h) => h.index)).toEqual([0, 1]);
    expect(hunks[0]!.oldStart).toBeLessThan(hunks[1]!.oldStart);
  });

  test("basis kosong (draf awal) → satu hunk penuh", () => {
    const hunks = computeProposalHunks("", "Baris satu.\nBaris dua.\n");
    expect(hunks.length).toBe(1);
    expect(applyHunkSelection("", hunks, new Set([0]))).toBe("Baris satu.\nBaris dua.\n");
  });
});

describe("applyHunkSelection", () => {
  const hunks = computeProposalHunks(BASE, PROPOSED);

  test("semua terpilih ≡ proposedSource; kosong ≡ baseSource", () => {
    expect(applyHunkSelection(BASE, hunks, new Set([0, 1]))).toBe(PROPOSED);
    expect(applyHunkSelection(BASE, hunks, new Set())).toBe(BASE);
  });

  test("subset → hanya hunk terpilih yang diterapkan", () => {
    const onlyFirst = BASE.replace("Kalimat pembuka lama.", "Kalimat pembuka baru.");
    const onlySecond = BASE.replace("Penutup lama.", "Penutup baru.");
    expect(applyHunkSelection(BASE, hunks, new Set([0]))).toBe(onlyFirst);
    expect(applyHunkSelection(BASE, hunks, new Set([1]))).toBe(onlySecond);
  });

  test("trailing newline dipertahankan persis (tambah & hapus)", () => {
    const noEol = "a\nb";
    const withEol = "a\nb\n";
    const addEol = computeProposalHunks(noEol, withEol);
    expect(applyHunkSelection(noEol, addEol, new Set(addEol.map((h) => h.index)))).toBe(withEol);
    const dropEol = computeProposalHunks(withEol, noEol);
    expect(applyHunkSelection(withEol, dropEol, new Set(dropEol.map((h) => h.index)))).toBe(noEol);
  });

  test("basis bukan basis diff → throw (guard bug internal)", () => {
    expect(() => applyHunkSelection("Sumber lain sama sekali.", hunks, new Set([0]))).toThrow();
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd packages/services && bun test test/hunks.test.ts`
Expected: FAIL — `Cannot find module '../src/latex/hunks'`.

- [ ] **Step 4: Implementasi `hunks.ts`**

Buat `packages/services/src/latex/hunks.ts`:

```ts
import { applyPatch, structuredPatch } from "diff";

export type ProposalHunk = {
  /** Identitas yang dirujuk reviewer saat accept parsial; stabil selama basis tak berubah. */
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Prefiks ' ' konteks, '-' hapus, '+' tambah, '\' marker no-newline. */
  lines: string[];
};

/**
 * Hunks diff basis→usulan. Deterministik untuk input sama (context tetap 3) — dihitung di
 * getPending untuk display dan dihitung ulang saat accept; kesamaan hasil dijamin karena
 * kedua sisi memakai fungsi ini atas basis yang sama (guard versi di jalur accept).
 */
export function computeProposalHunks(
  baseSource: string,
  proposedSource: string,
): ProposalHunk[] {
  const patch = structuredPatch("a", "b", baseSource, proposedSource, undefined, undefined, {
    context: 3,
  });
  return patch.hunks.map((hunk, index) => ({
    index,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines,
  }));
}

/**
 * Terapkan subset hunk ke basis. Hunk hasil satu structuredPatch terurut dan tak tumpang
 * tindih, jadi cukup geser newStart hunk terpilih (posisi di file hasil bergeser saat hunk
 * sebelumnya dibuang) lalu serahkan ke applyPatch dengan fuzz 0 — konteks wajib cocok
 * persis. Gagal apply berarti basis bukan basis diff → bug pemanggil, bukan input user.
 */
export function applyHunkSelection(
  baseSource: string,
  hunks: ProposalHunk[],
  acceptedIndexes: ReadonlySet<number>,
): string {
  const selected = hunks.filter((hunk) => acceptedIndexes.has(hunk.index));
  if (selected.length === 0) return baseSource;
  let delta = 0;
  const adjusted = selected.map((hunk) => {
    const shifted = {
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.oldStart + delta,
      newLines: hunk.newLines,
      lines: hunk.lines,
    };
    delta += hunk.newLines - hunk.oldLines;
    return shifted;
  });
  const result = applyPatch(baseSource, {
    oldFileName: "a",
    newFileName: "b",
    oldHeader: undefined,
    newHeader: undefined,
    hunks: adjusted,
  });
  if (result === false) {
    throw new Error("Subset hunk tidak dapat diterapkan ke sumber basis");
  }
  return result;
}
```

Tambahkan di `packages/services/src/latex/index.ts` (setelah blok ekspor `section-proposal.service`):

```ts
export { applyHunkSelection, computeProposalHunks, type ProposalHunk } from "./hunks";
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd packages/services && bun test test/hunks.test.ts`
Expected: PASS semua (8 test).

- [ ] **Step 6: Commit**

```bash
git add packages/services/package.json packages/services/src/latex/hunks.ts packages/services/src/latex/index.ts packages/services/test/hunks.test.ts bun.lock
git commit -m "feat(latex): modul hunks — diff terstruktur + terapkan subset hunk"
```

---

### Task 2: `SectionProposalService` — hunks di getPending + accept parsial

**Files:**
- Modify: `packages/services/src/latex/section-proposal.service.ts`
- Test: `packages/services/test/section-proposal.test.ts`

**Interfaces:**
- Consumes (Task 1): `computeProposalHunks`, `applyHunkSelection`, `ProposalHunk` dari `./hunks`.
- Produces (dipakai Task 3 & 4):
  - `PendingProposalView` + field `hunks: ProposalHunk[]`.
  - `accept(db, { ownerUserId, proposalId, acceptedHunkIndexes?: number[], enforceRateLimit?: boolean })`.
  - `AcceptProposalResult` + varian `{ status: "compile_error"; compileErrors: CompileError[] }`.
  - appError baru: 422 `invalid_hunk_selection`.

- [ ] **Step 1: Tulis service test yang gagal**

Di `packages/services/test/section-proposal.test.ts`:

Tambah import (gabung ke import `bun:test` existing dan tambah dua baris):

```ts
import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { type LatexCompileResult, LatexCompileService } from "../src/latex/compile.service";
import { computeProposalHunks } from "../src/latex/hunks";
```

Tambahkan konstanta dekat `SEC` existing:

```ts
const SEC2 = `itpr_${SUFFIX}:sec2`;
```

Tambahkan describe baru di akhir file (compile di-stub — file ini tetap tanpa toolchain):

```ts
describe("SectionProposalService accept per-hunk", () => {
  const BASE = [
    "\\section{Pendahuluan}",
    "Kalimat pembuka lama.",
    "Baris tiga.",
    "Baris empat.",
    "Baris lima.",
    "Baris enam.",
    "Baris tujuh.",
    "Baris delapan.",
    "Baris sembilan.",
    "Baris sepuluh.",
    "Penutup lama.",
    "Baris akhir.",
  ].join("\n");
  const PROPOSED = BASE.replace("Kalimat pembuka lama.", "Kalimat pembuka baru.").replace(
    "Penutup lama.",
    "Penutup baru.",
  );
  const COMPILE_OK = { ok: true } as unknown as LatexCompileResult;

  function insertPending(baseVersion: number, proposedSource: string) {
    const id = crypto.randomUUID();
    return SectionEditProposalRepo.insert(db, {
      id, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC2, threadId: null,
      baseVersion, proposedSource, summary: "per-hunk", annotationIds: [],
      status: "pending", createdAt: NOW, decidedAt: null,
    }).then(() => id);
  }

  itest("getPending membawa hunks; accept subset menerapkan hanya hunk terpilih (dry-run compile)", async () => {
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC2, workspaceId: WS, title: "Bab 2", sortOrder: 1, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER, sectionId: SEC2, source: BASE, author: "user",
    });
    if (saved.status !== "saved") throw new Error("seed gagal");

    const pid = await insertPending(1, PROPOSED);
    const pending = await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC2 });
    expect(pending?.id).toBe(pid);
    expect(pending?.hunks.length).toBe(2);
    expect(pending?.hunks.map((h) => h.index)).toEqual([0, 1]);

    const compileSpy = spyOn(LatexCompileService, "compile").mockResolvedValue(COMPILE_OK);
    try {
      const res = await SectionProposalService.accept(db, {
        ownerUserId: OWNER, proposalId: pid, acceptedHunkIndexes: [0], enforceRateLimit: false,
      });
      expect(res).toMatchObject({ status: "accepted", contentVersion: 2 });
      expect(compileSpy).toHaveBeenCalledTimes(1);
    } finally {
      compileSpy.mockRestore();
    }
    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC2 });
    expect(doc?.source).toBe(BASE.replace("Kalimat pembuka lama.", "Kalimat pembuka baru."));
    const rev = await client`select author from document_revisions
      where owner_user_id = ${OWNER} and section_id = ${SEC2} order by version desc limit 1`;
    expect(rev[0]?.author).toBe("agent");
  });

  itest("fast-path semua hunk terpilih → tanpa compile ulang", async () => {
    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC2 });
    const next = `${doc!.source}\nBaris tambahan.`;
    const hunks = computeProposalHunks(doc!.source, next);
    const pid = await insertPending(doc!.contentVersion, next);

    const compileSpy = spyOn(LatexCompileService, "compile").mockResolvedValue(COMPILE_OK);
    try {
      const res = await SectionProposalService.accept(db, {
        ownerUserId: OWNER, proposalId: pid,
        acceptedHunkIndexes: hunks.map((h) => h.index), enforceRateLimit: false,
      });
      expect(res).toMatchObject({ status: "accepted" });
      expect(compileSpy).not.toHaveBeenCalled();
    } finally {
      compileSpy.mockRestore();
    }
  });

  itest("subset gagal compile → compile_error, proposal tetap pending, dokumen utuh", async () => {
    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC2 });
    const next = doc!.source
      .replace("Baris tiga.", "Baris tiga diubah.")
      .replace("Baris akhir.", "Baris akhir diubah.");
    const pid = await insertPending(doc!.contentVersion, next);

    const compileSpy = spyOn(LatexCompileService, "compile").mockResolvedValue({
      ok: false,
      errors: [{ line: 3, message: "Undefined control sequence", severity: "error" }],
      log: "",
    } as unknown as LatexCompileResult);
    try {
      const res = await SectionProposalService.accept(db, {
        ownerUserId: OWNER, proposalId: pid, acceptedHunkIndexes: [0], enforceRateLimit: false,
      });
      expect(res).toMatchObject({
        status: "compile_error",
        compileErrors: [{ message: "Undefined control sequence" }],
      });
    } finally {
      compileSpy.mockRestore();
    }
    const row = await SectionEditProposalRepo.findById(db, OWNER, pid);
    expect(row?.status).toBe("pending");
    const after = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC2 });
    expect(after?.source).toBe(doc!.source);

    // Pilihan hunk invalid → 422 (proposal yang sama masih pending).
    let thrown: unknown;
    try {
      await SectionProposalService.accept(db, {
        ownerUserId: OWNER, proposalId: pid, acceptedHunkIndexes: [99], enforceRateLimit: false,
      });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string })?.code).toBe("invalid_hunk_selection");
    let thrownEmpty: unknown;
    try {
      await SectionProposalService.accept(db, {
        ownerUserId: OWNER, proposalId: pid, acceptedHunkIndexes: [], enforceRateLimit: false,
      });
    } catch (error) {
      thrownEmpty = error;
    }
    expect((thrownEmpty as { code?: string })?.code).toBe("invalid_hunk_selection");

    // Versi bergeser sejak proposal dibuat → stale + superseded, tanpa menyentuh compile.
    const bumped = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER, sectionId: SEC2, source: `${doc!.source}\nUser menimpa.`,
      baseVersion: doc!.contentVersion, author: "user",
    });
    if (bumped.status !== "saved") throw new Error("bump gagal");
    const staleRes = await SectionProposalService.accept(db, {
      ownerUserId: OWNER, proposalId: pid, acceptedHunkIndexes: [0], enforceRateLimit: false,
    });
    expect(staleRes).toMatchObject({ status: "stale", currentVersion: bumped.contentVersion });
    const rowStale = await SectionEditProposalRepo.findById(db, OWNER, pid);
    expect(rowStale?.status).toBe("superseded");
  });
});
```

Catatan: `DATABASE_URL` wajib untuk `itest` (dev DB lokal, paritas test existing).

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/services && DATABASE_URL=<dev-url> bun test test/section-proposal.test.ts`
Expected: FAIL — `hunks` bukan properti `PendingProposalView` / `acceptedHunkIndexes` bukan parameter (TS) atau assertion `hunks.length` gagal.

- [ ] **Step 3: Implementasi di `section-proposal.service.ts`**

Import baru (tambahkan ke blok import existing):

```ts
import { applyHunkSelection, computeProposalHunks, type ProposalHunk } from "./hunks";
```

Ubah tipe:

```ts
export type AcceptProposalResult =
  | { status: "accepted"; contentVersion: number }
  | { status: "stale"; currentVersion: number }
  | { status: "compile_error"; compileErrors: CompileError[] };
```

Di `PendingProposalView`, tambah field:

```ts
  hunks: ProposalHunk[];
```

Ekstrak helper rate-limit (letakkan setelah `applyProposalEdits`, sebelum `assertPendingProposal`) dan pakai di `propose` menggantikan blok try/catch inline (perilaku identik):

```ts
/** Satu bucket dengan compile user; store error → fail-open (paritas rateLimitMacro API). */
async function consumeCompileQuota(ownerUserId: string): Promise<void> {
  try {
    await getRateLimiter("latex:compile").consume(ownerUserId);
  } catch (rejected) {
    if (rejected instanceof Error) {
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
```

Di `propose`, ganti blok `if (input.enforceRateLimit !== false) { try { ... } catch { ... } }` menjadi:

```ts
    if (input.enforceRateLimit !== false) {
      await consumeCompileQuota(input.ownerUserId);
    }
```

Ganti `accept` menjadi (docstring diperbarui):

```ts
  /**
   * Terima proposal, utuh atau per-hunk. Utuh (tanpa acceptedHunkIndexes) memakai
   * proposedSource yang sudah lolos dry-run saat propose — tanpa compile ulang. Subset hunk
   * menghasilkan sumber baru → wajib dry-run compile dulu; gagal → union compile_error dan
   * proposal tetap pending. Basis hunk = sumber terkini, sah hanya bila versi belum bergeser
   * (guard di awal); CAS saveDocument tetap lapisan pengaman kedua. Urutan save→transisi:
   * gagal di antaranya menyisakan pending yang aman (accept ulang → stale).
   */
  async accept(
    db: Db,
    input: {
      ownerUserId: string;
      proposalId: string;
      acceptedHunkIndexes?: number[];
      enforceRateLimit?: boolean;
    },
  ): Promise<AcceptProposalResult> {
    const proposal = await assertPendingProposal(db, input.ownerUserId, input.proposalId);

    let source = proposal.proposedSource;
    if (input.acceptedHunkIndexes) {
      const doc = await SectionLatexService.getDocument(db, {
        ownerUserId: input.ownerUserId,
        sectionId: proposal.sectionId,
      });
      const currentVersion = doc?.contentVersion ?? 0;
      if (currentVersion !== proposal.baseVersion) {
        await SectionEditProposalRepo.updateById(db, proposal.id, {
          status: "superseded",
          decidedAt: Date.now(),
        });
        return { status: "stale", currentVersion };
      }
      const baseSource = doc?.source ?? "";
      const hunks = computeProposalHunks(baseSource, proposal.proposedSource);
      const selected = new Set(input.acceptedHunkIndexes);
      const invalid =
        selected.size === 0 ||
        [...selected].some((i) => !Number.isInteger(i) || i < 0 || i >= hunks.length);
      if (invalid) {
        throwAppError({
          message: "Pilihan hunk tidak valid",
          code: "invalid_hunk_selection",
          severity: "warning",
          status: 422,
        });
      }
      if (selected.size < hunks.length) {
        source = applyHunkSelection(baseSource, hunks, selected);
        if (Buffer.byteLength(source, "utf8") > LATEX_SOURCE_MAX_BYTES) {
          throwAppError({
            message: "Sumber hasil pilihan terlalu besar. Maksimum 2 MB.",
            code: "latex_source_too_large",
            severity: "warning",
            status: 413,
          });
        }
        if (input.enforceRateLimit !== false) {
          await consumeCompileQuota(input.ownerUserId);
        }
        // Sumber parsial belum pernah compile — dry-run dulu, build resmi tak tersentuh.
        const { section, project, bib } = await loadSectionCompileContext(db, {
          ownerUserId: input.ownerUserId,
          sectionId: proposal.sectionId,
        });
        const assembled = assembleSection(project, {
          id: section.id,
          title: section.title,
          sortOrder: section.sortOrder,
          role: section.role,
          source,
        });
        const compiled = await LatexCompileService.compile({
          mainTex: assembled.mainTex,
          extraFiles: assembled.extraFiles,
          bib,
        });
        if (!compiled.ok) {
          return { status: "compile_error", compileErrors: compiled.errors };
        }
      }
    }

    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: proposal.sectionId,
      source,
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
    await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, proposal.annotationIds, {
      status: "resolved",
      updatedAt: now,
    });
    return { status: "accepted", contentVersion: saved.contentVersion };
  },
```

Di `getPending`, sebelum `return`, hitung hunks dan sertakan (basis display = sumber terkini; saat stale tetap dihitung — display-only, accept per-hunk ditolak guard versi):

```ts
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
      hunks: computeProposalHunks(doc?.source ?? "", row.proposedSource),
    };
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd packages/services && DATABASE_URL=<dev-url> bun test test/section-proposal.test.ts`
Expected: PASS semua (test lama + 3 itest baru).

Run: `cd packages/services && bun run typecheck`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/latex/section-proposal.service.ts packages/services/test/section-proposal.test.ts
git commit -m "feat(latex): accept proposal per-hunk — guard versi, dry-run compile subset, union compile_error"
```

---

### Task 3: Route API accept — body `acceptedHunkIndexes`

**Files:**
- Modify: `apps/api/src/routes/workspaces.ts` (route `POST /sections/:id/proposals/:pid/accept`)
- Test: `apps/api/test/proposals.test.ts`

**Interfaces:**
- Consumes (Task 2): `SectionProposalService.accept` dengan `acceptedHunkIndexes?: number[]` (`enforceRateLimit` TIDAK di-expose — default true).
- Produces (dipakai Task 4 via tipe `App` Eden): body opsional `{ acceptedHunkIndexes?: number[] }`; respons union termasuk `compile_error`.

- [ ] **Step 1: Tulis API test yang gagal**

Di `apps/api/test/proposals.test.ts`, perluas helper `req` agar menerima body, lalu tambah test:

```ts
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
```

Test baru di dalam `describe("proposals routes")`:

```ts
  itest("accept dengan acceptedHunkIndexes → body tervalidasi, id asing tetap 404", async () => {
    const res = await req(
      "POST",
      `/sections/x/proposals/nonexistent_${suffix}/accept`,
      `tok_${OWNER}`,
      { acceptedHunkIndexes: [0, 2] },
    );
    expect(res.status).toBe(404);
  });

  itest("accept dengan body salah bentuk → 422 validasi", async () => {
    const res = await req(
      "POST",
      `/sections/x/proposals/nonexistent_${suffix}/accept`,
      `tok_${OWNER}`,
      { acceptedHunkIndexes: ["bukan-angka"] },
    );
    expect(res.status).toBe(422);
  });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/api && DATABASE_URL=<dev-url> bun test test/proposals.test.ts`
Expected: test "body salah bentuk" FAIL (route belum memvalidasi body → 404, bukan 422). Test pertama mungkin sudah lulus — tak apa.

- [ ] **Step 3: Ubah route accept**

Di `apps/api/src/routes/workspaces.ts`, ganti route accept menjadi:

```ts
  .post(
    "/sections/:id/proposals/:pid/accept",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return SectionProposalService.accept(db, {
        ownerUserId,
        proposalId: params.pid,
        acceptedHunkIndexes: body?.acceptedHunkIndexes,
      });
    },
    {
      auth: true,
      body: t.Optional(
        t.Object({
          acceptedHunkIndexes: t.Optional(
            t.Array(t.Integer({ minimum: 0 }), { maxItems: 512 }),
          ),
        }),
      ),
    },
  )
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/api && DATABASE_URL=<dev-url> bun test test/proposals.test.ts`
Expected: PASS semua (termasuk test lama tanpa body — body `t.Optional` menerima request kosong).

Run: `cd apps/api && bun run typecheck` (atau `bunx tsc --noEmit` sesuai script)
Expected: 0 error baru.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/workspaces.ts apps/api/test/proposals.test.ts
git commit -m "feat(api): accept proposal menerima acceptedHunkIndexes"
```

---

### Task 4: FE `sections/api.ts` — tipe hunks + mutation accept

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/api.ts`

**Interfaces:**
- Consumes (Task 3): endpoint accept dengan body opsional.
- Produces (dipakai Task 5 & 6):
  - `export type ProposalHunk = { index: number; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }`
  - `PendingProposalView` + `hunks: ProposalHunk[]`
  - `AcceptProposalResult` + `{ status: 'compile_error'; compileErrors: LatexCompileError[] }`
  - `useAcceptProposal(...)` — `mutate({ proposalId, acceptedHunkIndexes? })`
  - `LatexCompileError` sudah ada di file ini (line ~78) — reuse.

- [ ] **Step 1: Ubah tipe dan mutation**

Sebelum `PendingProposalView`, tambah:

```ts
export type ProposalHunk = {
	index: number;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
};
```

Di `PendingProposalView`, tambah field:

```ts
	hunks: ProposalHunk[];
```

Ganti `AcceptProposalResult`:

```ts
export type AcceptProposalResult =
	| { status: 'accepted'; contentVersion: number }
	| { status: 'stale'; currentVersion: number }
	| { status: 'compile_error'; compileErrors: LatexCompileError[] };
```

Ganti `mutationFn` di `useAcceptProposal` (invalidation `onSuccess` tetap):

```ts
		mutationFn: async (input: { proposalId: string; acceptedHunkIndexes?: number[] }) =>
			unwrap(
				await api
					.sections({ id: sectionId() })
					.proposals({ pid: input.proposalId })
					.accept.post(
						input.acceptedHunkIndexes
							? { acceptedHunkIndexes: input.acceptedHunkIndexes }
							: undefined
					)
			) as AcceptProposalResult,
```

- [ ] **Step 2: Verifikasi typecheck svelte**

Run: `cd apps/svelte && bun run check`
Expected: error bertambah HANYA di `SectionEditorPage.svelte` (pemanggil `mutate` belum diubah — diperbaiki Task 6; kalau mau atomik, kerjakan Task 4–6 lalu check sekali). Baseline lain tetap 2 error `DetailPanel:158-159`.

- [ ] **Step 3: Commit** (boleh digabung dengan Task 5–6 bila check dilakukan sekali di akhir; kalau commit di sini, catat check menyusul)

```bash
git add apps/svelte/src/lib/features/sections/api.ts
git commit -m "feat(svelte): tipe hunks proposal + mutation accept per-hunk"
```

---

### Task 5: `ProposalReviewCard.svelte` — UI per-hunk

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/components/ProposalReviewCard.svelte` (tulis ulang)
- Modify: `apps/svelte/package.json` (hapus dependency `diff` — pemakai satu-satunya adalah kartu ini)

**Interfaces:**
- Consumes (Task 4): `PendingProposalView` (dengan `hunks`), `ProposalHunk`, `LatexCompileError` dari `../api`; `Checkbox` dari `@aqsha/ui-svelte/components/checkbox` (props bits-ui: `checked`/`indeterminate` bindable, `disabled`, mendukung function bindings Svelte 5).
- Produces (dipakai Task 6): props baru —
  `onAccept: (acceptedHunkIndexes: number[] | undefined) => void` (undefined = terima utuh/fast-path), `acceptErrors: LatexCompileError[] | null`.

- [ ] **Step 1: Tulis ulang kartu**

Isi penuh `ProposalReviewCard.svelte`:

```svelte
<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Icon, SparklesIcon, AlertCircleIcon } from '$lib/icons';
	import type { LatexCompileError, PendingProposalView, ProposalHunk } from '../api';

	/**
	 * Kartu tinjau usulan suntingan Astra: diff per hunk dengan checkbox terima/tolak per
	 * segmen. Default semua tercentang — satu klik Terima ≡ terima utuh. Usulan basi (sumber
	 * berubah sejak dibuat) → checkbox nonaktif, hanya Tolak (accept CAS menolak menimpa).
	 */
	let {
		proposal,
		accepting,
		acceptErrors,
		onAccept,
		onReject
	}: {
		proposal: NonNullable<PendingProposalView>;
		accepting: boolean;
		acceptErrors: LatexCompileError[] | null;
		onAccept: (acceptedHunkIndexes: number[] | undefined) => void;
		onReject: () => void;
	} = $props();

	// Indeks hunk yang TIDAK dicentang — kosong = terima utuh (fast-path tanpa compile ulang).
	const deselected = new SvelteSet<number>();
	$effect(() => {
		void proposal.id;
		deselected.clear();
	});

	const total = $derived(proposal.hunks.length);
	const selectedCount = $derived(total - deselected.size);

	type DiffLine = { type: 'add' | 'del' | 'ctx'; text: string };
	// Marker "\ No newline at end of file" bukan baris konten — dilewati.
	function hunkLines(hunk: ProposalHunk): DiffLine[] {
		const out: DiffLine[] = [];
		for (const raw of hunk.lines) {
			if (raw.startsWith('\\')) continue;
			const type = raw.startsWith('+') ? 'add' : raw.startsWith('-') ? 'del' : 'ctx';
			out.push({ type, text: raw.slice(1) });
		}
		return out;
	}

	function toggleHunk(index: number, checked: boolean): void {
		if (checked) deselected.delete(index);
		else deselected.add(index);
	}

	function toggleAll(checked: boolean): void {
		if (checked) deselected.clear();
		else for (const hunk of proposal.hunks) deselected.add(hunk.index);
	}

	function handleAccept(): void {
		onAccept(
			deselected.size === 0
				? undefined
				: proposal.hunks.filter((h) => !deselected.has(h.index)).map((h) => h.index)
		);
	}
</script>

<div class="flex flex-col gap-3 rounded-lg border-2 border-border bg-card p-4">
	<div class="flex items-start gap-2">
		<Icon icon={SparklesIcon} class="mt-0.5 size-4 text-primary" />
		<div class="min-w-0 flex-1">
			<h2 class="font-heading text-base font-bold">Usulan suntingan Astra</h2>
			<p class="text-label text-muted-foreground">{proposal.summary}</p>
		</div>
		{#if total > 1 && !proposal.isStale}
			<label class="flex shrink-0 select-none items-center gap-2 text-label text-muted-foreground">
				<Checkbox
					bind:checked={() => deselected.size === 0, toggleAll}
					bind:indeterminate={() => deselected.size > 0 && deselected.size < total, () => {}}
					disabled={accepting}
				/>
				Pilih semua
			</label>
		{/if}
	</div>

	{#if proposal.isStale}
		<div
			class="flex items-center gap-2 rounded-md border-2 border-border bg-muted/40 px-3 py-2 text-label text-muted-foreground"
		>
			<Icon icon={AlertCircleIcon} class="size-4 shrink-0" />
			Sumber berubah sejak usulan dibuat. Tolak lalu minta Astra menyusun ulang.
		</div>
	{/if}

	<div class="flex max-h-96 flex-col gap-2 overflow-y-auto">
		{#each proposal.hunks as hunk (hunk.index)}
			<div
				class="rounded-md border-2 border-border bg-background {deselected.has(hunk.index)
					? 'opacity-50'
					: ''}"
			>
				<label
					class="flex select-none items-center gap-2 border-b-2 border-border px-2 py-1.5 text-label text-muted-foreground"
				>
					<Checkbox
						bind:checked={() => !deselected.has(hunk.index), (v) => toggleHunk(hunk.index, v)}
						disabled={proposal.isStale || accepting}
					/>
					Baris {hunk.oldStart}–{hunk.oldStart + Math.max(hunk.oldLines, 1) - 1}
					{#if deselected.has(hunk.index)}
						<span class="ml-auto">tidak diterapkan</span>
					{/if}
				</label>
				<div class="overflow-x-auto">
					<div class="min-w-max font-mono text-label leading-relaxed">
						{#each hunkLines(hunk) as line, i (i)}
							<div
								class="flex whitespace-pre px-2 {line.type === 'add'
									? 'bg-mint/20'
									: line.type === 'del'
										? 'bg-coral/20'
										: ''}"
							>
								<span class="mr-2 select-none text-muted-foreground"
									>{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</span
								><span>{line.text}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if acceptErrors && acceptErrors.length > 0}
		<div class="flex flex-col gap-1 rounded-md border-2 border-destructive/40 bg-destructive/5 px-3 py-2">
			<div class="flex items-center gap-2 text-label font-medium text-destructive">
				<Icon icon={AlertCircleIcon} class="size-4 shrink-0" />
				Hasil pilihan hunk gagal compile — ubah pilihan atau tolak.
			</div>
			{#each acceptErrors.slice(0, 10) as err, i (i)}
				<p class="text-label text-muted-foreground">
					{err.line != null ? `baris ${err.line}: ` : ''}{err.message}
				</p>
			{/each}
		</div>
	{/if}

	<div class="flex justify-end gap-2">
		<Button type="button" variant="outline" onclick={onReject}>Tolak</Button>
		<Button
			type="button"
			disabled={proposal.isStale || accepting || (total > 0 && selectedCount === 0)}
			onclick={handleAccept}
		>
			{#if accepting}
				<Spinner class="size-4" />
			{/if}
			{total > 1 ? `Terima (${selectedCount}/${total})` : 'Terima'}
		</Button>
	</div>
</div>
```

Catatan: `total === 0` (usulan identik sumber — degenerate) → tombol tetap aktif, kirim `undefined` (jalur utuh existing).

- [ ] **Step 2: Hapus dependency `diff` dari apps/svelte**

Hapus baris `"diff": "^9.0.0",` dari `apps/svelte/package.json` (verifikasi dulu tak ada pemakai lain: `grep -rn "from 'diff'" apps/svelte/src` → hanya kartu ini sebelum rewrite).

Run: `bun install`
Expected: sukses. (`diff` tetap ter-install di root untuk `packages/services`.)

- [ ] **Step 3: Commit** (check menyusul setelah Task 6 karena `SectionEditorPage` belum meneruskan props baru)

```bash
git add apps/svelte/src/lib/features/sections/components/ProposalReviewCard.svelte apps/svelte/package.json bun.lock
git commit -m "feat(svelte): kartu proposal per-hunk — checkbox per segmen + pilih semua + error compile inline"
```

---

### Task 6: `SectionEditorPage.svelte` — wiring accept per-hunk

**Files:**
- Modify: `apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte`

**Interfaces:**
- Consumes (Task 4 & 5): `useAcceptProposal` (`mutate({ proposalId, acceptedHunkIndexes? })`), props kartu `onAccept(indexes | undefined)` + `acceptErrors`, tipe `LatexCompileError` dari `../api`.

- [ ] **Step 1: Ubah handler dan wiring**

Tambah `LatexCompileError` ke import tipe dari `'../api'` (blok import existing di file). Tambah state dekat deklarasi mutation:

```ts
	let proposalAcceptErrors = $state<LatexCompileError[] | null>(null);
```

Ganti `handleAcceptProposal`:

```ts
	function handleAcceptProposal(acceptedHunkIndexes: number[] | undefined): void {
		const p = proposal.data;
		if (!p) return;
		proposalAcceptErrors = null;
		acceptProposal.mutate(
			{ proposalId: p.id, acceptedHunkIndexes },
			{
				onSuccess: (res) => {
					if (res.status === 'accepted') {
						toast.success('Suntingan diterapkan. Menyusun ulang PDF…');
						requestCompile();
					} else if (res.status === 'compile_error') {
						proposalAcceptErrors = res.compileErrors;
						toast.warning('Hasil pilihan hunk gagal compile. Ubah pilihan atau tolak.');
					} else {
						toast.warning('Sumber sudah berubah — usulan dibatalkan. Minta Astra menyusun ulang.');
					}
				},
				onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menerapkan usulan.'))
			}
		);
	}
```

Di `handleRejectProposal`, tambah reset di awal fungsi:

```ts
		proposalAcceptErrors = null;
```

Di `handleAgentSettled`, tambah baris yang sama (`proposalAcceptErrors = null;`) — proposal baru dari agen tak boleh mewarisi error accept lama.

Ganti pemakaian kartu (di dalam `{#if proposal.data}` existing):

```svelte
<ProposalReviewCard
	proposal={proposal.data}
	accepting={acceptProposal.isPending}
	acceptErrors={proposalAcceptErrors}
	onAccept={handleAcceptProposal}
	onReject={handleRejectProposal}
/>
```

- [ ] **Step 2: Typecheck svelte**

Run: `cd apps/svelte && bun run check`
Expected: kembali ke baseline — hanya 2 error `DetailPanel:158-159`.

- [ ] **Step 3: Commit**

```bash
git add apps/svelte/src/lib/features/sections/pages/SectionEditorPage.svelte
git commit -m "feat(svelte): wiring accept per-hunk + tampilan error compile hasil pilihan"
```

---

### Task 7: Verifikasi menyeluruh

**Files:** tidak ada perubahan kode baru (perbaikan bila verifikasi menemukan masalah).

- [ ] **Step 1: Build dist + typecheck monorepo**

```bash
bun run build:dist
bun run typecheck
```
Expected: build sukses; typecheck services/api 0 error; svelte hanya baseline `DetailPanel:158-159`.

- [ ] **Step 2: Test services + api**

```bash
cd packages/services && DATABASE_URL=<dev-url> bun test
cd ../../apps/api && DATABASE_URL=<dev-url> bun test
```
Expected: tidak ada fail BARU (baseline 8 fail services pre-existing = tectonic cold-bundle).

- [ ] **Step 3: Verifikasi live di browser (bila lingkungan memungkinkan)**

Restart dev (`bun dev`) setelah build:dist. Alur:
1. Buka halaman bab yang punya sumber, buat 2+ anotasi berjauhan, kirim ke Astra hingga muncul proposal dengan ≥2 hunk.
2. Kartu menampilkan hunk terpisah, semua tercentang, tombol "Terima (2/2)".
3. Uncheck satu hunk → "Terima (1/2)" → Terima → verifikasi hanya suntingan terpilih masuk sumber, PDF recompile jalan.
4. (Bila bisa direkayasa) subset yang merusak → kartu menampilkan error compile, proposal masih ada.
5. Uji stale: ubah sumber manual setelah proposal muncul → checkbox nonaktif, hanya Tolak.

Expected: alur 2–3 lulus; catat temuan lain.

- [ ] **Step 4: Commit perbaikan verifikasi (bila ada) + tandai fase**

```bash
git add -A && git commit -m "fix(svelte): temuan verifikasi per-hunk review"   # hanya bila ada perbaikan
```
