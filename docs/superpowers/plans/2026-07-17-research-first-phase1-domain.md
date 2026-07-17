# Research-First Repositioning — Fase 1: Domain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meletakkan fondasi domain "proyek karya tulis" — kolom kind/stage di workspaces, tabel kerangka bab, perpustakaan sitasi global per akun + link per proyek, dan scope proyek di chat threads — lengkap dengan services + API.

**Architecture:** Evolusi in-place schema existing (spec `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md`). Tanpa backfill/kompat data (app Svelte belum cutover). Layer: Drizzle schema+migration (`packages/db`) → repo → service (`packages/services`) → route Elysia tipis (`apps/api`).

**Tech Stack:** Bun 1.3.10, Drizzle ORM (postgres), Elysia + t-schema, bun:test.

## Global Constraints

- Selalu `bun` — jangan npm/pnpm/yarn. Migration via `bun run db:generate` + `bun run db:migrate` (dari root).
- Enum DB bahasa Inggris, nilai persis: kind `undergraduate_thesis | masters_thesis | dissertation | journal_article | proposal | paper | freeform`; stage `exploration | proposal | research | writing | revision | done`; section status `empty | draft | in_review | done`; section role `bibliography`.
- Label UI bahasa Indonesia adalah urusan frontend (Fase 2) — backend tidak menyimpan label.
- Error: `throwAppError` dari `@aqsha/db` dengan `code` snake_case + `status`; ikuti pola `workspace.service.ts`.
- Komentar kode: jelaskan *why*, tanpa referensi plan/fase/ticket (aturan `CLAUDE.md`).
- ID app-generated `crypto.randomUUID()`; timestamp epoch-ms `bigint({ mode: "number" })`.
- `packages/db` & `packages/services` build ke `dist/` — setelah semua task selesai jalankan `bun run build:dist` sebelum menjalankan api/agent dev.
- Test DB-integration ikut pola `packages/db/test/citations.test.ts`: skip tanpa `DATABASE_URL`, prefix isolasi unik, cleanup FK-child dulu.

**Deviasi sadar dari spec (keputusan plan, catat di PR):**
1. Kolom urutan section bernama `sort_order` (bukan `order` — reserved word SQL, konsisten dibaca).
2. `chat_threads.workspace_id` dibuat **nullable dulu**; di-NOT-NULL-kan lewat migration kecil di akhir Fase 2 setelah frontend Svelte mengirimkannya. Kalau NOT NULL sekarang, pembuatan thread dari app dev langsung pecah sebelum Fase 2 jalan — melanggar "tiap fase shippable".
3. `kind` proyek **immutable setelah create** (mengubah kind = mengubah makna template; buat proyek baru bila salah pilih).

---

### Task 1: Kolom proyek di `workspaces` (kind, stage, deadline, topic_note)

**Files:**
- Modify: `packages/db/src/schema/workspaces.ts`
- Create: `packages/db/migrations/00XX_*.sql` (via drizzle-kit)

**Interfaces:**
- Produces: `WORKSPACE_KINDS`, `WORKSPACE_STAGES` (readonly string arrays), `WorkspaceKind`, `WorkspaceStage` (types), kolom baru pada type `Workspace`. Dipakai Task 3, 4, 7.

- [ ] **Step 1: Update schema `workspaces.ts`**

Ganti isi `packages/db/src/schema/workspaces.ts` menjadi:

```ts
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

export const WORKSPACE_KINDS = [
  "undergraduate_thesis",
  "masters_thesis",
  "dissertation",
  "journal_article",
  "proposal",
  "paper",
  "freeform",
] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const WORKSPACE_STAGES = [
  "exploration",
  "proposal",
  "research",
  "writing",
  "revision",
  "done",
] as const;
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number];

/**
 * workspaces — proyek karya tulis (skripsi/tesis/disertasi/artikel jurnal/
 * proposal/makalah) milik satu owner. `kind='freeform'` = workspace polos tanpa
 * kerangka bab & stepper tahap.
 *
 * - `id` (PK) di-generate aplikasi (`crypto.randomUUID()` di repo) supaya seragam
 *   dengan id eksternal lain di V2 dan diketahui sebelum insert.
 * - `kind` immutable setelah create — ganti jenis = proyek baru.
 * - `name` boleh string kosong selama tahap exploration; `topic_note` jadi
 *   placeholder judul di UI.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji"),
    description: text("description"),
    kind: text("kind").notNull().default("freeform"),
    stage: text("stage").notNull().default("exploration"),
    deadline: bigint("deadline", { mode: "number" }),
    topicNote: text("topic_note"),
    status: text("status").notNull().default("active"),
    archivedAt: bigint("archived_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("workspaces_status_check", sql`${t.status} in ('active', 'archived')`),
    check(
      "workspaces_kind_check",
      sql`${t.kind} in ('undergraduate_thesis', 'masters_thesis', 'dissertation', 'journal_article', 'proposal', 'paper', 'freeform')`,
    ),
    check(
      "workspaces_stage_check",
      sql`${t.stage} in ('exploration', 'proposal', 'research', 'writing', 'revision', 'done')`,
    ),
    index("workspaces_by_owner_status_updated").on(t.ownerUserId, t.status, t.updatedAt),
    index("workspaces_by_owner_updated").on(t.ownerUserId, t.updatedAt),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
```

- [ ] **Step 2: Generate & inspeksi migration**

Run: `bun run db:generate`
Expected: file baru `packages/db/migrations/00XX_*.sql` berisi `ALTER TABLE "workspaces" ADD COLUMN "kind" ... ADD COLUMN "stage" ... "deadline" ... "topic_note"` + dua constraint CHECK. Baca file-nya; pastikan TIDAK ada DROP tak terduga.

- [ ] **Step 3: Migrate DB dev**

Run: `bun run db:migrate`
Expected: exit 0 tanpa error.

- [ ] **Step 4: Typecheck package db**

Run: `cd packages/db && bunx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/workspaces.ts packages/db/migrations
git commit -m "feat(db): add project kind/stage/deadline/topic_note to workspaces"
```

---

### Task 2: Tabel `workspace_sections` + repo + test integrasi

**Files:**
- Create: `packages/db/src/schema/workspaceSections.ts`
- Modify: `packages/db/src/schema/index.ts` (tambah `export * from "./workspaceSections";` urut alfabet)
- Create: `packages/db/src/repositories/workspaceSectionRepo.ts`
- Modify: `packages/db/src/repositories/index.ts` (ikuti pola export existing)
- Create: `packages/db/migrations/00XX_*.sql` (via drizzle-kit)
- Test: `packages/db/test/sections.test.ts`

**Interfaces:**
- Consumes: `workspaces` (Task 1), `artifacts` (existing).
- Produces: `workspaceSections` table, `SECTION_STATUSES`, `SectionStatus`, `WorkspaceSection`, `NewWorkspaceSection`, dan `WorkspaceSectionRepo` dengan signature: `insertMany(db, rows: NewWorkspaceSection[])`, `listByWorkspace(db, workspaceId): Promise<WorkspaceSection[]>` (urut `sortOrder` ASC), `findById(db, id)`, `update(db, id, patch: Partial<Pick<WorkspaceSection, "title" | "status" | "sortOrder" | "documentArtifactId" | "updatedAt">>)`, `deleteById(db, id)`, `reorder(db, workspaceId, orderedIds: string[], now: number)`.

- [ ] **Step 1: Tulis schema**

`packages/db/src/schema/workspaceSections.ts`:

```ts
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { workspaces } from "./workspaces";

export const SECTION_STATUSES = ["empty", "draft", "in_review", "done"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

/**
 * workspace_sections — kerangka bab sebuah proyek karya tulis. Template per kind
 * hanya menyemai judul awal; setelah itu baris sepenuhnya milik user
 * (rename/tambah/hapus/reorder).
 *
 * - `role='bibliography'` = section Daftar Pustaka; kontennya digenerate citeproc
 *   dari sitasi terpakai, bukan dokumen DOCX yang diedit.
 * - `document_artifact_id` lazy — baru dibuat saat bab pertama kali ditulis.
 */
export const workspaceSections = pgTable(
  "workspace_sections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull(),
    status: text("status").notNull().default("empty"),
    role: text("role"),
    documentArtifactId: text("document_artifact_id").references(() => artifacts.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "workspace_sections_status_check",
      sql`${t.status} in ('empty', 'draft', 'in_review', 'done')`,
    ),
    check("workspace_sections_role_check", sql`${t.role} is null or ${t.role} in ('bibliography')`),
    index("workspace_sections_by_workspace_order").on(t.workspaceId, t.sortOrder),
  ],
);

export type WorkspaceSection = typeof workspaceSections.$inferSelect;
export type NewWorkspaceSection = typeof workspaceSections.$inferInsert;
```

- [ ] **Step 2: Tulis repo**

`packages/db/src/repositories/workspaceSectionRepo.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import {
  type NewWorkspaceSection,
  type WorkspaceSection,
  workspaceSections,
} from "../schema/workspaceSections";
import type { DbOrTx } from "../types";

/** Repo workspace_sections — query Drizzle saja. */
export const WorkspaceSectionRepo = {
  async insertMany(db: DbOrTx, rows: NewWorkspaceSection[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(workspaceSections).values(rows);
  },

  async listByWorkspace(db: DbOrTx, workspaceId: string): Promise<WorkspaceSection[]> {
    return db
      .select()
      .from(workspaceSections)
      .where(eq(workspaceSections.workspaceId, workspaceId))
      .orderBy(asc(workspaceSections.sortOrder), asc(workspaceSections.id));
  },

  async findById(db: DbOrTx, id: string): Promise<WorkspaceSection | null> {
    const rows = await db
      .select()
      .from(workspaceSections)
      .where(eq(workspaceSections.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async update(
    db: DbOrTx,
    id: string,
    patch: Partial<
      Pick<WorkspaceSection, "title" | "status" | "sortOrder" | "documentArtifactId" | "updatedAt">
    >,
  ): Promise<void> {
    await db.update(workspaceSections).set(patch).where(eq(workspaceSections.id, id));
  },

  async deleteById(db: DbOrTx, id: string): Promise<void> {
    await db.delete(workspaceSections).where(eq(workspaceSections.id, id));
  },

  /** Tulis ulang sort_order sesuai posisi di `orderedIds` (0..n-1). Panggil dalam tx. */
  async reorder(db: DbOrTx, workspaceId: string, orderedIds: string[], now: number): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(workspaceSections)
        .set({ sortOrder: i, updatedAt: now })
        .where(eq(workspaceSections.id, orderedIds[i]!));
    }
  },
};
```

Catatan: filter `workspaceId` pada `reorder` dijaga di service (assert owner + assert id ⊆ sections workspace) — repo tetap polos.

- [ ] **Step 3: Export di index schema & repositories**

Tambahkan di `packages/db/src/schema/index.ts`: `export * from "./workspaceSections";` — dan di `packages/db/src/repositories/index.ts` ikuti pola export repo existing (lihat bagaimana `WorkspaceRepo` diekspor, samakan).

- [ ] **Step 4: Generate + migrate**

Run: `bun run db:generate && bun run db:migrate`
Expected: migration `CREATE TABLE "workspace_sections"` + 2 CHECK + index + 2 FK; migrate exit 0.

- [ ] **Step 5: Tulis test integrasi (failing dulu tidak relevan — tabel baru; test membuktikan invariant)**

`packages/db/test/sections.test.ts` — ikuti persis pola `packages/db/test/citations.test.ts` (skip tanpa `DATABASE_URL`, `SUFFIX` acak, cleanup):

```ts
/**
 * workspace_sections — DB integration (butuh Postgres via DATABASE_URL; tanpa env
 * → skip). Invariant: urutan list by sort_order, reorder menulis ulang 0..n-1,
 * cascade delete ikut workspace, CHECK status menolak nilai liar.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { WorkspaceSectionRepo } from "../src/repositories/workspaceSectionRepo";
import { users } from "../src/schema/users";
import { workspaces } from "../src/schema/workspaces";
import { workspaceSections } from "../src/schema/workspaceSections";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itsect_${SUFFIX}`;
const WS = `itsect_${SUFFIX}:ws`;
const NOW = 1_700_000_000_000;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

function sectionRow(id: string, sortOrder: number) {
  return {
    id: `${WS}:${id}`,
    workspaceId: WS,
    title: `Bab ${id}`,
    sortOrder,
    status: "empty",
    role: null,
    documentArtifactId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from workspace_sections where workspace_id like ${`itsect_${SUFFIX}%`}`;
  await client`delete from workspaces where owner_user_id like ${`itsect_${SUFFIX}%`}`;
  await client`delete from users where owner_user_id like ${`itsect_${SUFFIX}%`}`;
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  // Kolom NOT NULL users/workspaces: samakan dengan pola citations.test.ts existing
  // (salin bentuk insert users + workspaces dari file itu).
  await db.insert(users).values({
    ownerUserId: OWNER,
    email: `${OWNER}@test.local`,
    createdAt: NOW,
    updatedAt: NOW,
  } as typeof users.$inferInsert);
  await db.insert(workspaces).values({
    id: WS,
    ownerUserId: OWNER,
    name: "Proyek Uji",
    kind: "undergraduate_thesis",
    stage: "exploration",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  } as typeof workspaces.$inferInsert);
});

afterAll(async () => {
  await cleanup();
  await client.end();
});

describe("WorkspaceSectionRepo", () => {
  itest("insertMany + list terurut sort_order", async () => {
    await WorkspaceSectionRepo.insertMany(db, [sectionRow("b", 1), sectionRow("a", 0)]);
    const rows = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    expect(rows.map((r) => r.title)).toEqual(["Bab a", "Bab b"]);
  });

  itest("reorder menulis ulang 0..n-1", async () => {
    const before = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    const reversed = [...before].reverse().map((r) => r.id);
    await WorkspaceSectionRepo.reorder(db, WS, reversed, NOW + 1);
    const after = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    expect(after.map((r) => r.id)).toEqual(reversed);
    expect(after.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  itest("CHECK menolak status liar", async () => {
    await expect(
      db.insert(workspaceSections).values({ ...sectionRow("x", 9), status: "weird" }),
    ).rejects.toThrow();
  });

  itest("cascade delete ikut workspace", async () => {
    await client`delete from workspaces where id = ${WS}`;
    const rows = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    expect(rows).toHaveLength(0);
  });
});
```

Catatan: kalau insert `users` gagal karena kolom NOT NULL lain, buka `packages/db/test/citations.test.ts` dan salin bentuk insert users persisnya.

- [ ] **Step 6: Jalankan test**

Run: `cd packages/db && DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) bun test test/sections.test.ts && cd ../..`
Expected: PASS semua (4 test).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema packages/db/src/repositories packages/db/migrations packages/db/test/sections.test.ts
git commit -m "feat(db): add workspace_sections table, repo, and integration tests"
```

---

### Task 3: Template kerangka per kind (seed data + test murni)

**Files:**
- Create: `packages/services/src/workspaces/section-templates.ts`
- Modify: `packages/services/src/index.ts` (export baru, ikuti pola export existing)
- Test: `packages/services/test/section-templates.test.ts`

**Interfaces:**
- Consumes: `WorkspaceKind` dari `@aqsha/db` (Task 1).
- Produces: `SECTION_TEMPLATES: Record<WorkspaceKind, SectionTemplate[]>`, `type SectionTemplate = { title: string; role: "bibliography" | null }`. Dipakai Task 4.

- [ ] **Step 1: Tulis failing test**

`packages/services/test/section-templates.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { WORKSPACE_KINDS } from "@aqsha/db";
import { SECTION_TEMPLATES } from "../src/workspaces/section-templates";

describe("SECTION_TEMPLATES", () => {
  test("setiap kind punya entri template", () => {
    for (const kind of WORKSPACE_KINDS) {
      expect(SECTION_TEMPLATES[kind]).toBeDefined();
    }
  });

  test("freeform kosong; kind lain berisi dan diakhiri Daftar Pustaka", () => {
    expect(SECTION_TEMPLATES.freeform).toEqual([]);
    for (const kind of WORKSPACE_KINDS) {
      if (kind === "freeform") continue;
      const tpl = SECTION_TEMPLATES[kind];
      expect(tpl.length).toBeGreaterThan(0);
      const last = tpl[tpl.length - 1]!;
      expect(last.role).toBe("bibliography");
      // Hanya satu bibliography per template
      expect(tpl.filter((s) => s.role === "bibliography")).toHaveLength(1);
    }
  });

  test("judul template unik per kind", () => {
    for (const kind of WORKSPACE_KINDS) {
      const titles = SECTION_TEMPLATES[kind].map((s) => s.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});
```

- [ ] **Step 2: Run test, pastikan gagal**

Run: `cd packages/services && bun test test/section-templates.test.ts && cd ../..`
Expected: FAIL — module `../src/workspaces/section-templates` tidak ada.

- [ ] **Step 3: Implementasi**

`packages/services/src/workspaces/section-templates.ts`:

```ts
import type { WorkspaceKind } from "@aqsha/db";

export type SectionTemplate = { title: string; role: "bibliography" | null };

const BIBLIOGRAPHY: SectionTemplate = { title: "Daftar Pustaka", role: "bibliography" };

/**
 * Kerangka bab awal per jenis karya tulis. Hanya seed saat proyek dibuat —
 * setelah itu sections milik user penuh. Judul bahasa Indonesia karena menjadi
 * konten milik user (bukan enum sistem).
 */
export const SECTION_TEMPLATES: Record<WorkspaceKind, SectionTemplate[]> = {
  undergraduate_thesis: [
    { title: "Bab 1 — Pendahuluan", role: null },
    { title: "Bab 2 — Tinjauan Pustaka", role: null },
    { title: "Bab 3 — Metodologi Penelitian", role: null },
    { title: "Bab 4 — Hasil dan Pembahasan", role: null },
    { title: "Bab 5 — Penutup", role: null },
    BIBLIOGRAPHY,
  ],
  masters_thesis: [
    { title: "Bab 1 — Pendahuluan", role: null },
    { title: "Bab 2 — Kajian Pustaka", role: null },
    { title: "Bab 3 — Metodologi Penelitian", role: null },
    { title: "Bab 4 — Hasil dan Pembahasan", role: null },
    { title: "Bab 5 — Kesimpulan dan Saran", role: null },
    BIBLIOGRAPHY,
  ],
  dissertation: [
    { title: "Bab 1 — Pendahuluan", role: null },
    { title: "Bab 2 — Kajian Pustaka", role: null },
    { title: "Bab 3 — Kerangka Konseptual dan Hipotesis", role: null },
    { title: "Bab 4 — Metodologi Penelitian", role: null },
    { title: "Bab 5 — Hasil dan Pembahasan", role: null },
    { title: "Bab 6 — Kesimpulan dan Implikasi", role: null },
    BIBLIOGRAPHY,
  ],
  journal_article: [
    { title: "Pendahuluan", role: null },
    { title: "Metode", role: null },
    { title: "Hasil", role: null },
    { title: "Pembahasan", role: null },
    { title: "Kesimpulan", role: null },
    BIBLIOGRAPHY,
  ],
  proposal: [
    { title: "Pendahuluan", role: null },
    { title: "Tinjauan Pustaka", role: null },
    { title: "Metodologi Penelitian", role: null },
    { title: "Jadwal Penelitian", role: null },
    BIBLIOGRAPHY,
  ],
  paper: [
    { title: "Pendahuluan", role: null },
    { title: "Pembahasan", role: null },
    { title: "Penutup", role: null },
    BIBLIOGRAPHY,
  ],
  freeform: [],
};
```

- [ ] **Step 4: Run test, pastikan lulus**

Run: `cd packages/services && bun test test/section-templates.test.ts && cd ../..`
Expected: PASS (3 test).

- [ ] **Step 5: Export + commit**

Tambahkan export di `packages/services/src/index.ts` (samakan gaya existing), lalu:

```bash
git add packages/services/src/workspaces/section-templates.ts packages/services/src/index.ts packages/services/test/section-templates.test.ts
git commit -m "feat(services): add section templates per project kind"
```

---

### Task 4: WorkspaceService (create proyek + update stage/deadline/topic) & SectionService

**Files:**
- Modify: `packages/services/src/workspace.service.ts`
- Create: `packages/services/src/section.service.ts`
- Modify: `packages/services/src/index.ts` (export `SectionService`)
- Test: `packages/services/test/section-service.test.ts` (validasi murni)

**Interfaces:**
- Consumes: `WorkspaceSectionRepo`, `SECTION_TEMPLATES`, `WORKSPACE_KINDS`, `WORKSPACE_STAGES`, `SECTION_STATUSES`.
- Produces:
  - `WorkspaceService.create(db, input: { ownerUserId; ownerEmail?; name?: string; kind: WorkspaceKind; topicNote?: string | null; deadline?: number | null })` → `{ id: string }` — menyemai sections dari template dalam transaksi yang sama.
  - `WorkspaceService.update(...)` menerima tambahan `stage?: WorkspaceStage; deadline?: number | null; topicNote?: string | null; description?: string`.
  - `SectionService` dengan: `list(db, ownerUserId, workspaceId)`, `create(db, { ownerUserId, workspaceId, title })`, `rename(db, { ownerUserId, sectionId, title })`, `setStatus(db, { ownerUserId, sectionId, status: SectionStatus })`, `reorder(db, { ownerUserId, workspaceId, orderedIds: string[] })`, `remove(db, { ownerUserId, sectionId })`.

- [ ] **Step 1: Update `WorkspaceService.create`**

Di `packages/services/src/workspace.service.ts`, ganti method `create` dengan:

```ts
  /**
   * Buat proyek: capacity per plan + emoji deterministik + seed kerangka bab dari
   * template kind — satu transaksi (count + insert + seed → cegah race lewat cap).
   * `name` opsional selama exploration; UI memakai `topicNote` sebagai placeholder.
   */
  async create(
    db: Db,
    input: {
      ownerUserId: string;
      ownerEmail?: string | null;
      name?: string;
      kind: WorkspaceKind;
      topicNote?: string | null;
      deadline?: number | null;
    },
  ): Promise<{ id: string }> {
    const name =
      input.name !== undefined && input.name.trim() !== ""
        ? normalizeName(input.name, WORKSPACE_NAME_LABEL)
        : "";
    if (!WORKSPACE_KINDS.includes(input.kind)) {
      throwAppError({
        message: "Jenis karya tulis tidak dikenal",
        code: "workspace_kind_invalid",
        severity: "warning",
        status: 422,
      });
    }
    const plan = await resolveEffectivePlanKey(db, { ownerUserId: input.ownerUserId, email: input.ownerEmail });
    const limit = PLAN_CATALOG[plan].workspaceLimit;
    const now = Date.now();
    const id = crypto.randomUUID();

    await db.transaction(async (tx) => {
      if (limit !== UNLIMITED) {
        const activeCount = await WorkspaceRepo.countActiveByOwner(tx, input.ownerUserId, limit);
        if (activeCount >= limit) {
          throwAppError({
            message: "Workspace limit reached for current plan",
            code: "workspace_limit_reached",
            severity: "warning",
            status: 403,
          });
        }
      }
      await WorkspaceRepo.insert(tx, {
        id,
        ownerUserId: input.ownerUserId,
        name,
        emoji: workspaceEmojiForNewWorkspace({ ownerUserId: input.ownerUserId, name, now }),
        description: null,
        kind: input.kind,
        stage: "exploration",
        deadline: input.deadline ?? null,
        topicNote: input.topicNote?.trim() || null,
        status: "active",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await WorkspaceSectionRepo.insertMany(
        tx,
        SECTION_TEMPLATES[input.kind].map((tpl, i) => ({
          id: crypto.randomUUID(),
          workspaceId: id,
          title: tpl.title,
          sortOrder: i,
          status: "empty",
          role: tpl.role,
          documentArtifactId: null,
          createdAt: now,
          updatedAt: now,
        })),
      );
    });

    return { id };
  },
```

Import yang perlu ditambah: `WorkspaceSectionRepo`, `WORKSPACE_KINDS`, type `WorkspaceKind`, `WorkspaceStage` dari `@aqsha/db`; `SECTION_TEMPLATES` dari `./workspaces/section-templates`.

Perhatikan: `ensureDefaultWorkspaceForOwner` (cold-start) tetap insert langsung via repo — tambahkan field baru `kind: "freeform", stage: "exploration", deadline: null, topicNote: null` pada object insert-nya.

- [ ] **Step 2: Perluas `WorkspaceService.update`**

Ganti method `update` agar menerima `stage`, `deadline`, `topicNote`, `description` (kind TIDAK — immutable):

```ts
  async update(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      name?: string;
      emoji?: string;
      description?: string | null;
      stage?: WorkspaceStage;
      deadline?: number | null;
      topicNote?: string | null;
    },
  ): Promise<{ ok: true }> {
    const hasField =
      input.name !== undefined ||
      input.emoji !== undefined ||
      input.description !== undefined ||
      input.stage !== undefined ||
      input.deadline !== undefined ||
      input.topicNote !== undefined;
    if (!hasField) {
      throwAppError({
        message: "Minimal satu field wajib.",
        code: "bad_request",
        severity: "warning",
      });
    }
    if (input.stage !== undefined && !WORKSPACE_STAGES.includes(input.stage)) {
      throwAppError({
        message: "Tahap proyek tidak dikenal",
        code: "workspace_stage_invalid",
        severity: "warning",
        status: 422,
      });
    }
    await this.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    await WorkspaceRepo.update(db, input.workspaceId, {
      ...(input.name !== undefined ? { name: normalizeName(input.name, WORKSPACE_NAME_LABEL) } : {}),
      ...(input.emoji !== undefined ? { emoji: normalizeWorkspaceEmoji(input.emoji) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
      ...(input.topicNote !== undefined ? { topicNote: input.topicNote?.trim() || null } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
```

Import `WORKSPACE_STAGES` dari `@aqsha/db`. Cek call site `update` existing (`/usr/bin/grep -rn "WorkspaceService.update" apps packages`) — signature lama subset dari yang baru, harusnya tanpa breaking.

- [ ] **Step 3: Tulis `SectionService`**

`packages/services/src/section.service.ts`:

```ts
import {
  SECTION_STATUSES,
  type SectionStatus,
  throwAppError,
  type WorkspaceSection,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { WorkspaceService } from "./workspace.service";
import { normalizeName } from "./workspaces/normalize";

const SECTION_TITLE_LABEL = "Section title";

/** Kerangka bab proyek — CRUD + reorder + status. Dipakai route api (+ tool agent nanti). */
export const SectionService = {
  async list(db: DbOrTx, ownerUserId: string, workspaceId: string): Promise<WorkspaceSection[]> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
    return WorkspaceSectionRepo.listByWorkspace(db, workspaceId);
  },

  /** Tambah bab di akhir kerangka. */
  async create(
    db: Db,
    input: { ownerUserId: string; workspaceId: string; title: string },
  ): Promise<{ id: string }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    const title = normalizeName(input.title, SECTION_TITLE_LABEL);
    const now = Date.now();
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const existing = await WorkspaceSectionRepo.listByWorkspace(tx, input.workspaceId);
      await WorkspaceSectionRepo.insertMany(tx, [
        {
          id,
          workspaceId: input.workspaceId,
          title,
          sortOrder: existing.length,
          status: "empty",
          role: null,
          documentArtifactId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    });
    return { id };
  },

  async rename(
    db: DbOrTx,
    input: { ownerUserId: string; sectionId: string; title: string },
  ): Promise<{ ok: true }> {
    await this.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await WorkspaceSectionRepo.update(db, input.sectionId, {
      title: normalizeName(input.title, SECTION_TITLE_LABEL),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  async setStatus(
    db: DbOrTx,
    input: { ownerUserId: string; sectionId: string; status: SectionStatus },
  ): Promise<{ ok: true }> {
    if (!SECTION_STATUSES.includes(input.status)) {
      throwAppError({
        message: "Status bab tidak dikenal",
        code: "section_status_invalid",
        severity: "warning",
        status: 422,
      });
    }
    await this.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await WorkspaceSectionRepo.update(db, input.sectionId, {
      status: input.status,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  /** Reorder total: `orderedIds` wajib sama persis dengan himpunan section workspace. */
  async reorder(
    db: Db,
    input: { ownerUserId: string; workspaceId: string; orderedIds: string[] },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    await db.transaction(async (tx) => {
      const existing = await WorkspaceSectionRepo.listByWorkspace(tx, input.workspaceId);
      const existingIds = new Set(existing.map((s) => s.id));
      const sameSet =
        input.orderedIds.length === existing.length &&
        input.orderedIds.every((id) => existingIds.has(id)) &&
        new Set(input.orderedIds).size === input.orderedIds.length;
      if (!sameSet) {
        throwAppError({
          message: "Daftar urutan bab tidak cocok dengan kerangka saat ini",
          code: "section_reorder_mismatch",
          severity: "warning",
          status: 409,
        });
      }
      await WorkspaceSectionRepo.reorder(tx, input.workspaceId, input.orderedIds, Date.now());
    });
    return { ok: true };
  },

  async remove(db: DbOrTx, input: { ownerUserId: string; sectionId: string }): Promise<{ ok: true }> {
    await this.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await WorkspaceSectionRepo.deleteById(db, input.sectionId);
    return { ok: true };
  },

  /** Section → workspace → owner. Missing/not-owned → 404 `section_not_found`. */
  async assertSectionOwner(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
  ): Promise<WorkspaceSection> {
    const section = await WorkspaceSectionRepo.findById(db, sectionId);
    if (!section) {
      throwAppError({
        message: "Section not found",
        code: "section_not_found",
        severity: "error",
        status: 404,
      });
    }
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, section.workspaceId);
    return section;
  },
};
```

- [ ] **Step 4: Test validasi murni**

`packages/services/test/section-service.test.ts` (tanpa DB — hanya jalur validasi yang gagal sebelum menyentuh repo):

```ts
import { describe, expect, test } from "bun:test";
import { SectionService } from "../src/section.service";

const fakeDb = {} as never;

describe("SectionService validation", () => {
  test("setStatus menolak status liar sebelum menyentuh db", async () => {
    await expect(
      SectionService.setStatus(fakeDb, {
        ownerUserId: "u",
        sectionId: "s",
        status: "weird" as never,
      }),
    ).rejects.toMatchObject({ code: "section_status_invalid" });
  });
});
```

Catatan: bentuk error yang dilempar `throwAppError` — cek `packages/db/src/appError.ts`; kalau bukan object dengan `code` di level atas, sesuaikan `toMatchObject` dengan bentuk aslinya (mis. `error.payload.code`).

- [ ] **Step 5: Run test + typecheck**

Run: `cd packages/services && bun test test/section-service.test.ts test/section-templates.test.ts && bunx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: PASS; 0 type error.

- [ ] **Step 6: Export & commit**

Export `SectionService` di `packages/services/src/index.ts`, lalu:

```bash
git add packages/services/src packages/services/test/section-service.test.ts
git commit -m "feat(services): project create with section seeding, stage update, SectionService"
```

---

### Task 5: Perpustakaan global — rename `workspace_citations` → `citations` + tabel link (layer db)

Ini task refactor terbesar. Prinsip: ganti schema dulu, lalu biarkan `tsc` menuntun perbaikan call site.

**Files:**
- Rename: `packages/db/src/schema/workspaceCitations.ts` → `packages/db/src/schema/citations.ts`
- Create: `packages/db/src/schema/workspaceCitationLinks.ts`
- Modify: `packages/db/src/schema/index.ts`
- Rename: `packages/db/src/repositories/workspaceCitationRepo.ts` → `packages/db/src/repositories/citationRepo.ts`
- Create: `packages/db/src/repositories/workspaceCitationLinkRepo.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Create: `packages/db/migrations/0035_citations_global_library.sql` (manual, lihat Step 3)
- Modify: file journal drizzle `packages/db/migrations/meta/_journal.json` (via `bun run db:generate` — JANGAN edit manual; lihat Step 3)
- Test: modify `packages/db/test/citations.test.ts`

**Interfaces:**
- Produces:
  - Tabel `citations` (kolom = `workspace_citations` existing MINUS `workspace_id`), TS export `citations`, `Citation`, `NewCitation` (alias lama `WorkspaceCitation` DIHAPUS).
  - Tabel `workspace_citation_links`: `id` text PK, `workspaceId` NOT NULL FK→workspaces (cascade), `citationId` NOT NULL FK→citations (cascade), `sectionId` nullable FK→workspace_sections (set null), `createdAt` bigint; UNIQUE (`workspaceId`, `citationId`).
  - `CitationRepo` (rename dari `WorkspaceCitationRepo`): semua method yang sebelumnya menerima `workspaceId` menjadi owner-scoped saja — `listByWorkspace` → `listByOwner(db, filters)`, `countActive(db, ownerUserId)`, unique sync-id menjadi (`owner`, `provider`, `external_id`).
  - `WorkspaceCitationLinkRepo`: `insert(db, row)`, `deleteByWorkspaceAndCitation(db, workspaceId, citationId)`, `listCitationIdsByWorkspace(db, workspaceId)`, `listByWorkspace(db, workspaceId)` (rows), `listBySection(db, sectionId)`, `setSection(db, linkId, sectionId | null)`.

- [ ] **Step 1: Schema `citations.ts`**

Rename file `workspaceCitations.ts` → `citations.ts` (git mv). Di dalamnya: rename const `workspaceCitations` → `citations`, string tabel `"workspace_citations"` → `"citations"`, hapus kolom `workspaceId` + import `workspaces`, rename type `WorkspaceCitation`/`NewWorkspaceCitation` → `Citation`/`NewCitation`. Perbarui nama index/constraint di dalam file: prefix `workspace_citations_*` → `citations_*`, dan index unique sync-id yang sebelumnya `(owner_user_id, workspace_id, provider, external_id)` menjadi `(owner_user_id, provider, external_id)` (tetap partial `where external_id is not null` bila begitu aslinya — baca file sebelum edit). Update header comment: library global per akun; koleksi per proyek hidup di `workspace_citation_links`.

- [ ] **Step 2: Schema `workspaceCitationLinks.ts`**

```ts
import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { citations } from "./citations";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

/**
 * workspace_citation_links — koleksi sumber per proyek: proyek me-reference item
 * perpustakaan akun (bukan menyalin). `section_id` menandai sumber untuk bab
 * tertentu; null = level proyek.
 */
export const workspaceCitationLinks = pgTable(
  "workspace_citation_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    citationId: text("citation_id")
      .notNull()
      .references(() => citations.id, { onDelete: "cascade" }),
    sectionId: text("section_id").references(() => workspaceSections.id, {
      onDelete: "set null",
    }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("workspace_citation_links_ws_citation").on(t.workspaceId, t.citationId),
    index("workspace_citation_links_by_section").on(t.sectionId),
  ],
);

export type WorkspaceCitationLink = typeof workspaceCitationLinks.$inferSelect;
export type NewWorkspaceCitationLink = typeof workspaceCitationLinks.$inferInsert;
```

Update `schema/index.ts`: ganti `export * from "./workspaceCitations";` → `export * from "./citations";` + tambah `export * from "./workspaceCitationLinks";`.

- [ ] **Step 3: Migration**

Run: `bun run db:generate` lalu BACA hasilnya. drizzle-kit hampir pasti menghasilkan `DROP TABLE workspace_citations` + `CREATE TABLE citations` (dia tidak mendeteksi rename). Sesuai keputusan spec (tanpa migrasi data, svelte belum cutover), DROP+CREATE **diterima** — data dev citations hilang, tidak apa-apa. Pastikan file migration juga membuat `workspace_citation_links`. Jangan edit `meta/_journal.json` manual.

Run: `bun run db:migrate`
Expected: exit 0.

- [ ] **Step 4: Repo rename + link repo**

`git mv packages/db/src/repositories/workspaceCitationRepo.ts packages/db/src/repositories/citationRepo.ts`, lalu di dalam file: `WorkspaceCitationRepo` → `CitationRepo`, hapus semua parameter/filter `workspaceId` (owner-scoped murni), tipe `WorkspaceCitation*` → `Citation*`. Method `listByWorkspace` → `listByOwner` dengan filters sama minus workspace. `WorkspaceCitationListFilters` → `CitationListFilters`.

Buat `packages/db/src/repositories/workspaceCitationLinkRepo.ts`:

```ts
import { and, eq } from "drizzle-orm";
import {
  type NewWorkspaceCitationLink,
  type WorkspaceCitationLink,
  workspaceCitationLinks,
} from "../schema/workspaceCitationLinks";
import type { DbOrTx } from "../types";

/** Repo workspace_citation_links — query Drizzle saja. */
export const WorkspaceCitationLinkRepo = {
  async insert(db: DbOrTx, row: NewWorkspaceCitationLink): Promise<void> {
    await db.insert(workspaceCitationLinks).values(row).onConflictDoNothing();
  },

  async deleteByWorkspaceAndCitation(
    db: DbOrTx,
    workspaceId: string,
    citationId: string,
  ): Promise<void> {
    await db
      .delete(workspaceCitationLinks)
      .where(
        and(
          eq(workspaceCitationLinks.workspaceId, workspaceId),
          eq(workspaceCitationLinks.citationId, citationId),
        ),
      );
  },

  async listByWorkspace(db: DbOrTx, workspaceId: string): Promise<WorkspaceCitationLink[]> {
    return db
      .select()
      .from(workspaceCitationLinks)
      .where(eq(workspaceCitationLinks.workspaceId, workspaceId));
  },

  async listBySection(db: DbOrTx, sectionId: string): Promise<WorkspaceCitationLink[]> {
    return db
      .select()
      .from(workspaceCitationLinks)
      .where(eq(workspaceCitationLinks.sectionId, sectionId));
  },

  async setSection(db: DbOrTx, linkId: string, sectionId: string | null): Promise<void> {
    await db
      .update(workspaceCitationLinks)
      .set({ sectionId })
      .where(eq(workspaceCitationLinks.id, linkId));
  },
};
```

Update `repositories/index.ts` sesuai rename + repo baru.

- [ ] **Step 5: Perbaiki test db citations**

Di `packages/db/test/citations.test.ts`: import & nama mengikuti rename (`CitationRepo`, `NewCitation`, tabel `citations`), hapus `workspaceId` dari row builder & assertion scoping workspace (invariant scoping kini owner-only), cleanup SQL `delete from workspace_citations` → `delete from citations` + `delete from workspace_citation_links`. Assertion unique sync-id: duplikat (`owner`, `provider`, `external_id`) ditolak TANPA workspace berbeda menyelamatkan.

Run: `cd packages/db && DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) bun test && cd ../..`
Expected: PASS semua file test db.

- [ ] **Step 6: Typecheck db saja (services masih merah — itu Task 6)**

Run: `cd packages/db && bunx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: 0 error di `packages/db`. (`packages/services` boleh merah sampai Task 6.)

- [ ] **Step 7: Commit**

```bash
git add -A packages/db
git commit -m "feat(db): global citations library + workspace_citation_links"
```

---

### Task 6: Services perpustakaan — CitationService owner-scoped + CitationLinkService

**Files:**
- Modify: `packages/services/src/citations/citation.service.ts` (±83 referensi `workspaceId`)
- Modify: `packages/services/src/citations/citation-import.service.ts`, `citation-usages.ts`, dan file lain yang merah oleh `tsc`
- Create: `packages/services/src/citations/citation-link.service.ts`
- Modify: `packages/services/src/index.ts`
- Test: modify test citations existing di `packages/services/test/` (citations-import, citation-service, dll.) + create `packages/services/test/citation-link.test.ts` bila ada logic murni yang bisa diuji tanpa db

**Interfaces:**
- Consumes: `CitationRepo`, `WorkspaceCitationLinkRepo`, `SectionService.assertSectionOwner`, `WorkspaceService.assertWorkspaceOwner`.
- Produces:
  - `CitationService.*` — signature lama minus `workspaceId` (list/get/createManual/createByDoi/createFromArtifact/update/softDelete/merge/export/render semuanya owner-scoped). `getSettings`/`updateSettings` TETAP menerima `workspaceId` (gaya sitasi per proyek — tabel `workspace_citation_settings` tidak berubah).
  - `CitationLinkService`: `addToWorkspace(db, { ownerUserId, workspaceId, citationId, sectionId? })` → `{ ok: true }`; `removeFromWorkspace(db, { ownerUserId, workspaceId, citationId })`; `listForWorkspace(db, ownerUserId, workspaceId)` → `{ items: Array<Citation & { linkId: string; sectionId: string | null }> }`; `assignSection(db, { ownerUserId, linkId, sectionId: string | null })`.

- [ ] **Step 1: Refactor mekanis `citation.service.ts`**

Aturan transformasi, terapkan konsisten:
1. Semua parameter `workspaceId` pada method CRUD/list/render → hapus; assert kepemilikan cukup `ownerUserId` (sudah ada di setiap query repo).
2. Panggilan `WorkspaceService.assertWorkspaceOwner` yang tersisa di jalur CRUD → hapus (kepemilikan citation = owner). KECUALI `getSettings`/`updateSettings` — tetap per workspace.
3. `WorkspaceCitationRepo` → `CitationRepo`; `listByWorkspace` → `listByOwner`; tipe `WorkspaceCitation` → `Citation`.
4. `createFromArtifact`: artifact tetap workspace-scoped (assert artifact owner tidak berubah); hasil citation masuk perpustakaan owner. Jika pemanggil existing meneruskan `workspaceId` untuk scoping citation — jadikan pembuatan LINK via `CitationLinkService.addToWorkspace` di layer pemanggil (route/artifact service), BUKAN di CitationService.
5. Dedup/canonical-key & duplikat group: scope owner (sebelumnya owner+workspace).

Jalankan `cd packages/services && bunx tsc --noEmit -p tsconfig.json` berulang; nol-kan error file per file. `citation-usages.ts` (render dokumen) ikut disesuaikan — usages tabel `document_citation_usages` tidak berubah schema.

- [ ] **Step 2: Tulis `citation-link.service.ts`**

```ts
import {
  type Citation,
  CitationRepo,
  throwAppError,
  WorkspaceCitationLinkRepo,
} from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { SectionService } from "../section.service";
import { WorkspaceService } from "../workspace.service";

/** Koleksi sumber per proyek — link perpustakaan↔proyek(↔bab), bukan salinan. */
export const CitationLinkService = {
  async addToWorkspace(
    db: Db,
    input: { ownerUserId: string; workspaceId: string; citationId: string; sectionId?: string | null },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    const citation = await CitationRepo.findById(db, input.ownerUserId, input.citationId);
    if (!citation || citation.deletedAt) {
      throwAppError({
        message: "Citation not found",
        code: "citation_not_found",
        severity: "error",
        status: 404,
      });
    }
    if (input.sectionId) {
      const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
      if (section.workspaceId !== input.workspaceId) {
        throwAppError({
          message: "Section bukan bagian proyek ini",
          code: "section_workspace_mismatch",
          severity: "warning",
          status: 409,
        });
      }
    }
    await WorkspaceCitationLinkRepo.insert(db, {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      citationId: input.citationId,
      sectionId: input.sectionId ?? null,
      createdAt: Date.now(),
    });
    return { ok: true };
  },

  async removeFromWorkspace(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string; citationId: string },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    await WorkspaceCitationLinkRepo.deleteByWorkspaceAndCitation(
      db,
      input.workspaceId,
      input.citationId,
    );
    return { ok: true };
  },

  /** Item perpustakaan yang ter-link ke proyek, digabung metadata link (bab). */
  async listForWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ items: Array<Citation & { linkId: string; sectionId: string | null }> }> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
    const links = await WorkspaceCitationLinkRepo.listByWorkspace(db, workspaceId);
    if (links.length === 0) return { items: [] };
    const citations = await CitationRepo.findByIds(
      db,
      ownerUserId,
      links.map((l) => l.citationId),
    );
    const byId = new Map(citations.map((c) => [c.id, c]));
    const items = links.flatMap((l) => {
      const c = byId.get(l.citationId);
      return c && !c.deletedAt ? [{ ...c, linkId: l.id, sectionId: l.sectionId }] : [];
    });
    return { items };
  },

  async assignSection(
    db: DbOrTx,
    input: { ownerUserId: string; linkId: string; sectionId: string | null },
  ): Promise<{ ok: true }> {
    if (input.sectionId) {
      await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    }
    await WorkspaceCitationLinkRepo.setSection(db, input.linkId, input.sectionId);
    return { ok: true };
  },
};
```

Catatan: cek signature `CitationRepo.findById`/`findByIds` hasil rename Task 5 — sesuaikan urutan parameter dengan file nyata.

- [ ] **Step 3: Sesuaikan test services citations**

File test yang menyebut `workspaceId` pada CitationService (`citation-service.test.ts`, `citations-import.test.ts`, `citations-document-render.test.ts`) — hapus argumen tersebut mengikuti signature baru. Logika assert TIDAK berubah (dedup, verdict, render).

Run: `cd packages/services && bun test && cd ../..`
Expected: PASS semua.

- [ ] **Step 4: Typecheck services + export + commit**

Run: `cd packages/services && bunx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: 0 error.

```bash
git add -A packages/services
git commit -m "feat(services): owner-scoped citation library + CitationLinkService"
```

---

### Task 7: API routes — projects, sections, library links

**Files:**
- Modify: `apps/api/src/routes/workspaces.ts`
- Modify: `apps/api/src/routes/citations.ts`
- Test: `apps/api` test existing yang menyentuh workspaces/citations (cari: `ls apps/api/test` — sesuaikan yang merah)

**Interfaces:**
- Consumes: `WorkspaceService`, `SectionService`, `CitationService`, `CitationLinkService` (Task 4 & 6).
- Produces (dipakai Eden client svelte di Fase 2):
  - `POST /workspaces` body `{ name?, kind, topicNote?, deadline? }`
  - `PATCH /workspaces/:id` body `{ name?, emoji?, description?, stage?, deadline?, topicNote? }`
  - `GET /workspaces/:id/sections` → `WorkspaceSection[]`
  - `POST /workspaces/:id/sections` body `{ title }` → `{ id }`
  - `PATCH /sections/:id` body `{ title? , status? }` (min satu)
  - `POST /workspaces/:id/sections/reorder` body `{ orderedIds: string[] }`
  - `DELETE /sections/:id`
  - `GET /workspaces/:id/citations` → `{ items }` (linked, dengan `linkId`/`sectionId`)
  - `POST /workspaces/:id/citations/:citationId/link` body `{ sectionId? }`
  - `DELETE /workspaces/:id/citations/:citationId/link`
  - `PATCH /citation-links/:linkId` body `{ sectionId: string | null }`
  - Route citations existing menjadi library-level (tanpa workspaceId param/query).

- [ ] **Step 1: Extend `routes/workspaces.ts`**

Ubah `POST /` dan `PATCH /:id` sesuai body baru, dengan validasi enum via `t.UnionEnum` ATAU `t.Union([t.Literal(...)])` — ikuti util validasi yang sudah dipakai di routes lain (cek `routes/threads.ts` untuk pola literal union). Contoh POST:

```ts
  .post(
    "/",
    ({ ownerUserId, email, body }) => {
      const { db } = getDb();
      return WorkspaceService.create(db, {
        ownerUserId,
        ownerEmail: email,
        name: body.name,
        kind: body.kind as WorkspaceKind,
        topicNote: body.topicNote ?? null,
        deadline: body.deadline ?? null,
      });
    },
    {
      auth: true,
      rateLimit: "workspaces:create",
      body: t.Object({
        name: t.Optional(t.String()),
        kind: t.Union(WORKSPACE_KINDS.map((k) => t.Literal(k))),
        topicNote: t.Optional(t.String()),
        deadline: t.Optional(t.Numeric()),
      }),
    },
  )
```

Tambahkan route sections nested + `PATCH/DELETE /sections/:id` top-level (pola sama `folders.ts` yang top-level untuk `:id`). Semua handler tipis: auth → 1 service call.

- [ ] **Step 2: Rework `routes/citations.ts`**

Baca file dulu. Ubah semua endpoint yang menerima `workspaceId` menjadi library-level (tanpa param itu), KECUALI settings (tetap per workspace). Tambahkan tiga endpoint link (list/link/unlink) di `routes/workspaces.ts` atau file citations — pilih satu, konsisten dengan prefix yang ada; panggil `CitationLinkService`.

- [ ] **Step 3: Test + typecheck api**

Run: `cd apps/api && bun test && bunx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: PASS; perbaiki test existing yang masih mengirim `workspaceId` ke endpoint citations.

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat(api): project sections and citation library/link endpoints"
```

---

### Task 8: Scope proyek di chat threads

**Files:**
- Modify: `packages/db/src/schema/chatThreads.ts` (+ migration via generate)
- Modify: `packages/db/src/repositories/chatThreadRepo.ts`
- Modify: `apps/api/src/routes/threads.ts`
- Modify: proyeksi thread agent — cari dengan `/usr/bin/grep -rn "threadProjectionProcessor\|chat_threads" apps/agent/src --include='*.ts' -l` lalu sesuaikan file proyeksinya

**Interfaces:**
- Produces: kolom `chat_threads.workspace_id` (nullable, FK→workspaces set null, index `(workspace_id, last_activity_at)`); `ChatThreadRepo.listByWorkspace(db, { ownerUserId, workspaceId, ... })`; route `GET /threads?workspaceId=` filter; proyeksi Mastra meneruskan `workspaceId` dari metadata thread ke row.

- [ ] **Step 1: Schema + migration**

Di `chatThreads.ts` tambah:

```ts
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
```

(import `workspaces`; nullable dulu — di-NOT-NULL-kan akhir Fase 2 setelah frontend mengirim). Tambah index:

```ts
    index("chat_threads_by_workspace_activity").on(t.workspaceId, t.lastActivityAt),
```

Run: `bun run db:generate && bun run db:migrate` — inspeksi SQL: hanya ADD COLUMN + index.

- [ ] **Step 2: Repo + route**

`ChatThreadRepo`: method list existing dapat filter opsional `workspaceId` (ikuti bentuk filter existing di file). `routes/threads.ts`: query `workspaceId: t.Optional(t.String())` pada list; create/upsert path meneruskan `workspaceId` bila dikirim klien.

- [ ] **Step 3: Proyeksi agent**

Di file proyeksi (`threadProjectionProcessor`) apps/agent: saat upsert row `chat_threads`, baca `workspaceId` dari metadata thread Mastra (klien svelte akan menaruhnya di `thread.metadata.workspaceId` mulai Fase 2) dan tulis ke kolom. Bila metadata kosong → `null` (thread lama/dev). Konsultasikan pola metadata thread di Mastra docs MCP (`@mastra/mcp-docs-server`) terhadap versi `@mastra/core` terpasang sebelum edit — jangan mengarang API.

- [ ] **Step 4: Test + commit**

Run: `cd packages/db && DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) bun test && cd ../.. && cd apps/api && bun test && cd ../..`
Expected: PASS.

```bash
git add packages/db apps/api apps/agent
git commit -m "feat: project-scoped chat threads (nullable until svelte sends it)"
```

---

### Task 9: Gate akhir Fase 1

**Files:** tidak ada file baru — verifikasi lintas workspace.

- [ ] **Step 1: Build dist + typecheck + test semua**

Run (dari root):
```bash
bun run build:dist && bun run typecheck && bun run test
```
Expected: semua hijau. `apps/web` (Next.js) kemungkinan MERAH di typecheck karena rename citations — itu ekspektasi sadar (spec: breaking terhadap app lama diterima). Kalau `bun run typecheck` root gagal hanya karena `apps/web`, catat di PR dan lanjut; JANGAN memperbaiki `apps/web`.

- [ ] **Step 2: Smoke API dev**

Run: `bun run dev:api` (background) lalu:
```bash
curl -s localhost:PORT/health
```
(port lihat `apps/api/.env`). Expected: OK. Matikan lagi.

- [ ] **Step 3: Commit penutup (bila ada sisa) + catatan**

```bash
git add -A && git status
git commit -m "chore: phase 1 domain foundation green" # hanya bila ada perubahan tersisa
```

---

## Self-Review (sudah dijalankan penulis plan)

- **Spec coverage Fase 1**: kind/stage/deadline/topic_note (Task 1), workspace_sections + role bibliography (Task 2), template seed services (Task 3-4), rename citations + links (Task 5-6), API (Task 7), thread scope (Task 8). Settings gaya sitasi per proyek dipertahankan (Task 6). Feed berita & UI = Fase 2/3, bukan plan ini.
- **Placeholder**: tidak ada TBD; task refactor besar (5, 6) memakai aturan transformasi eksplisit + tsc-driven, dengan perintah verifikasi.
- **Konsistensi tipe**: `WorkspaceKind`/`WorkspaceStage`/`SectionStatus` didefinisikan Task 1-2, dikonsumsi Task 3-4-7; `CitationRepo`/`Citation` rename Task 5 dikonsumsi Task 6; `CitationLinkService` Task 6 dikonsumsi Task 7.
- **Deviasi tercatat** di Global Constraints (sort_order, thread nullable, kind immutable).
