# Research-First Repositioning — Fase 2: IA Svelte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah IA `apps/svelte` menjadi project-first: beranda = daftar proyek karya tulis, rumah proyek dengan kerangka bab + panel sumber/thread, chat Astra scoped ke proyek (RequestContext `aqsha-workspace-id`), sidebar baru, route lama dihapus tanpa redirect, ditutup migration `chat_threads.workspace_id` NOT NULL.

**Architecture:** Konsumsi murni backend Fase 1 via Eden Treaty (tidak ada endpoint baru). Pola existing dipertahankan: hooks per feature (`features/<x>/api.ts` + `queryKeys` + `unwrap`), runes + bits-ui + shadcn-svelte, design system v2 flat-card, `DetailSplitLayout` untuk halaman split, `ThreadAgent` durable untuk chat. Spec: `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md`; hasil Fase 1: `docs/superpowers/plans/2026-07-17-research-first-phase1-domain.md` (commit `9f502c0..e4f0369`).

**Tech Stack:** SvelteKit (runes-only), Svelte 5, TanStack svelte-query, Eden Treaty (`@aqsha/api/client`), `@mastra/client-js`, `@aqsha/ui-svelte`, Tailwind v4.

## Global Constraints

- Selalu `bun` — jangan npm/pnpm/yarn.
- **Working tree punya WIP uncommitted** (flat-card polish di `apps/svelte` + `packages/ui-svelte`). `git add` SELALU per-path eksplisit; JANGAN PERNAH `git add -A`/`git add .`/`git checkout --`/`git stash` menyapu. Review `git status` sebelum tiap commit.
- Enum DB bahasa Inggris (nilai persis Fase 1): kind `undergraduate_thesis | masters_thesis | dissertation | journal_article | proposal | paper | freeform`; stage `exploration | proposal | research | writing | revision | done`; section status `empty | draft | in_review | done`; section role `bibliography`.
- Label UI bahasa Indonesia sentence case (mapping frontend): kind → skripsi, tesis, disertasi, artikel jurnal, proposal, makalah, bebas; stage → eksplorasi, proposal, riset, penulisan, revisi, selesai; status bab → kosong, draf, direview, beres. Copy sentence case, tanpa all-caps.
- Sebelum menulis/mengedit file `.svelte`/`.svelte.ts`: invoke skill `svelte-code-writer` dan `svelte-core-bestpractices`. Ikuti pola runes existing (props via `$props()`, getter untuk input reaktif hooks, `$derived`/`$effect` disiplin).
- `apps/svelte` TIDAK boleh import `@aqsha/db`/`@aqsha/services` — tipe lokal struktural (pola `features/workspaces/types.ts`).
- Navigasi selalu `resolve()` dengan route id ber-group: `resolve('/app/(product)/projects/[projectId]', { projectId })`.
- Verifikasi per task: `cd apps/svelte && bun run check` (svelte-check) + verifikasi manual via dev server. Dev server: dari root `bun dev` (api + worker + agent + web) di satu terminal, lalu `cd apps/svelte && bun run dev` (Vite, default `http://localhost:5173`). Untuk verifikasi browser di halaman onboarding pakai skill `agent-browser` (gotcha: tab claude-in-chrome pernah macet di halaman itu).
- Grep verifikasi pakai `/usr/bin/grep` (shell `grep` di environment ini adalah shim rtk).
- Komentar kode: jelaskan *why*, tanpa referensi plan/fase/ticket (aturan `CLAUDE.md`).
- Ikon: pakai export `$lib/icons` existing; kalau nama ikon belum ada, cek dulu daftar export sebelum menambah.

**Deviasi sadar dari spec (keputusan plan, catat di PR):**
1. **"Proyek disematkan" di sidebar = daftar proyek aktif terurut `updatedAt` DESC.** Backend Fase 1 tidak punya kolom pin untuk workspaces (pin hanya ada di threads); mekanisme pin proyek eksplisit menyusul bila dibutuhkan.
2. **`/app/library` dibuat sebagai route placeholder** (judul + empty state "segera") supaya item sidebar Perpustakaan hidup; isi halaman = Fase 3.
3. **Chat tersemat di Explore (`ExploreChatSidePanel` / "Tanya Astra") DIHAPUS di fase ini.** Itu chat global — melanggar "chat scoped ke proyek" dan akan menghasilkan thread tanpa `workspace_id` yang gagal diproyeksikan setelah migration NOT NULL. Pencarian in-project + rework explore = Fase 3.
4. **`features/citations/api.ts` di-repoint ke endpoint library-level** (`/citations/*`) sekarang — wajib, karena endpoint lama berubah di Fase 1 dan svelte-check merah tanpa ini. Halaman Perpustakaan penuh tetap Fase 3; `CitationsPanel` dkk dipertahankan compiling untuk dipakai Fase 3.
5. **Panel sumber proyek memakai komponen ringan baru (`ProjectSourcesPanel`) di atas endpoint link**, bukan `CitationsPanel` penuh. `CitationsPanel` dirancang untuk perpustakaan penuh (filter/bulk/import) dan bentuk datanya beda dengan `GET /workspaces/:id/citations` (items + linkId + sectionId). "Reuse CitationsPanel" dari spec terpenuhi di `/app/library` Fase 3.
6. **Artifact reader di-rehome** ke `/app/projects/[projectId]/artifacts/[artifactId]` (fungsinya masih dipakai untuk membaca file; board workspace-nya yang dihapus).
7. **Reorder bab pakai tombol "naik/turun"** (menulis ulang `orderedIds` penuh via endpoint reorder), bukan drag-and-drop — aksesibel dan kecil; DnD polish opsional menyusul.
8. **Feature dir tetap `features/workspaces`** (entity backend = workspaces); komponen/halaman baru diberi nama `Project*` sesuai bahasa produk.

---

### Task 1: Fondasi tipe + label + hooks proyek & kerangka bab

**Files:**
- Modify: `apps/svelte/src/lib/features/workspaces/types.ts`
- Create: `apps/svelte/src/lib/features/workspaces/labels.ts`
- Modify: `apps/svelte/src/lib/features/workspaces/api.ts`
- Modify: `apps/svelte/src/lib/query/keys.ts`

**Interfaces:**
- Consumes: endpoint Fase 1 `POST /workspaces { name?, kind, topicNote?, deadline? }`, `PATCH /workspaces/:id { …, stage?, deadline?, topicNote? }`, `GET/POST /workspaces/:id/sections`, `POST /workspaces/:id/sections/reorder`, `PATCH/DELETE /sections/:id`.
- Produces (dipakai Task 5–9): tipe `WorkspaceKind`, `WorkspaceStage`, `SectionStatus`, `WorkspaceSection`, field baru pada `Workspace`; konstanta `WORKSPACE_KINDS`, `WORKSPACE_STAGES`, `SECTION_STATUSES`, label maps `WORKSPACE_KIND_LABELS`, `WORKSPACE_STAGE_LABELS`, `SECTION_STATUS_LABELS`, util `formatDeadline(ms)`, `sectionProgress(sections)`; hooks `useSections`, `useCreateSection`, `useUpdateSection`, `useDeleteSection`, `useReorderSections`; `useCreateWorkspace`/`useUpdateWorkspace` dengan input baru; key `queryKeys.workspaces.sections(id)`.

- [ ] **Step 0: Inventaris merah svelte-check**

Run: `cd apps/svelte && bun run check 2>&1 | tail -30 && cd ../..`
Expected: error type di `features/citations/api.ts` (endpoint berubah di Fase 1) dan `features/workspaces/api.ts` (`POST /workspaces` kini wajib `kind`). Catat jumlahnya — Task 1–2 menihilkannya.

- [ ] **Step 1: Perluas `types.ts`**

Ganti isi `apps/svelte/src/lib/features/workspaces/types.ts` menjadi:

```ts
// Tipe lokal workspace/proyek untuk komponen (struktural — cocok dengan shape
// yang di-infer Eden dari api). Sengaja TIDAK import @aqsha/db agar drizzle
// tak masuk bundle client.

export const WORKSPACE_KINDS = [
	'undergraduate_thesis',
	'masters_thesis',
	'dissertation',
	'journal_article',
	'proposal',
	'paper',
	'freeform'
] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const WORKSPACE_STAGES = [
	'exploration',
	'proposal',
	'research',
	'writing',
	'revision',
	'done'
] as const;
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number];

export const SECTION_STATUSES = ['empty', 'draft', 'in_review', 'done'] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export type Workspace = {
	id: string;
	ownerUserId: string;
	name: string;
	emoji: string | null;
	description: string | null;
	kind: WorkspaceKind;
	stage: WorkspaceStage;
	deadline: number | null;
	topicNote: string | null;
	status: string; // "active" | "archived"
	archivedAt: number | null;
	createdAt: number;
	updatedAt: number;
};

export type WorkspaceSection = {
	id: string;
	workspaceId: string;
	title: string;
	sortOrder: number;
	status: SectionStatus;
	role: 'bibliography' | null;
	documentArtifactId: string | null;
	createdAt: number;
	updatedAt: number;
};

export type Folder = {
	id: string;
	ownerUserId: string;
	workspaceId: string;
	name: string;
	status: string; // "active" (list hanya aktif)
	createdAt: number;
	updatedAt: number;
	deletedAt: number | null;
};

export const isArchived = (w: Pick<Workspace, 'status'>): boolean => w.status === 'archived';

/** Judul tampilan proyek: nama, fallback topik kasar selama eksplorasi. */
export function projectDisplayTitle(w: Pick<Workspace, 'name' | 'topicNote'>): string {
	return w.name.trim() || w.topicNote?.trim() || 'Proyek tanpa judul';
}
```

- [ ] **Step 2: Tulis `labels.ts`**

`apps/svelte/src/lib/features/workspaces/labels.ts`:

```ts
import type { SectionStatus, WorkspaceKind, WorkspaceSection, WorkspaceStage } from './types';

// Mapping enum DB (bahasa Inggris) → label UI bahasa Indonesia, sentence case.

export const WORKSPACE_KIND_LABELS: Record<WorkspaceKind, string> = {
	undergraduate_thesis: 'skripsi',
	masters_thesis: 'tesis',
	dissertation: 'disertasi',
	journal_article: 'artikel jurnal',
	proposal: 'proposal',
	paper: 'makalah',
	freeform: 'bebas'
};

export const WORKSPACE_STAGE_LABELS: Record<WorkspaceStage, string> = {
	exploration: 'eksplorasi',
	proposal: 'proposal',
	research: 'riset',
	writing: 'penulisan',
	revision: 'revisi',
	done: 'selesai'
};

export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
	empty: 'kosong',
	draft: 'draf',
	in_review: 'direview',
	done: 'beres'
};

const DEADLINE_FORMAT = new Intl.DateTimeFormat('id-ID', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

export function formatDeadline(ms: number): string {
	return DEADLINE_FORMAT.format(ms);
}

/**
 * Progress kerangka: bab `done` / total, tanpa section bibliography (kontennya
 * digenerate, bukan ditulis user).
 */
export function sectionProgress(sections: readonly WorkspaceSection[]): {
	done: number;
	total: number;
} {
	const writable = sections.filter((s) => s.role !== 'bibliography');
	return {
		done: writable.filter((s) => s.status === 'done').length,
		total: writable.length
	};
}
```

Catatan DRY: sebelum menambah util waktu-relatif, cek existing dengan `/usr/bin/grep -rn "RelativeTimeFormat\|formatRelative" apps/svelte/src` — bila sudah ada helper (mis. dipakai kartu thread), pakai itu di Task 5; kalau tidak ada, tambahkan di `labels.ts`:

```ts
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });

export function formatRelativeToNow(ms: number): string {
	const deltaMs = ms - Date.now();
	const dayMs = 86_400_000;
	if (Math.abs(deltaMs) >= dayMs) return RELATIVE_FORMAT.format(Math.round(deltaMs / dayMs), 'day');
	if (Math.abs(deltaMs) >= 3_600_000)
		return RELATIVE_FORMAT.format(Math.round(deltaMs / 3_600_000), 'hour');
	return RELATIVE_FORMAT.format(Math.round(deltaMs / 60_000), 'minute');
}
```

- [ ] **Step 3: Tambah key sections di `keys.ts`**

Di `apps/svelte/src/lib/query/keys.ts`, dalam blok `workspaces`:

```ts
	workspaces: {
		all: ['workspaces'] as const,
		list: (params: { includeArchived: boolean }) => ['workspaces', 'list', params] as const,
		detail: (id: string) => ['workspaces', 'detail', id] as const,
		sections: (id: string) => ['workspaces', 'sections', id] as const
	},
```

- [ ] **Step 4: Update hooks workspace + tambah hooks sections di `api.ts`**

Di `apps/svelte/src/lib/features/workspaces/api.ts`:

(a) Import tipe: `import type { SectionStatus, Workspace, WorkspaceKind } from './types';`

(b) Ganti `WorkspaceListPage` (list kini mengembalikan row workspace penuh):

```ts
export type WorkspaceListPage = {
	items: Workspace[];
	nextCursor: string | null;
};
```

(c) Ganti `useCreateWorkspace`:

```ts
export function useCreateWorkspace() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			name?: string;
			kind: WorkspaceKind;
			topicNote?: string;
			deadline?: number;
		}) => unwrap(await api.workspaces.post(input)),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal membuat proyek.'))
	}));
}
```

(d) Ganti `useUpdateWorkspace` (mutationFn + tipe input di `onSuccess` ikut):

```ts
export function useUpdateWorkspace() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			id: string;
			name?: string;
			emoji?: string;
			description?: string | null;
			stage?: WorkspaceStage;
			deadline?: number | null;
			topicNote?: string | null;
		}) =>
			unwrap(
				await api.workspaces({ id: input.id }).patch({
					name: input.name,
					emoji: input.emoji,
					description: input.description,
					stage: input.stage,
					deadline: input.deadline,
					topicNote: input.topicNote
				})
			),
		onSuccess: (_d: unknown, input: { id: string }) => {
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.all });
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.detail(input.id) });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memperbarui proyek.'))
	}));
}
```

(Import `WorkspaceStage` ikut di (a).)

(e) Tambah hooks sections di akhir file:

```ts
// ── Kerangka bab (workspace_sections) ────────────────────────────────────────

export function useSections(workspaceId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sections(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).sections.get()) as WorkspaceSection[]
	}));
}

export function useCreateSection() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { workspaceId: string; title: string }) =>
			unwrap(
				await api.workspaces({ id: input.workspaceId }).sections.post({ title: input.title })
			),
		onSuccess: (_d: unknown, input: { workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menambah bab.'))
	}));
}

export function useUpdateSection() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			id: string;
			workspaceId: string;
			title?: string;
			status?: SectionStatus;
		}) => unwrap(await api.sections({ id: input.id }).patch({ title: input.title, status: input.status })),
		onSuccess: (_d: unknown, input: { workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memperbarui bab.'))
	}));
}

export function useDeleteSection() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string; workspaceId: string }) =>
			unwrap(await api.sections({ id: input.id }).delete()),
		onSuccess: (_d: unknown, input: { workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menghapus bab.'))
	}));
}

export function useReorderSections() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { workspaceId: string; orderedIds: string[] }) =>
			unwrap(
				await api
					.workspaces({ id: input.workspaceId })
					.sections.reorder.post({ orderedIds: input.orderedIds })
			),
		onSuccess: (_d: unknown, input: { workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengubah urutan bab.'))
	}));
}
```

Import `WorkspaceSection` ikut di (a). Verifikasi bentuk path Eden `api.sections({ id })` terhadap route `PATCH /sections/:id` — kalau Eden meng-infer param sebagai `{ id: ... }` berbeda, sesuaikan dengan autocomplete tipe.

(f) Call site lama `useCreateWorkspace` (`AppSidebar` via `use-workspaces-data.ts` `createWorkspace({ name })`) akan merah — perbaiki SEMENTARA di `apps/svelte/src/lib/features/workspaces/api/use-workspaces-data.ts`: ganti input mutasi jadi `{ name, kind: 'freeform' as const }` (sidebar lama diganti total di Task 9; ini hanya menjaga hijau).

- [ ] **Step 5: Verifikasi + commit**

Run: `cd apps/svelte && bun run check 2>&1 | tail -20 && cd ../..`
Expected: error `features/workspaces/*` hilang; sisa merah hanya `features/citations/*` (Task 2).

```bash
git add apps/svelte/src/lib/features/workspaces/types.ts apps/svelte/src/lib/features/workspaces/labels.ts apps/svelte/src/lib/features/workspaces/api.ts apps/svelte/src/lib/features/workspaces/api/use-workspaces-data.ts apps/svelte/src/lib/query/keys.ts
git commit -m "feat(svelte): project domain types, labels, and section hooks"
```

---

### Task 2: Repoint citations ke perpustakaan akun + hooks koleksi proyek

Refactor mekanis dituntun svelte-check, pola sama dengan Task 5–6 Fase 1 (aturan transformasi + tsc-driven).

**Files:**
- Modify: `apps/svelte/src/lib/features/citations/api.ts`
- Modify: `apps/svelte/src/lib/query/keys.ts`
- Modify: komponen citations yang merah (`CitationsPanel.svelte`, `CitationDetailView.svelte`, dialog/wizard di `apps/svelte/src/lib/features/citations/components/`)

**Interfaces:**
- Consumes: route Fase 1 `apps/api/src/routes/citations.ts` — perpustakaan akun `/citations*` (list/tags/export/duplicates/merge/bulk-tag/bulk-delete/create/get/patch/delete/resolve) + koleksi per proyek `GET /workspaces/:id/citations`, `POST/DELETE /workspaces/:id/citations/:citationId/link`, `PATCH /citation-links/:linkId`. Yang TETAP workspace-scoped: imports (preview/commit), from-artifact, provider sync, render, render-document, citation-settings — baca file route untuk memastikan path persisnya.
- Produces (dipakai Task 7): `useWorkspaceCitations(workspaceId)` → `{ items: Array<Citation & { linkId: string; sectionId: string | null }> }`, `useLinkCitation()`, `useUnlinkCitation()`, `useAssignCitationSection()`; hooks library-level tanpa parameter `workspaceId`; key `queryKeys.citations.links(workspaceId)`.

- [ ] **Step 1: Reshape `queryKeys.citations`**

Ganti blok `citations` di `keys.ts`:

```ts
	citations: {
		all: ['citations'] as const,
		list: (params: { q: string; status: string | null; source: string | null; tag: string | null }) =>
			['citations', 'list', params] as const,
		detail: (citationId: string) => ['citations', 'detail', citationId] as const,
		tags: () => ['citations', 'tags'] as const,
		duplicates: () => ['citations', 'duplicates'] as const,
		links: (workspaceId: string) => ['citations', 'links', workspaceId] as const,
		render: (workspaceId: string, params: { styleId: string | null; ids: string[] }) =>
			['citations', 'render', workspaceId, params] as const,
		renderDocument: (workspaceId: string, signature: string) =>
			['citations', 'render-document', workspaceId, signature] as const,
		settings: (workspaceId: string) => ['citations', 'settings', workspaceId] as const
	},
```

(Key `workspace(workspaceId)` dihapus; invalidation lintas-citations pakai `citations.all`.)

- [ ] **Step 2: Transformasi `features/citations/api.ts`**

Aturan, terapkan konsisten (hook per hook, `bun run check` menuntun):
1. Hook perpustakaan → drop parameter `workspaceId` dan repoint path:
   `useCitationsList` → `api.citations.get({ query: … })`; `useCitationTags` → `api.citations.tags.get()`; `useCitationDetail` → `api.citations({ citationId }).get()`; `useCreateCitation` → `api.citations.post(input)`; `useUpdateCitation`/`useDeleteCitation` → `api.citations({ citationId }).patch/delete`; `useMergeCitations` → `api.citations.duplicates.merge.post`; `useDuplicateGroups` → `api.citations.duplicates.get()`; `useMergeManyCitations` → `api.citations.merge.post`; `useBulkTagCitations` → `api.citations['bulk-tag'].post`; `useBulkDeleteCitations` → `api.citations['bulk-delete'].post`; `useResolveCitation` → `api.citations({ citationId }).resolve.post()`; `useExportCitations` → `api.citations.export.get({ query })`.
2. Query key ikut bentuk baru Step 1; invalidation `queryKeys.citations.all`.
3. Hook yang TETAP workspace-scoped (JANGAN diubah path-nya kecuali route berkata lain): `useImportPreview`, `useImportCommit`, `useCreateCitationFromArtifact`, `useProviderFolders`, `useProviderSyncPreview`, `useProviderSyncCommit`, `useCitationRender`, `useRenderDocumentCitations`, `useCopyCitation`, `useCitationSettings`, `useUpdateCitationSettings`. Cocokkan satu per satu dengan `apps/api/src/routes/citations.ts`.
4. Tambah hooks koleksi proyek di akhir file:

```ts
// ── Koleksi sumber per proyek (workspace_citation_links) ────────────────────

export function useWorkspaceCitations(
	workspaceId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.links(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () => unwrap(await api.workspaces({ id: workspaceId() }).citations.get())
	}));
}

export function useLinkCitation() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { workspaceId: string; citationId: string; sectionId?: string | null }) =>
			unwrap(
				await api
					.workspaces({ id: input.workspaceId })
					.citations({ citationId: input.citationId })
					.link.post({ sectionId: input.sectionId ?? null })
			),
		onSuccess: (_d: unknown, input: { workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menambahkan sumber ke proyek.'))
	}));
}

export function useUnlinkCitation() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { workspaceId: string; citationId: string }) =>
			unwrap(
				await api
					.workspaces({ id: input.workspaceId })
					.citations({ citationId: input.citationId })
					.link.delete()
			),
		onSuccess: (_d: unknown, input: { workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal melepas sumber dari proyek.'))
	}));
}

export function useAssignCitationSection() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { linkId: string; workspaceId: string; sectionId: string | null }) =>
			unwrap(
				await api['citation-links']({ linkId: input.linkId }).patch({ sectionId: input.sectionId })
			),
		onSuccess: (_d: unknown, input: { workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menandai bab untuk sumber.'))
	}));
}
```

(Bentuk chaining Eden untuk path multi-param `/workspaces/:id/citations/:citationId/link` — verifikasi via autocomplete tipe; kalau Eden memerlukan bentuk lain, ikuti tipenya.)

- [ ] **Step 3: Sweep komponen citations yang merah**

Jalankan `cd apps/svelte && bun run check` berulang; nihilkan error di `features/citations/components/*` dengan menyesuaikan pemanggilan hooks ke signature baru (umumnya: hapus argumen `workspaceId` pada hook library-level; prop `workspaceId` komponen tetap ada untuk render/settings/label). JANGAN mengubah perilaku UI — ini alignment compile-only; halaman Perpustakaan baru = Fase 3.

- [ ] **Step 4: Verifikasi + commit**

Run: `cd apps/svelte && bun run check && cd ../..`
Expected: 0 error, 0 warning baru.

```bash
git add apps/svelte/src/lib/features/citations apps/svelte/src/lib/query/keys.ts
git commit -m "refactor(svelte): repoint citations to account library endpoints + project link hooks"
```

---

### Task 3: Threads hooks ber-scope proyek

**Files:**
- Modify: `apps/svelte/src/lib/query/keys.ts`
- Modify: `apps/svelte/src/lib/features/threads/api.ts`
- Modify: `apps/svelte/src/lib/features/threads/use-recent-thread-summaries.svelte.ts`

**Interfaces:**
- Consumes: `GET /threads?workspaceId=` (Fase 1).
- Produces (dipakai Task 4, 7): `useThreadsList(enabled?, workspaceId?)` (getter `() => string | null`), `useRecentThreadSummaries(enabled?, workspaceId?)`; key `queryKeys.threads.list(workspaceId)`.

- [ ] **Step 1: Key list ber-parameter**

Di `keys.ts` blok `threads`:

```ts
		list: (workspaceId: string | null = null) => ['threads', 'list', workspaceId] as const,
```

- [ ] **Step 2: `useThreadsList` menerima workspaceId**

Di `features/threads/api.ts`, ubah signature + query:

```ts
export function useThreadsList(
	enabled: () => boolean = always,
	workspaceId: () => string | null = () => null
) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.threads.list(workspaceId()),
		enabled: enabled(),
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) =>
			unwrap(
				await api.threads.get({
					query: {
						limit: LIST_PAGE_SIZE,
						...(workspaceId() ? { workspaceId: workspaceId()! } : {}),
						...(pageParam ? { cursor: pageParam } : {})
					}
				})
			) as { items: ChatThread[]; nextCursor: string | null },
		getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor
	}));
}
```

Semua invalidation existing `queryKeys.threads.list()` di codebase: ganti ke prefix `['threads', 'list']` — cari dengan `/usr/bin/grep -rn "threads.list()" apps/svelte/src` dan gunakan `qc.invalidateQueries({ queryKey: ['threads', 'list'] })` (atau tambah key helper `listAll: ['threads', 'list'] as const` di `keys.ts` — pilih satu, konsisten).

- [ ] **Step 3: `useRecentThreadSummaries` scoped**

```ts
export function useRecentThreadSummaries(
	enabled: () => boolean = always,
	workspaceId: () => string | null = () => null
) {
	const threadsList = useThreadsList(enabled, workspaceId);
	// Pin bersifat global (endpoint /threads/pinned tak ber-scope) — untuk daftar dalam proyek,
	// cukup urutan aktivitas; grup pin hanya untuk daftar global.
	const pinnedThreads = usePinnedThreads(() => enabled() && workspaceId() === null);
	const data = $derived(
		mergeRecentThreadSummaries(
			workspaceId() === null ? pinnedThreads.data : undefined,
			threadsList.data?.pages
		)
	);

	return {
		get data(): RecentThreadSummary[] {
			return data;
		}
	};
}
```

Cek signature `mergeRecentThreadSummaries` (`lib/recent-thread-summaries.ts`) menerima `undefined` untuk pinned; kalau tidak, ganti dengan `[]`.

- [ ] **Step 4: Verifikasi + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → 0 error.

```bash
git add apps/svelte/src/lib/features/threads/api.ts apps/svelte/src/lib/features/threads/use-recent-thread-summaries.svelte.ts apps/svelte/src/lib/query/keys.ts
git commit -m "feat(svelte): workspace-scoped threads list hooks"
```

---

### Task 4: Seam workspaceId → agent Mastra + chip konteks + URL binder

**Files:**
- Modify: `apps/svelte/src/lib/features/threads/state/thread-agent.svelte.ts`
- Modify: `apps/svelte/src/lib/features/thread-experience/components/MastraChatThreadSurface.svelte`
- Modify: `apps/svelte/src/lib/features/thread-experience/components/ThreadDetailShell.svelte`
- Modify: `apps/svelte/src/lib/features/explore/components/ExploreThreadChat.svelte`

**Interfaces:**
- Consumes: proyeksi agent membaca RequestContext key `aqsha-workspace-id` (`apps/agent/src/mastra/processors/thread-projection.ts:9`); `ContextRef` kind `workspace` dari `@aqsha/chat-core` (`{ kind: 'workspace'; workspaceId: string; label: string }`).
- Produces (dipakai Task 7–8): `ThreadAgentOptions.getWorkspaceId?: () => string | null`; prop `MastraChatThreadSurface.threadUrlFor?: (threadId: string) => string`; prop `ThreadDetailShell.workspace?: { id: string; name: string } | null`; prop `ExploreThreadChat.workspaceId?: string | null`.

- [ ] **Step 1: `ThreadAgent` membawa requestContext**

Di `thread-agent.svelte.ts`:

(a) `ThreadAgentOptions` tambah:

```ts
	/** Scope proyek — dikirim per request sebagai RequestContext `aqsha-workspace-id`. */
	getWorkspaceId?: () => string | null;
```

(b) Simpan di field privat (ikuti pola field `#getResourceId`): `#getWorkspaceId: () => string | null;` diisi di constructor `this.#getWorkspaceId = options.getWorkspaceId ?? (() => null);`

(c) Helper privat:

```ts
	/** Body RequestContext scope proyek — key non-`aqsha__` = boleh dikirim klien (di-merge server Mastra). */
	#workspaceRequestContext(): { requestContext?: Record<string, string> } {
		const workspaceId = this.#getWorkspaceId();
		return workspaceId ? { requestContext: { 'aqsha-workspace-id': workspaceId } } : {};
	}
```

(d) Spread `...this.#workspaceRequestContext()` ke dalam TIGA body call: `agent.sendMessage({ … })` di `send()` (sekitar `thread-agent.svelte.ts:469`), `agent.queueMessage({ … })` di `#enqueueWhileBusy` (sekitar `:520` — perluas tipe cast lokal `queueMessage` dengan `requestContext?: Record<string, string>`), dan `agent.sendMessage({ … })` di jalur regenerate (sekitar `:643`).

Sebelum edit, verifikasi `requestContext` memang param body yang didukung `@mastra/client-js` versi terpasang: baca `node_modules/@mastra/client-js/dist/**/*.d.ts` (cari `SendAgentMessageParams` / `RequestContext`) atau Mastra docs MCP — jangan mengarang API. (Server merge body `requestContext` untuk key non-reserved sudah diverifikasi ada di `@mastra/server`.)

- [ ] **Step 2: `MastraChatThreadSurface` — URL binder bisa diarahkan**

Tambah prop `threadUrlFor?: (threadId: string) => string` dan ubah binder (sekitar baris 143–151): binding hanya terjadi bila `threadUrlFor` diberikan —

```ts
	// Bind URL pada kirim pertama thread baru (shallow — tanpa remount). Butuh builder
	// eksplisit karena rute thread kini hidup di bawah proyek.
	$effect(() => {
		if (!bindUrlOnSend || bound || !threadUrlFor) return;
		if (!hasSentFirstMessage) return; // sesuaikan dengan guard existing di file
		bound = true;
		replaceState(threadUrlFor(threadId), page.state);
	});
```

Pertahankan struktur guard existing (baca blok aslinya; yang berubah hanya: sumber URL = `threadUrlFor(threadId)` dan no-op tanpa builder). Hapus `resolve('/app/(product)/threads/[threadId]', …)` dari file ini.

- [ ] **Step 3: `ThreadDetailShell` — prop `workspace`**

(a) Props:

```ts
	let {
		threadId: threadIdProp,
		compact = false,
		initialContent,
		workspace = null
	}: {
		threadId?: string;
		compact?: boolean;
		initialContent?: string;
		workspace?: { id: string; name: string } | null;
	} = $props();
```

(b) Opsi agent (di `new ThreadAgent({ … })`): tambah `getWorkspaceId: () => workspace?.id ?? null,`

(c) Chip konteks ambient — setelah `const mentions = new ComposerMentions();`:

```ts
	// Chip konteks proyek selalu terlihat di composer (channel ambient).
	$effect(() => {
		if (!workspace) return;
		mentions.setAmbientContextRefs([
			{ kind: 'workspace', workspaceId: workspace.id, label: workspace.name }
		]);
	});
```

Verifikasi nama method persis di `composer-mentions.svelte.ts` (`setAmbientContextRefs` / `syncAmbientFromPage`) dan apakah ada builder label workspace di `@aqsha/chat-core` (`/usr/bin/grep -n "WorkspaceMentionLabel" packages/chat-core/src/index.ts`) — pakai builder bila ada.

(d) Recent threads scoped: `useRecentThreadSummaries(() => …, () => workspace?.id ?? null)`.

(e) Teruskan ke surface: `<MastraChatThreadSurface … threadUrlFor={workspace ? (tid) => resolve('/app/(product)/projects/[projectId]/threads/[threadId]', { projectId: workspace.id, threadId: tid }) : undefined} />` (import `resolve` sudah ada; route dibuat Task 8 — svelte-check baru hijau setelah Task 8, jalankan task berurutan atau buat route kosong lebih dulu di task ini bila ingin hijau per-commit; pilihan aman: kerjakan Step 3 (e) ini BERSAMA Task 8 dalam satu commit bila check gagal karena route id belum ada).

(f) Composer di dalam pohon (`Composer.svelte` prop `ambientWorkspaceId`): teruskan `workspace?.id` lewat rantai props yang ada (`MastraChatThreadSurface` → `ThreadComposerDock` → `Composer`); cek bagaimana `ambientWorkspaceId` mengalir hari ini dan ikuti jalurnya.

- [ ] **Step 4: `ExploreThreadChat` — prop `workspaceId`**

```ts
	let {
		activeThreadId,
		workspaceId = null
	}: { activeThreadId: string | null; workspaceId?: string | null } = $props();
```

Dan pada `new ThreadAgent({ … })`: `getWorkspaceId: () => workspaceId,`.

- [ ] **Step 5: Verifikasi + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → 0 error (bila (e) ditunda ke Task 8, pastikan sisanya hijau).
Verifikasi manual (setelah Task 8 tersambung): kirim pesan dari thread proyek → cek DB dev `select id, workspace_id from chat_threads order by created_at desc limit 3;` → `workspace_id` terisi.

```bash
git add apps/svelte/src/lib/features/threads/state/thread-agent.svelte.ts apps/svelte/src/lib/features/thread-experience/components/MastraChatThreadSurface.svelte apps/svelte/src/lib/features/thread-experience/components/ThreadDetailShell.svelte apps/svelte/src/lib/features/explore/components/ExploreThreadChat.svelte
git commit -m "feat(svelte): send aqsha-workspace-id request context + project-aware thread shell"
```

---

### Task 5: Beranda `/app` = daftar proyek + dialog "Proyek baru"

**Files:**
- Create: `apps/svelte/src/lib/features/workspaces/components/NewProjectDialog.svelte`
- Create: `apps/svelte/src/lib/features/workspaces/components/ProjectCard.svelte`
- Create: `apps/svelte/src/lib/features/workspaces/pages/ProjectsIndexPage.svelte`
- Modify: `apps/svelte/src/routes/app/(product)/+page.svelte`

**Interfaces:**
- Consumes: `useWorkspacesList`, `useCreateWorkspace`, `useSections`, label/util Task 1, `projectDisplayTitle`.
- Produces: `NewProjectDialog` props `{ open: boolean; onOpenChange: (open: boolean) => void }` (navigasi ke proyek baru dilakukan di dalam) — dipakai lagi oleh sidebar Task 9.

- [ ] **Step 1: `NewProjectDialog.svelte`**

Ikuti pola `NameDialog.svelte` (remount konten saat open via `{#if open}`; lihat file itu untuk struktur persis Dialog):

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Textarea } from '@aqsha/ui-svelte/components/textarea';
	import { useCreateWorkspace } from '../api';
	import { WORKSPACE_KIND_LABELS } from '../labels';
	import { WORKSPACE_KINDS, type WorkspaceKind } from '../types';

	/**
	 * Dialog proyek baru tanpa friksi: jenis → topik kasar; judul & tenggat opsional.
	 * Proyek lahir di tahap eksplorasi (default backend) lalu langsung dibuka.
	 */
	let {
		open,
		onOpenChange
	}: { open: boolean; onOpenChange: (open: boolean) => void } = $props();

	const createWorkspace = useCreateWorkspace();

	let kind = $state<WorkspaceKind | ''>('');
	let topicNote = $state('');
	let name = $state('');
	let deadlineInput = $state('');
	let submitting = $state(false);

	// Reset draft tiap kali dialog dibuka.
	$effect(() => {
		if (open) {
			kind = '';
			topicNote = '';
			name = '';
			deadlineInput = '';
			submitting = false;
		}
	});

	const canSubmit = $derived(kind !== '' && !submitting);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (kind === '') return;
		submitting = true;
		try {
			const { id } = await createWorkspace.mutateAsync({
				kind,
				...(topicNote.trim() ? { topicNote: topicNote.trim() } : {}),
				...(name.trim() ? { name: name.trim() } : {}),
				...(deadlineInput ? { deadline: new Date(`${deadlineInput}T00:00:00`).getTime() } : {})
			});
			onOpenChange(false);
			await goto(resolve('/app/(product)/projects/[projectId]', { projectId: String(id) }));
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Proyek baru</Dialog.Title>
				<Dialog.Description>Kamu lagi nulis apa? Cukup jenis dan topik kasarnya dulu.</Dialog.Description>
			</Dialog.Header>
			<form class="grid gap-4" onsubmit={submit}>
				<div class="grid gap-1.5">
					<label class="text-label font-medium" for="project-kind">Jenis karya tulis</label>
					<Select.Root
						type="single"
						value={kind}
						onValueChange={(v) => (kind = v as WorkspaceKind)}
					>
						<Select.Trigger id="project-kind" class="w-full">
							{kind ? WORKSPACE_KIND_LABELS[kind] : 'Pilih jenis…'}
						</Select.Trigger>
						<Select.Content>
							{#each WORKSPACE_KINDS as k (k)}
								<Select.Item value={k} label={WORKSPACE_KIND_LABELS[k]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-1.5">
					<label class="text-label font-medium" for="project-topic">Topik kasar</label>
					<Textarea
						id="project-topic"
						bind:value={topicNote}
						rows={2}
						placeholder="cth. dampak media sosial terhadap kesehatan mental remaja"
					/>
				</div>
				<details class="group">
					<summary class="cursor-pointer text-label font-medium text-muted-foreground">
						Opsional: judul & tenggat
					</summary>
					<div class="mt-3 grid gap-3">
						<div class="grid gap-1.5">
							<label class="text-label font-medium" for="project-name">Judul (boleh kosong)</label>
							<Input id="project-name" bind:value={name} placeholder="Bisa diisi nanti" />
						</div>
						<div class="grid gap-1.5">
							<label class="text-label font-medium" for="project-deadline">Tenggat</label>
							<Input id="project-deadline" type="date" bind:value={deadlineInput} />
						</div>
					</div>
				</details>
				<Dialog.Footer>
					<Dialog.Close>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="outline">Batal</Button>
						{/snippet}
					</Dialog.Close>
					<Button type="submit" disabled={!canSubmit}>
						{submitting ? 'Membuat…' : 'Buat proyek'}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	{/if}
</Dialog.Root>
```

Sesuaikan API `Select` dengan versi bits-ui/shadcn-svelte terpasang (lihat pemakaian Select existing, mis. di settings/citations — salin bentuk `Select.Root/Trigger/Content/Item` dari sana bila berbeda).

- [ ] **Step 2: `ProjectCard.svelte`**

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Progress } from '@aqsha/ui-svelte/components/progress';
	import { useSections } from '../api';
	import {
		formatDeadline,
		formatRelativeToNow,
		sectionProgress,
		SECTION_STATUS_LABELS,
		WORKSPACE_KIND_LABELS,
		WORKSPACE_STAGE_LABELS
	} from '../labels';
	import { projectDisplayTitle, type Workspace } from '../types';

	/** Kartu proyek beranda: jenis, judul/topik, tahap, progress bab, tenggat, aktivitas. */
	let { workspace }: { workspace: Workspace } = $props();

	const isFreeform = $derived(workspace.kind === 'freeform');
	const sections = useSections(
		() => workspace.id,
		() => !isFreeform
	);
	const progress = $derived(sections.data ? sectionProgress(sections.data) : null);
	const untitled = $derived(!workspace.name.trim());
</script>

<a
	href={resolve('/app/(product)/projects/[projectId]', { projectId: workspace.id })}
	class="group flex flex-col gap-3 rounded-lg border-2 border-border bg-card p-4 transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
>
	<div class="flex items-center gap-2">
		<span aria-hidden="true" class="text-lg leading-none">{workspace.emoji?.trim() || '📚'}</span>
		<Badge variant="outline">{WORKSPACE_KIND_LABELS[workspace.kind]}</Badge>
		<Badge variant="secondary" class="ml-auto">{WORKSPACE_STAGE_LABELS[workspace.stage]}</Badge>
	</div>
	<p class={untitled ? 'font-display text-lg italic text-muted-foreground' : 'font-display text-lg font-bold text-foreground'}>
		{projectDisplayTitle(workspace)}
	</p>
	{#if !isFreeform && progress && progress.total > 0}
		<div class="grid gap-1.5">
			<Progress value={(progress.done / progress.total) * 100} />
			<span class="text-label text-muted-foreground">
				{progress.done}/{progress.total} bab {SECTION_STATUS_LABELS.done}
			</span>
		</div>
	{/if}
	<div class="mt-auto flex items-center gap-3 text-label text-muted-foreground">
		{#if workspace.deadline != null}
			<span>Tenggat {formatDeadline(workspace.deadline)}</span>
		{/if}
		<span class="ml-auto">Diperbarui {formatRelativeToNow(workspace.updatedAt)}</span>
	</div>
</a>
```

(Kelas judul: cocokkan dengan utility tipografi yang benar-benar ada — cek `font-display`/`text-*` di `app.css`/tokens; ikuti pola kartu existing seperti `LibraryArtifactCard.svelte` bila utility-nya beda.)

- [ ] **Step 3: `ProjectsIndexPage.svelte`**

```svelte
<script lang="ts">
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, PlusIcon } from '$lib/icons';
	import { useWorkspacesList } from '../api';
	import NewProjectDialog from '../components/NewProjectDialog.svelte';
	import ProjectCard from '../components/ProjectCard.svelte';
	import type { Workspace } from '../types';

	/** Beranda: daftar proyek karya tulis + pintu masuk "Proyek baru" tanpa friksi. */
	const clerk = useClerkContext();
	const list = useWorkspacesList(
		() => false,
		() => clerk.isLoaded && Boolean(clerk.auth.userId)
	);
	const projects = $derived<Workspace[]>(list.data?.pages.flatMap((p) => p.items) ?? []);

	let dialogOpen = $state(false);
</script>

<div class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-8">
	<header class="flex items-center justify-between gap-4">
		<div>
			<h1 class="font-display text-2xl font-bold">Proyek</h1>
			<p class="text-sm text-muted-foreground">Semua karya tulismu, dari ide sampai selesai.</p>
		</div>
		<Button type="button" onclick={() => (dialogOpen = true)}>
			<Icon icon={PlusIcon} class="size-4" />
			Proyek baru
		</Button>
	</header>

	{#if list.isPending}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each Array(6) as _, i (i)}
				<div class="h-44 animate-pulse rounded-lg border-2 border-border bg-muted/40"></div>
			{/each}
		</div>
	{:else if projects.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-12 text-center">
			<h2 class="font-display text-xl font-bold">Kamu lagi nulis apa?</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				Skripsi, artikel jurnal, atau ide yang masih mentah — mulai dari satu proyek, judulnya bisa menyusul.
			</p>
			<Button type="button" onclick={() => (dialogOpen = true)}>Buat proyek pertama</Button>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each projects as workspace (workspace.id)}
				<ProjectCard {workspace} />
			{/each}
		</div>
		{#if list.hasNextPage}
			<Button type="button" variant="outline" class="mx-auto" onclick={() => list.fetchNextPage()}>
				Muat lebih banyak
			</Button>
		{/if}
	{/if}
</div>

<NewProjectDialog open={dialogOpen} onOpenChange={(open) => (dialogOpen = open)} />
```

- [ ] **Step 4: Wire route beranda**

Ganti isi `apps/svelte/src/routes/app/(product)/+page.svelte`:

```svelte
<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import ProjectsIndexPage from '$lib/features/workspaces/pages/ProjectsIndexPage.svelte';
</script>

<PageTitle title="Beranda" />
<ProjectsIndexPage />
```

- [ ] **Step 5: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → 0 error.
Manual (dev server): buka `/app` → daftar proyek muncul (workspace lama tampil sebagai kind bebas); "Proyek baru" → pilih skripsi + topik → terbuat & navigasi ke `/app/projects/<id>` (404 dulu — route dibuat Task 6, itu ekspektasi); kartu non-freeform menampilkan progress bab (template Fase 1 menyemai 6 section). Cek keyboard: kartu fokusable, dialog bisa disubmit via Enter.

```bash
git add apps/svelte/src/lib/features/workspaces/components/NewProjectDialog.svelte apps/svelte/src/lib/features/workspaces/components/ProjectCard.svelte apps/svelte/src/lib/features/workspaces/pages/ProjectsIndexPage.svelte "apps/svelte/src/routes/app/(product)/+page.svelte"
git commit -m "feat(svelte): project list home with frictionless new-project dialog"
```

---

### Task 6: Rumah proyek — kolom utama (header identitas + stepper tahap + kerangka bab)

**Files:**
- Create: `apps/svelte/src/lib/features/workspaces/components/StageStepper.svelte`
- Create: `apps/svelte/src/lib/features/workspaces/components/ProjectHeader.svelte`
- Create: `apps/svelte/src/lib/features/workspaces/components/SectionOutline.svelte`
- Create: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte`
- Create: `apps/svelte/src/routes/app/(product)/projects/[projectId]/+page.svelte`

**Interfaces:**
- Consumes: `useWorkspace`, `useUpdateWorkspace`, `useSections`, `useCreateSection`, `useUpdateSection`, `useDeleteSection`, `useReorderSections`, labels Task 1, `DetailSplitLayout`, `NameDialog`, `ConfirmDialog`, `ComposerMentions` (`setComposerMentions`).
- Produces: `ProjectHomePage` props `{ workspaceId: string }`; callback internal `onWriteWithAstra(section)` → membuka tab chat panel (Task 7 menyambungkan panel; task ini memasang seam-nya).

- [ ] **Step 1: `StageStepper.svelte`**

```svelte
<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { WORKSPACE_STAGE_LABELS } from '../labels';
	import { WORKSPACE_STAGES, type WorkspaceStage } from '../types';

	/**
	 * Stepper tahap manual. Grammar design system: tahap aktif = pilihan eksklusif → primary,
	 * bukan mint. Klik langsung menyimpan (PATCH stage) — tanpa konfirmasi, bisa diubah kapan pun.
	 */
	let {
		stage,
		disabled = false,
		onStageChange
	}: {
		stage: WorkspaceStage;
		disabled?: boolean;
		onStageChange: (stage: WorkspaceStage) => void;
	} = $props();
</script>

<div
	role="radiogroup"
	aria-label="Tahap proyek"
	class="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-md border-2 border-border bg-card p-[5px]"
>
	{#each WORKSPACE_STAGES as s (s)}
		{@const active = s === stage}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			{disabled}
			onclick={() => !active && onStageChange(s)}
			class={cn(
				'rounded-sm px-2.5 py-1 text-label font-medium transition-colors',
				active
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground',
				disabled && 'opacity-50'
			)}
		>
			{WORKSPACE_STAGE_LABELS[s]}
		</button>
	{/each}
</div>
```

- [ ] **Step 2: `ProjectHeader.svelte`**

```svelte
<script lang="ts">
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import NameDialog from './NameDialog.svelte';
	import StageStepper from './StageStepper.svelte';
	import { useUpdateWorkspace } from '../api';
	import { formatDeadline, WORKSPACE_KIND_LABELS } from '../labels';
	import { projectDisplayTitle, type Workspace, type WorkspaceStage } from '../types';

	/** Identitas proyek: jenis, judul (klik → ubah), stepper tahap manual, tenggat. */
	let { workspace }: { workspace: Workspace } = $props();

	const update = useUpdateWorkspace();
	const isFreeform = $derived(workspace.kind === 'freeform');
	const untitled = $derived(!workspace.name.trim());

	let renameOpen = $state(false);
	let deadlineOpen = $state(false);
	let deadlineInput = $state('');

	$effect(() => {
		if (deadlineOpen) {
			deadlineInput =
				workspace.deadline != null
					? new Date(workspace.deadline).toISOString().slice(0, 10)
					: '';
		}
	});

	function setStage(stage: WorkspaceStage) {
		update.mutate({ id: workspace.id, stage });
	}

	async function saveDeadline() {
		await update.mutateAsync({
			id: workspace.id,
			deadline: deadlineInput ? new Date(`${deadlineInput}T00:00:00`).getTime() : null
		});
		deadlineOpen = false;
	}
</script>

<header class="flex flex-col gap-3 border-b-2 border-border px-6 py-4">
	<div class="flex flex-wrap items-center gap-2">
		<span aria-hidden="true" class="text-xl leading-none">{workspace.emoji?.trim() || '📚'}</span>
		<Badge variant="outline">{WORKSPACE_KIND_LABELS[workspace.kind]}</Badge>
		<Popover.Root bind:open={deadlineOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} type="button" variant="ghost" size="sm" class="text-muted-foreground">
						{workspace.deadline != null ? `Tenggat ${formatDeadline(workspace.deadline)}` : 'Atur tenggat'}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="grid w-64 gap-3">
				<label class="text-label font-medium" for="deadline-input">Tenggat proyek</label>
				<Input id="deadline-input" type="date" bind:value={deadlineInput} />
				<div class="flex justify-end gap-2">
					{#if workspace.deadline != null}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => {
								deadlineInput = '';
								void saveDeadline();
							}}
						>
							Hapus
						</Button>
					{/if}
					<Button type="button" size="sm" onclick={saveDeadline}>Simpan</Button>
				</div>
			</Popover.Content>
		</Popover.Root>
	</div>
	<button
		type="button"
		class="w-fit text-left font-display text-2xl font-bold hover:underline focus-visible:underline focus-visible:outline-none"
		onclick={() => (renameOpen = true)}
		aria-label="Ubah judul proyek"
	>
		<span class={untitled ? 'italic text-muted-foreground' : ''}>{projectDisplayTitle(workspace)}</span>
	</button>
	{#if untitled && workspace.topicNote}
		<p class="text-sm text-muted-foreground">Masih eksplorasi — beri judul kapan pun kamu siap.</p>
	{/if}
	{#if !isFreeform}
		<StageStepper stage={workspace.stage} onStageChange={setStage} />
	{/if}
</header>

<NameDialog
	open={renameOpen}
	onOpenChange={(open) => (renameOpen = open)}
	title="Judul proyek"
	description="Judul bisa diubah kapan saja."
	submitLabel="Simpan"
	initialName={workspace.name}
	onSubmit={async ({ name }) => {
		await update.mutateAsync({ id: workspace.id, name });
		renameOpen = false;
	}}
/>
```

(Cek props `NameDialog` persis — `initialName`/`onSubmit` sesuai file existing; sesuaikan bila beda.)

- [ ] **Step 3: `SectionOutline.svelte`**

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NameDialog from './NameDialog.svelte';
	import { Icon, ArrowDownIcon, ArrowUpIcon, MoreHorizontalIcon, PenLineIcon, PlusIcon, SparklesIcon } from '$lib/icons';
	import { useCreateSection, useDeleteSection, useReorderSections, useUpdateSection } from '../api';
	import { SECTION_STATUS_LABELS } from '../labels';
	import { SECTION_STATUSES, type SectionStatus, type WorkspaceSection } from '../types';

	/**
	 * Kerangka bab = bintang rumah proyek. Status per bab diubah user (kosong→beres);
	 * section bibliography digenerate citeproc → tanpa status & tanpa editor manual.
	 */
	let {
		workspaceId,
		sections,
		onWriteWithAstra
	}: {
		workspaceId: string;
		sections: WorkspaceSection[];
		onWriteWithAstra: (section: WorkspaceSection) => void;
	} = $props();

	const createSection = useCreateSection();
	const updateSection = useUpdateSection();
	const deleteSection = useDeleteSection();
	const reorderSections = useReorderSections();

	let newTitle = $state('');
	let renameTarget = $state<WorkspaceSection | null>(null);
	let deleteTarget = $state<WorkspaceSection | null>(null);

	const STATUS_DOT: Record<SectionStatus, string> = {
		empty: 'bg-muted-foreground/40',
		draft: 'bg-lemon',
		in_review: 'bg-lavender',
		done: 'bg-mint'
	};

	async function addSection(event: SubmitEvent) {
		event.preventDefault();
		const title = newTitle.trim();
		if (!title) return;
		await createSection.mutateAsync({ workspaceId, title });
		newTitle = '';
	}

	function move(section: WorkspaceSection, delta: -1 | 1) {
		const ids = sections.map((s) => s.id);
		const from = ids.indexOf(section.id);
		const to = from + delta;
		if (to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to]!, ids[from]!];
		reorderSections.mutate({ workspaceId, orderedIds: ids });
	}
</script>

<section class="flex flex-col gap-3 px-6 py-5" aria-label="Kerangka bab">
	<h2 class="font-display text-lg font-bold">Kerangka</h2>
	<ul class="grid gap-2">
		{#each sections as section, i (section.id)}
			{@const isBibliography = section.role === 'bibliography'}
			<li class="flex items-center gap-3 rounded-md border-2 border-border bg-card px-3 py-2.5">
				<span
					aria-hidden="true"
					class={`size-2 shrink-0 rounded-full ${isBibliography ? 'bg-muted-foreground/40' : STATUS_DOT[section.status]}`}
				></span>
				<a
					href={resolve('/app/(product)/projects/[projectId]/sections/[sectionId]', {
						projectId: workspaceId,
						sectionId: section.id
					})}
					class="min-w-0 flex-1 truncate font-medium hover:underline"
				>
					{section.title}
				</a>
				{#if isBibliography}
					<Badge variant="outline">otomatis</Badge>
				{:else}
					<Select.Root
						type="single"
						value={section.status}
						onValueChange={(v) =>
							updateSection.mutate({ id: section.id, workspaceId, status: v as SectionStatus })}
					>
						<Select.Trigger class="h-8 w-28" aria-label={`Status ${section.title}`}>
							{SECTION_STATUS_LABELS[section.status]}
						</Select.Trigger>
						<Select.Content>
							{#each SECTION_STATUSES as s (s)}
								<Select.Item value={s} label={SECTION_STATUS_LABELS[s]} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="gap-1.5"
						onclick={() => onWriteWithAstra(section)}
					>
						<Icon icon={SparklesIcon} class="size-3.5" />
						Tulis dengan Astra
					</Button>
				{/if}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="ghost" size="icon" aria-label={`Aksi ${section.title}`}>
								<Icon icon={MoreHorizontalIcon} class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onSelect={() => (renameTarget = section)}>
							<Icon icon={PenLineIcon} class="size-4" /> Ubah judul
						</DropdownMenu.Item>
						<DropdownMenu.Item disabled={i === 0} onSelect={() => move(section, -1)}>
							<Icon icon={ArrowUpIcon} class="size-4" /> Naik
						</DropdownMenu.Item>
						<DropdownMenu.Item disabled={i === sections.length - 1} onSelect={() => move(section, 1)}>
							<Icon icon={ArrowDownIcon} class="size-4" /> Turun
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item variant="destructive" onSelect={() => (deleteTarget = section)}>
							Hapus bab
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</li>
		{/each}
	</ul>
	<form class="flex items-center gap-2" onsubmit={addSection}>
		<Input bind:value={newTitle} placeholder="Tambah bab…" aria-label="Judul bab baru" />
		<Button type="submit" variant="outline" disabled={!newTitle.trim()}>
			<Icon icon={PlusIcon} class="size-4" /> Tambah
		</Button>
	</form>
</section>

<NameDialog
	open={renameTarget !== null}
	onOpenChange={(open) => {
		if (!open) renameTarget = null;
	}}
	title="Ubah judul bab"
	description="Kerangka sepenuhnya milikmu."
	submitLabel="Simpan"
	initialName={renameTarget?.title ?? ''}
	onSubmit={async ({ name }) => {
		if (!renameTarget) return;
		await updateSection.mutateAsync({ id: renameTarget.id, workspaceId, title: name });
		renameTarget = null;
	}}
/>

<ConfirmDialog
	open={deleteTarget !== null}
	onOpenChange={(open) => {
		if (!open) deleteTarget = null;
	}}
	title="Hapus bab?"
	description={`"${deleteTarget?.title ?? ''}" akan dihapus dari kerangka. Sumber yang ditandai untuk bab ini kembali ke level proyek.`}
	confirmLabel="Hapus"
	onConfirm={async () => {
		if (!deleteTarget) return;
		await deleteSection.mutateAsync({ id: deleteTarget.id, workspaceId });
		deleteTarget = null;
	}}
/>
```

(Cek nama ikon di `$lib/icons` — `MoreHorizontalIcon`/`PenLineIcon`/`SparklesIcon`/`ArrowUpIcon`/`ArrowDownIcon`; pakai padanan yang benar-benar diekspor. Cek props `ConfirmDialog` persis.)

- [ ] **Step 4: `ProjectHomePage.svelte`**

```svelte
<script lang="ts">
	import { useClerkContext } from 'svelte-clerk';
	import { PageTitle } from '$lib/seo';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import ProjectSidePanel from '../components/ProjectSidePanel.svelte';
	import ProjectHeader from '../components/ProjectHeader.svelte';
	import SectionOutline from '../components/SectionOutline.svelte';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle, type WorkspaceSection } from '../types';

	/**
	 * Rumah proyek: kiri kerangka bab (bintang), kanan sumber proyek + thread terbaru,
	 * atas identitas. Chat hidup di panel kanan — selalu ber-scope proyek ini.
	 */
	let { workspaceId }: { workspaceId: string } = $props();

	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	// Channel mention per-halaman: chip ambient proyek + draft "Tulis dengan Astra"
	// dibaca composer panel chat (pohon yang sama).
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	const workspace = useWorkspace(
		() => workspaceId,
		() => enabled
	);
	const sections = useSections(
		() => workspaceId,
		() => enabled
	);
	const isFreeform = $derived(workspace.data?.kind === 'freeform');

	$effect(() => {
		const w = workspace.data;
		if (!w) return;
		mentions.setAmbientContextRefs([
			{ kind: 'workspace', workspaceId: w.id, label: projectDisplayTitle(w) }
		]);
	});

	let sideOpen = $state(true);
	let panelTab = $state<'chat' | 'sources'>('chat');

	function writeWithAstra(section: WorkspaceSection) {
		mentions.setComposerDraft(
			`Bantu saya menulis bab "${section.title}". Mulai dari kerangka dan poin utama berdasarkan sumber yang sudah ada di proyek ini.`
		);
		panelTab = 'chat';
		sideOpen = true;
	}
</script>

{#if workspace.data}
	<PageTitle title={projectDisplayTitle(workspace.data)} />
{/if}

{#if workspace.isPending || sections.isPending}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat proyek…</span>
	</div>
{:else if !workspace.data}
	<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
		<p>Proyek tidak ditemukan.</p>
	</div>
{:else}
	<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
		<DetailSplitLayout {sideOpen} onSideOpenChange={(open) => (sideOpen = open)}>
			{#snippet main()}
				<ProjectHeader workspace={workspace.data!} />
				<div class="min-h-0 flex-1 overflow-y-auto">
					{#if isFreeform}
						<div class="flex flex-col items-start gap-2 px-6 py-8 text-muted-foreground">
							<p class="font-medium text-foreground">Proyek bebas — tanpa kerangka bab.</p>
							<p class="text-sm">Mulai dari chat di panel kanan, atau kumpulkan sumber untuk proyek ini.</p>
						</div>
					{:else}
						<SectionOutline
							{workspaceId}
							sections={sections.data ?? []}
							onWriteWithAstra={writeWithAstra}
						/>
					{/if}
				</div>
			{/snippet}
			{#snippet side()}
				<ProjectSidePanel
					{workspaceId}
					workspaceName={projectDisplayTitle(workspace.data!)}
					sections={sections.data ?? []}
					activeTab={panelTab}
					onTabChange={(tab) => (panelTab = tab)}
					onClose={() => (sideOpen = false)}
				/>
			{/snippet}
		</DetailSplitLayout>
	</div>
{/if}
```

Catatan: `ProjectSidePanel` dibuat Task 7 — agar task ini bisa hijau berdiri sendiri, buat stub minimal `ProjectSidePanel.svelte` dulu (frame kosong dengan props di atas) yang diisi penuh di Task 7; ATAU kerjakan Task 6+7 lalu commit berurutan setelah check hijau. Verifikasi nama method `setComposerDraft` di `composer-mentions.svelte.ts`. Ingat gotcha layout: `DetailSplitLayout` WAJIB ancestor `h-svh min-h-0 overflow-hidden` (sudah di kode di atas).

- [ ] **Step 5: Route rumah proyek**

`apps/svelte/src/routes/app/(product)/projects/[projectId]/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import ProjectHomePage from '$lib/features/workspaces/pages/ProjectHomePage.svelte';

	const projectId = $derived(page.params.projectId!);
</script>

{#key projectId}
	<ProjectHomePage workspaceId={projectId} />
{/key}
```

- [ ] **Step 6: Verifikasi manual + commit** (boleh digabung setelah Task 7 bila memilih tanpa stub)

Run: `cd apps/svelte && bun run check && cd ../..` → 0 error.
Manual: buka proyek skripsi baru → header (badge skripsi, stepper, tenggat), 6 bab template tampil; ubah status bab → dot & label berubah, progress kartu beranda ikut; rename/naik/turun/hapus/tambah bab bekerja; proyek `freeform` → tanpa stepper & tanpa kerangka.

```bash
git add "apps/svelte/src/routes/app/(product)/projects" apps/svelte/src/lib/features/workspaces/components/StageStepper.svelte apps/svelte/src/lib/features/workspaces/components/ProjectHeader.svelte apps/svelte/src/lib/features/workspaces/components/SectionOutline.svelte apps/svelte/src/lib/features/workspaces/components/ProjectSidePanel.svelte apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte
git commit -m "feat(svelte): project home with identity header, stage stepper, and section outline"
```

---

### Task 7: Rumah proyek — panel kanan (chat scoped + sumber proyek + thread terbaru)

**Files:**
- Create: `apps/svelte/src/lib/features/workspaces/components/ProjectSourcesPanel.svelte`
- Create/isi penuh: `apps/svelte/src/lib/features/workspaces/components/ProjectSidePanel.svelte`

**Interfaces:**
- Consumes: `useWorkspaceCitations`/`useUnlinkCitation`/`useAssignCitationSection` (Task 2), `useRecentThreadSummaries(enabled, workspaceId)` (Task 3), `ExploreThreadChat { activeThreadId, workspaceId }` (Task 4), `SidePanelFrame`/`PanelTabsHeader`/`PanelCardToolbar`/`PanelExpandButton` (pola `WorkspaceSidePanel.svelte` lama — baca file itu sebagai referensi struktur sebelum dihapus di Task 10), `ThreadRecentSwitcher`, `citationMetaLine` dari `features/citations/types`.
- Produces: `ProjectSidePanel` props `{ workspaceId: string; workspaceName: string; sections: WorkspaceSection[]; activeTab: 'chat' | 'sources'; onTabChange: (tab: 'chat' | 'sources') => void; onClose: () => void }`.

- [ ] **Step 1: `ProjectSourcesPanel.svelte`**

```svelte
<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Icon, MoreHorizontalIcon } from '$lib/icons';
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import { cn } from '@aqsha/ui-svelte/utils';
	import {
		useAssignCitationSection,
		useUnlinkCitation,
		useWorkspaceCitations
	} from '$lib/features/citations/api';
	import { citationMetaLine } from '$lib/features/citations/types';
	import type { WorkspaceSection } from '../types';

	/**
	 * Koleksi sumber proyek: item perpustakaan akun yang di-link ke proyek ini
	 * (+ opsional ditandai untuk satu bab). Kelola perpustakaan penuh = /app/library.
	 */
	let {
		workspaceId,
		sections
	}: { workspaceId: string; sections: WorkspaceSection[] } = $props();

	const linked = useWorkspaceCitations(() => workspaceId);
	const unlink = useUnlinkCitation();
	const assignSection = useAssignCitationSection();

	const NO_SECTION = '__none__';
	const sectionOptions = $derived(sections.filter((s) => s.role !== 'bibliography'));
	const items = $derived(linked.data?.items ?? []);
</script>

<div class={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto', panelBodyPaddingClass)}>
	{#if linked.isPending}
		<div class="flex flex-1 items-center justify-center gap-2 py-10 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Memuat sumber…</span>
		</div>
	{:else if items.length === 0}
		<div class="rounded-md border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
			Belum ada sumber di proyek ini. Simpan dari Jelajah atau perpustakaanmu.
		</div>
	{:else}
		<ul class="grid gap-2">
			{#each items as item (item.linkId)}
				<li class="grid gap-1.5 rounded-md border-2 border-border bg-card p-3">
					<p class="text-sm font-medium leading-snug">{item.title}</p>
					<p class="text-label text-muted-foreground">{citationMetaLine(item)}</p>
					<div class="flex items-center gap-2">
						{#if sectionOptions.length > 0}
							<Select.Root
								type="single"
								value={item.sectionId ?? NO_SECTION}
								onValueChange={(v) =>
									assignSection.mutate({
										linkId: item.linkId,
										workspaceId,
										sectionId: v === NO_SECTION ? null : v
									})}
							>
								<Select.Trigger class="h-7 flex-1 text-label" aria-label="Tandai untuk bab">
									{sectionOptions.find((s) => s.id === item.sectionId)?.title ?? 'Seluruh proyek'}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value={NO_SECTION} label="Seluruh proyek" />
									{#each sectionOptions as s (s.id)}
										<Select.Item value={s.id} label={s.title} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/if}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} type="button" variant="ghost" size="icon" class="size-7" aria-label={`Aksi ${item.title}`}>
										<Icon icon={MoreHorizontalIcon} class="size-4" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item
									variant="destructive"
									onSelect={() => unlink.mutate({ workspaceId, citationId: item.id })}
								>
									Lepas dari proyek
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
```

(Cocokkan field item — `title`/shape `citationMetaLine` — dengan tipe hasil Eden dari `GET /workspaces/:id/citations`; sesuaikan bila nama field beda.)

- [ ] **Step 2: `ProjectSidePanel.svelte`**

Adaptasi langsung dari `WorkspaceSidePanel.svelte` (struktur frame/toolbar/switcher sama; kontrol tab lokal, bukan URL):

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import PanelTabsHeader from '$lib/components/layout/PanelTabsHeader.svelte';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import PanelExpandButton from '$lib/components/layout/PanelExpandButton.svelte';
	import type { PanelTab } from '$lib/components/layout/PanelTabsHeader.svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, ExternalLinkIcon, MessageSquarePlusIcon, XIcon } from '$lib/icons';
	import { useClerkContext } from 'svelte-clerk';
	import ExploreThreadChat from '$lib/features/explore/components/ExploreThreadChat.svelte';
	import ThreadRecentSwitcher from '$lib/features/explore/components/ThreadRecentSwitcher.svelte';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
	import ProjectSourcesPanel from './ProjectSourcesPanel.svelte';
	import type { WorkspaceSection } from '../types';

	/** Panel kanan rumah proyek: chat ber-scope proyek + koleksi sumber + thread terbaru. */
	const TABS: PanelTab[] = [
		{ key: 'chat', label: 'Chat' },
		{ key: 'sources', label: 'Sumber' }
	];

	let {
		workspaceId,
		workspaceName,
		sections,
		activeTab,
		onTabChange,
		onClose
	}: {
		workspaceId: string;
		workspaceName: string;
		sections: WorkspaceSection[];
		activeTab: 'chat' | 'sources';
		onTabChange: (tab: 'chat' | 'sources') => void;
		onClose: () => void;
	} = $props();

	const clerk = useClerkContext();
	const recentThreads = useRecentThreadSummaries(
		() => clerk.isLoaded && Boolean(clerk.auth.userId),
		() => workspaceId
	);

	let activeThreadId = $state<string | null>(null);

	function openFull() {
		if (!activeThreadId) return;
		void goto(
			resolve('/app/(product)/projects/[projectId]/threads/[threadId]', {
				projectId: workspaceId,
				threadId: activeThreadId
			})
		);
	}
</script>

<SidePanelFrame>
	{#snippet header()}
		<PanelTabsHeader
			tabs={TABS}
			activeKey={activeTab}
			onSelect={(key) => onTabChange(key as 'chat' | 'sources')}
		>
			{#snippet actions()}
				<PanelExpandButton />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Tutup panel"
					onclick={onClose}
				>
					<Icon icon={XIcon} class="size-4" />
				</Button>
			{/snippet}
		</PanelTabsHeader>
	{/snippet}

	{#if activeTab === 'sources'}
		<ProjectSourcesPanel {workspaceId} {sections} />
	{:else}
		<PanelCardToolbar>
			{#snippet title()}
				<ThreadRecentSwitcher
					title={activeThreadId ? 'Thread' : 'Chat baru'}
					threads={recentThreads.data}
					onSelectThread={(id) => (activeThreadId = id)}
					onNewThread={() => (activeThreadId = null)}
					newLabel="Chat baru"
					emptyLabel="Belum ada thread di proyek ini"
				/>
			{/snippet}
			{#snippet actions()}
				{#if activeThreadId}
					<Button
						type="button"
						variant="ghost"
						size="icon"
						class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Buka thread penuh"
						onclick={openFull}
					>
						<Icon icon={ExternalLinkIcon} class="size-3.5" />
					</Button>
				{/if}
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Chat baru"
					onclick={() => (activeThreadId = null)}
				>
					<Icon icon={MessageSquarePlusIcon} class="size-3.5" />
				</Button>
			{/snippet}
		</PanelCardToolbar>

		<div class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-background">
			{#key activeThreadId ?? 'new'}
				<ExploreThreadChat {activeThreadId} {workspaceId} />
			{/key}
		</div>
	{/if}
</SidePanelFrame>
```

(`workspaceName` dipakai untuk aria/judul bila dibutuhkan — hapus prop bila akhirnya tak terpakai. Cek export ikon `ExternalLinkIcon`.)

- [ ] **Step 3: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → 0 error.
Manual: rumah proyek → tab Chat kirim pesan → jawaban Astra streaming, chip konteks proyek terlihat di composer, thread muncul di "thread terbaru" (scoped — proyek lain tidak melihatnya); cek DB `chat_threads.workspace_id` terisi. "Tulis dengan Astra" pada bab → panel chat terbuka dengan draft terisi. Tab Sumber: empty state tampil (link sumber diverifikasi penuh saat Perpustakaan Fase 3; bisa diuji via curl `POST /workspaces/:id/citations/:citationId/link` bila ingin).

```bash
git add apps/svelte/src/lib/features/workspaces/components/ProjectSourcesPanel.svelte apps/svelte/src/lib/features/workspaces/components/ProjectSidePanel.svelte
git commit -m "feat(svelte): project side panel with scoped chat, sources, and recent threads"
```

---

### Task 8: Route thread proyek, placeholder bab, dan rehome artifact reader

**Files:**
- Create: `apps/svelte/src/routes/app/(product)/projects/[projectId]/threads/[threadId]/+page.svelte`
- Create: `apps/svelte/src/routes/app/(product)/projects/[projectId]/sections/[sectionId]/+page.svelte`
- Create: `apps/svelte/src/routes/app/(product)/projects/[projectId]/artifacts/[artifactId]/+page.svelte`
- Modify: `apps/svelte/src/lib/features/thread-experience/components/ThreadDetailShell.svelte` (aktifkan Step 3(e) Task 4 bila ditunda)

**Interfaces:**
- Consumes: `ThreadDetailShell { threadId, workspace }` (Task 4), `useWorkspace`/`useSections`/labels (Task 1), `ArtifactReaderPageShell` (existing — baca props-nya di route workspaces lama sebelum menyalin).

- [ ] **Step 1: Route thread proyek**

`.../threads/[threadId]/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { Spinner } from '$lib/components/ui/spinner';
	import ThreadDetailShell from '$lib/features/thread-experience/components/ThreadDetailShell.svelte';
	import { useWorkspace } from '$lib/features/workspaces/api';
	import { projectDisplayTitle } from '$lib/features/workspaces/types';

	const projectId = $derived(page.params.projectId!);
	const threadId = $derived(page.params.threadId!);
	const workspace = useWorkspace(() => projectId);
</script>

{#if workspace.data}
	{#key threadId}
		<ThreadDetailShell
			{threadId}
			workspace={{ id: workspace.data.id, name: projectDisplayTitle(workspace.data) }}
		/>
	{/key}
{:else if workspace.isPending}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat proyek…</span>
	</div>
{:else}
	<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
		<p>Proyek tidak ditemukan.</p>
	</div>
{/if}
```

- [ ] **Step 2: Placeholder halaman bab (read-only — editor SuperDoc = Fase 4)**

`.../sections/[sectionId]/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { PageTitle } from '$lib/seo';
	import { Spinner } from '$lib/components/ui/spinner';
	import { useSections } from '$lib/features/workspaces/api';
	import { SECTION_STATUS_LABELS } from '$lib/features/workspaces/labels';

	const projectId = $derived(page.params.projectId!);
	const sectionId = $derived(page.params.sectionId!);
	const sections = useSections(() => projectId);
	const section = $derived(sections.data?.find((s) => s.id === sectionId) ?? null);
</script>

<PageTitle title={section?.title ?? 'Bab'} />

<div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
	{#if sections.isPending}
		<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Memuat bab…</span>
		</div>
	{:else if !section}
		<p class="text-muted-foreground">Bab tidak ditemukan.</p>
	{:else}
		<div class="flex items-center gap-2">
			<h1 class="font-display text-2xl font-bold">{section.title}</h1>
			{#if section.role === 'bibliography'}
				<Badge variant="outline">otomatis</Badge>
			{:else}
				<Badge variant="secondary">{SECTION_STATUS_LABELS[section.status]}</Badge>
			{/if}
		</div>
		<div class="rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground">
			{#if section.role === 'bibliography'}
				<p>Daftar pustaka digenerate otomatis dari sitasi yang terpakai di bab-bab — hadir bersama editor.</p>
			{:else}
				<p>Editor dokumen untuk bab ini hadir di pembaruan berikutnya. Sementara itu, brainstorm dan kumpulkan sumber dari rumah proyek.</p>
			{/if}
		</div>
		<Button
			href={resolve('/app/(product)/projects/[projectId]', { projectId })}
			variant="outline"
			class="w-fit"
		>
			Kembali ke proyek
		</Button>
	{/if}
</div>
```

(Cek apakah `Button` mendukung `href` di versi shadcn-svelte terpasang; bila tidak, pakai `<a>` dengan class button recipe.)

- [ ] **Step 3: Rehome artifact reader**

Salin isi `apps/svelte/src/routes/app/(product)/workspaces/[workspaceId]/artifacts/[artifactId]/+page.svelte` ke `.../projects/[projectId]/artifacts/[artifactId]/+page.svelte`, ganti pembacaan param `workspaceId` → `projectId` (nilai tetap workspace id). Lalu cari semua `resolve()`/link internal `ArtifactReaderPageShell` yang menunjuk route workspaces lama (`/usr/bin/grep -rn "workspaces/\[workspaceId\]" apps/svelte/src`) — arahkan ke route projects baru.

- [ ] **Step 4: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → 0 error (termasuk Step 3(e) Task 4 kini valid).
Manual: dari panel chat proyek klik "buka penuh" → thread full-page dengan chip konteks + judul proyek; thread BARU dari halaman itu (URL bind) tetap di bawah `/app/projects/...`; klik bab dari kerangka → placeholder tampil; buka artifact dari sumber → reader tampil.

```bash
git add "apps/svelte/src/routes/app/(product)/projects" apps/svelte/src/lib/features/thread-experience/components/ThreadDetailShell.svelte
git commit -m "feat(svelte): project-scoped thread, section placeholder, and artifact reader routes"
```

---

### Task 9: Sidebar baru + ⌘K + placeholder Perpustakaan

**Files:**
- Rewrite: `apps/svelte/src/lib/components/layout/AppSidebar.svelte`
- Create: `apps/svelte/src/routes/app/(product)/library/+page.svelte`

**Interfaces:**
- Consumes: `useWorkspacesList` (langsung — tanpa `useWorkspaceIndexData`), `NewProjectDialog` (Task 5), `Sidebar.*`, `SidebarSection`, `NavUser`, `projectDisplayTitle`.
- Produces: sidebar final — nav Beranda/Perpustakaan/Jelajahi/Pengaturan + section Proyek; recent-threads global HILANG.

- [ ] **Step 1: Placeholder `/app/library`**

`apps/svelte/src/routes/app/(product)/library/+page.svelte`:

```svelte
<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import { Icon, BookOpenIcon } from '$lib/icons';
</script>

<PageTitle title="Perpustakaan" />

<div class="flex h-svh flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
	<Icon icon={BookOpenIcon} class="size-8 text-muted-foreground" />
	<h1 class="font-display text-xl font-bold">Perpustakaan</h1>
	<p class="max-w-sm text-sm text-muted-foreground">
		Semua referensimu lintas proyek akan dikelola di sini — hadir di pembaruan berikutnya.
	</p>
</div>
```

(Cek nama ikon buku yang diekspor `$lib/icons`.)

- [ ] **Step 2: Rewrite `AppSidebar.svelte`**

Ganti isi file (pertahankan `sidebarItemClass`, header toggle/⌘K, `NavUser`, `SidebarSection`; buang seluruh bagian threads):

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Command from '@aqsha/ui-svelte/components/command';
	import NavUser from './NavUser.svelte';
	import SidebarSection from './sidebar/SidebarSection.svelte';
	import NewProjectDialog from '$lib/features/workspaces/components/NewProjectDialog.svelte';
	import { useWorkspacesList } from '$lib/features/workspaces/api';
	import { projectDisplayTitle, type Workspace } from '$lib/features/workspaces/types';
	import {
		Icon,
		BookOpenIcon,
		HomeIcon,
		LayoutGridIcon,
		PanelLeftIcon,
		PlusIcon,
		SearchIcon,
		SettingsIcon,
		TrendingUpIcon
	} from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Rail navigasi kiri IA project-first: Beranda, Perpustakaan, Jelajahi, Pengaturan +
	 * daftar proyek (urut aktivitas). Thread tidak lagi global — hidup di dalam proyek.
	 */
	const PROJECTS_COLLAPSED_STORAGE_KEY = 'aqsha:sidebar:projects-collapsed';
	const sidebarItemBaseClass =
		'gap-2 font-medium transition-[background-color,color,box-shadow] duration-150 ease-out hover:bg-muted/60 data-active:bg-primary/10 data-active:font-medium data-active:text-foreground data-active:shadow-none data-active:[&_svg]:text-primary hover:text-foreground active:bg-muted active:text-foreground [&_svg]:size-3.5';

	function sidebarItemClass(active?: boolean) {
		return cn(
			sidebarItemBaseClass,
			active
				? 'bg-primary/10 text-foreground [&_svg]:text-primary'
				: 'text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground'
		);
	}

	const sidebar = Sidebar.useSidebar();
	const clerk = useClerkContext();
	const list = useWorkspacesList(
		() => false,
		() => clerk.isLoaded && Boolean(clerk.auth.userId)
	);
	const projects = $derived<Workspace[]>(list.data?.pages.flatMap((p) => p.items) ?? []);

	let commandOpen = $state(false);
	let createDialogOpen = $state(false);

	const pathname = $derived(page.url.pathname);
	const selectedProjectId = $derived(page.params.projectId);
	const isHomeActive = $derived(pathname === '/app');
	const isLibraryActive = $derived(pathname.startsWith('/app/library'));
	const isExploreActive = $derived(pathname.startsWith('/app/explore'));
	const isSettingsActive = $derived(pathname.startsWith('/app/settings'));

	function closeSidebar() {
		if (sidebar.isMobile) {
			sidebar.setOpenMobile(false);
			return;
		}
		sidebar.setOpen(false);
	}

	function runCreateProject() {
		commandOpen = false;
		createDialogOpen = true;
	}

	function handleShortcut(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			commandOpen = true;
		}
	}
</script>

<svelte:window onkeydown={handleShortcut} />

{#snippet projectEmojiGlyph(emoji: string | null, active: boolean)}
	<span
		aria-hidden="true"
		class={cn(
			'flex size-4 shrink-0 items-center justify-center rounded-sm text-[13px] leading-none',
			active ? 'bg-background/70' : 'bg-muted/35'
		)}
	>
		{emoji?.trim() || '📚'}
	</span>
{/snippet}

{#snippet navItem(href: string, label: string, icon: unknown, active: boolean)}
	<Sidebar.MenuItem class="min-w-0 overflow-hidden">
		<Sidebar.MenuButton isActive={active} size="rail" class={sidebarItemClass(active)}>
			{#snippet child({ props })}
				<a {...props} {href}>
					<Icon {icon} class="size-3.5 shrink-0" />
					<span>{label}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

<Sidebar.Root collapsible="offcanvas" variant="inset">
	<Sidebar.Header class="gap-3 px-3 pb-3 pt-3.5">
		<div class="flex items-center gap-1.5 pl-1.5 pr-2.5">
			<button
				type="button"
				onclick={closeSidebar}
				class="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
				aria-label="Tutup sidebar kiri"
			>
				<Icon icon={PanelLeftIcon} class="size-3.5" />
			</button>
			<button
				type="button"
				onclick={() => (commandOpen = true)}
				class="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
				aria-label="Cari proyek"
			>
				<Icon icon={SearchIcon} class="size-3.5" />
			</button>
		</div>

		<Sidebar.Menu class="gap-1">
			{@render navItem(resolve('/app/(product)'), 'Beranda', HomeIcon, isHomeActive)}
			{@render navItem(resolve('/app/(product)/library'), 'Perpustakaan', BookOpenIcon, isLibraryActive)}
			{@render navItem(resolve('/app/(product)/explore'), 'Jelajahi', TrendingUpIcon, isExploreActive)}
			{@render navItem(resolve('/app/(console)/settings'), 'Pengaturan', SettingsIcon, isSettingsActive)}
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="min-h-0 px-3 pb-3 pt-2">
		<SidebarSection label="Proyek" first collapsible storageKey={PROJECTS_COLLAPSED_STORAGE_KEY}>
			{#snippet action()}
				<button
					type="button"
					onclick={runCreateProject}
					class="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
					aria-label="Proyek baru"
				>
					<Icon icon={PlusIcon} class="size-3.5" />
				</button>
			{/snippet}
			{#if projects.length > 0}
				<Sidebar.Menu class="min-w-0 gap-1 overflow-hidden">
					{#each projects as project (project.id)}
						{@const active = project.id === selectedProjectId}
						<Sidebar.MenuItem class="min-w-0 overflow-hidden">
							<Sidebar.MenuButton
								isActive={active}
								size="rail"
								class={cn(sidebarItemClass(active), 'w-full min-w-0 max-w-full overflow-hidden')}
							>
								{#snippet child({ props })}
									<a
										{...props}
										href={resolve('/app/(product)/projects/[projectId]', { projectId: project.id })}
									>
										{@render projectEmojiGlyph(project.emoji, active)}
										<span class="min-w-0 flex-1 truncate font-normal">
											{projectDisplayTitle(project)}
										</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			{:else}
				<div
					class="rounded-sm border border-dashed border-border/70 px-2.5 py-2 text-label font-medium leading-5 text-muted-foreground"
				>
					Belum ada proyek.
				</div>
			{/if}
		</SidebarSection>
	</Sidebar.Content>

	<Sidebar.Footer class="mt-auto gap-3 p-3">
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>

<Command.Dialog bind:open={commandOpen}>
	<Command.Input placeholder="Cari atau buat..." />
	<Command.List>
		<Command.Empty>Tidak ada hasil.</Command.Empty>
		<Command.Group heading="Buat">
			<Command.Item onSelect={runCreateProject}>
				<Icon icon={LayoutGridIcon} class="size-4" />
				Proyek baru
			</Command.Item>
		</Command.Group>
		<Command.Group heading="Buka">
			<Command.Item
				value="buka-beranda"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/(product)'));
				}}
			>
				<Icon icon={HomeIcon} class="size-4" />
				Beranda
			</Command.Item>
			<Command.Item
				value="buka-perpustakaan"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/(product)/library'));
				}}
			>
				<Icon icon={BookOpenIcon} class="size-4" />
				Perpustakaan
			</Command.Item>
			<Command.Item
				value="buka-jelajahi"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/(product)/explore'));
				}}
			>
				<Icon icon={TrendingUpIcon} class="size-4" />
				Jelajahi
			</Command.Item>
			<Command.Item
				value="buka-pengaturan"
				onSelect={() => {
					commandOpen = false;
					goto(resolve('/app/settings/overview'));
				}}
			>
				<Icon icon={SettingsIcon} class="size-4" />
				Pengaturan
			</Command.Item>
		</Command.Group>
		{#if projects.length > 0}
			<Command.Group heading="Proyek">
				{#each projects as project (project.id)}
					<Command.Item
						value={`project-${project.id}`}
						keywords={[projectDisplayTitle(project)]}
						onSelect={() => {
							commandOpen = false;
							goto(resolve('/app/(product)/projects/[projectId]', { projectId: project.id }));
						}}
					>
						{@render projectEmojiGlyph(project.emoji, false)}
						<span class="truncate">{projectDisplayTitle(project)}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>

<NewProjectDialog open={createDialogOpen} onOpenChange={(open) => (createDialogOpen = open)} />
```

Catatan: route id `resolve('/app/(console)/settings')` — cek id yang valid (redirect server `/app/settings` → `/app/settings/overview` sudah ada); bila `resolve` menolak, pakai id leaf `resolve('/app/(console)/settings/overview')`. Tipe param `icon` pada snippet `navItem`: samakan dengan tipe `Icon` existing (`import type { IconType } ...` — lihat `$lib/icons`).

- [ ] **Step 3: Verifikasi manual + commit**

Run: `cd apps/svelte && bun run check && cd ../..` → 0 error.
Manual: sidebar menampilkan 4 nav + Proyek; active state benar di beranda/perpustakaan/jelajahi/pengaturan/proyek; tidak ada daftar thread; ⌘K memuat grup Buat/Buka/Proyek; "Proyek baru" dari sidebar & ⌘K membuka dialog.

```bash
git add apps/svelte/src/lib/components/layout/AppSidebar.svelte "apps/svelte/src/routes/app/(product)/library"
git commit -m "feat(svelte): project-first sidebar and library placeholder route"
```

---

### Task 10: Hapus route & komponen lama (tanpa redirect) + sweep dead code

**Files:**
- Delete: `apps/svelte/src/routes/app/(product)/workspaces/` (seluruh subtree: index, `[workspaceId]`, artifacts)
- Delete: `apps/svelte/src/routes/app/(product)/threads/` (thread global)
- Modify: `apps/svelte/src/lib/features/thread-experience/components/ThreadLandingSurface.svelte` (lepas bagian discovery beranda)
- Modify: `apps/svelte/src/lib/features/explore/**` (lepas chat tersemat explore)
- Delete: komponen orphan (inventaris di Step 2)

**Interfaces:** tidak ada API baru — task ini murni pengurangan; gate = svelte-check hijau + tidak ada `resolve()` ke route mati.

- [ ] **Step 1: Hapus route lama**

```bash
git rm -r "apps/svelte/src/routes/app/(product)/workspaces" "apps/svelte/src/routes/app/(product)/threads"
```

- [ ] **Step 2: Sweep referensi & orphan — dituntun svelte-check + grep**

Jalankan `cd apps/svelte && bun run check` lalu perbaiki semua merah dengan aturan:
1. Referensi `resolve('/app/(product)/threads/[threadId]', …)` / `.../workspaces/[workspaceId]` yang tersisa: kalau konteksnya punya `workspaceId` → arahkan ke route projects; kalau tidak (fitur global yang memang mati) → hapus affordance-nya. Cari: `/usr/bin/grep -rn "threads/\[threadId\]\|workspaces/\[workspaceId\]" apps/svelte/src`.
2. `ThreadLandingSurface.svelte`: hapus render + import `HomeBannerCarousel`, `HomeExploreBento`, `ExploreHandwrittenCue` (hero landing kini hanya judul + composer + saran — dipakai thread baru dalam proyek).
3. Explore: hapus pemakaian `ExploreChatSidePanel` (chat global) dari halaman explore/paper reader; `ExploreThreadChat` TETAP (dipakai `ProjectSidePanel`). Alur "Simpan ke proyek" (WorkspacePicker) TETAP.
4. Hapus komponen yang tidak lagi punya consumer (verifikasi tiap kandidat dengan `/usr/bin/grep -rln "<NamaKomponen" apps/svelte/src` sebelum `git rm`): `WorkspacesIndexPage.svelte`, `WorkspaceDetailClient.svelte`, `WorkspaceSidePanel.svelte`, `WorkspaceLibraryBoard/Surface/Grid`, `WorkspaceBoardToolbar.svelte`, `CreateWorkspacePopover.svelte`, `ExploreChatSidePanel.svelte`, `HomeBannerCarousel.svelte`, `HomeExploreBento.svelte`, `ExploreHandwrittenCue.svelte`, `ThreadArchiveGroup.svelte`, `workspace-panel-context.svelte.ts`, dan bagian `use-workspaces-data.ts` yang hanya melayani sidebar lama (threads merge / `SidebarThread` / `SidebarWorkspace`) — pangkas atau hapus file bila seluruh isinya orphan (cek dulu consumer lain seperti hooks artifacts).
5. Hooks yang jadi orphan (mis. `usePinnedThreads` bila tak ada consumer tersisa, `useThreadSources` TIDAK — masih dipakai panel thread): hapus hanya yang benar-benar tanpa consumer.
6. JANGAN hapus: `CitationsPanel` + wizard citations (Fase 3), `ThreadActionsMenu`, `WorkspacePicker`, `ArtifactReaderPageShell`, `LibraryArtifactCard` bila masih dipakai reader/explore.

- [ ] **Step 3: Verifikasi + commit**

Run: `cd apps/svelte && bun run check && bun run test && cd ../..`
Expected: 0 error; test unit svelte (journey/onboarding dll.) tetap hijau.
Manual: `/app/workspaces` dan `/app/threads/<id>` → 404 (tanpa redirect — sesuai keputusan); alur inti (beranda → proyek → chat → thread penuh → bab) tetap jalan; explore terbuka tanpa panel chat.

```bash
git add -u apps/svelte/src
git status   # pastikan hanya file svelte terkait sweep; WIP lain tetap utuh
git commit -m "feat(svelte)!: remove legacy workspace board and global thread routes"
```

(`git add -u` di-scope `apps/svelte/src` — aman untuk deletions; JANGAN tambah path lain.)

---

### Task 11: Migration `chat_threads.workspace_id` NOT NULL + cascade

**Files:**
- Modify: `packages/db/src/schema/chatThreads.ts`
- Create: `packages/db/migrations/00XX_*.sql` (via drizzle-kit, lalu diedit)
- Modify: test yang menyisipkan `chat_threads` tanpa workspace (cari di `packages/db/test`, `packages/services/test`, `apps/api/test`)
- Modify (bila tsc menuntut): `packages/services/src/**` (`ThreadService.ensureProjected`), `apps/agent/src/mastra/processors/thread-projection.ts`

**Interfaces:**
- Produces: kolom `chat_threads.workspace_id` NOT NULL, FK `onDelete: "cascade"` (hapus proyek ⇒ thread ikut terhapus; `set null` tak valid lagi).

- [ ] **Step 1: Schema**

Di `chatThreads.ts` ganti definisi kolom:

```ts
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
```

dan perbarui komentar header (`workspaceId` kini wajib — semua chat lahir dalam proyek; cascade ikut proyek).

- [ ] **Step 2: Generate + edit migration**

Run: `bun run db:generate` (gotcha: bila drizzle-kit meminta prompt interaktif, jalankan via python pty seperti Fase 1). Baca SQL hasilnya — harus `ALTER TABLE ... ALTER COLUMN workspace_id SET NOT NULL` + perubahan FK ke cascade. **Prepend** baris ini di paling atas file migration (thread dev lama tanpa proyek dibuang — keputusan tanpa-backfill spec):

```sql
DELETE FROM "chat_threads" WHERE "workspace_id" IS NULL;
```

Run: `bun run db:migrate` → exit 0.

- [ ] **Step 3: Rambatan tipe (tsc-driven)**

Run: `bun run build:dist`, lalu typecheck `packages/services` + `apps/api` + `apps/agent`. `NewChatThread.workspaceId` kini wajib string:
- `ThreadService.ensureProjected`: jalur INSERT wajib `workspaceId` — bila `null` (klien tak mengirim RequestContext), **skip insert + `console.error` sekali** (proyeksi best-effort; jangan meracuni turn). Jalur UPDATE: jangan menyentuh `workspaceId` saat null.
- Test fixture yang insert `chat_threads`: tambahkan workspace nyata (insert `workspaces` dulu, FK) + `workspaceId`.

- [ ] **Step 4: Test + commit**

Run:
```bash
cd packages/db && DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) bun test && cd ../..
cd packages/services && bun test && cd ../..
cd apps/api && bun test && cd ../..
```
Expected: PASS semua.
Manual: kirim chat dari proyek → thread terproyeksi; hapus (arsip) proyek TIDAK menghapus thread (arsip = soft); `delete from workspaces where id=...` di DB dev menghapus thread ikutannya (cascade).

```bash
git add packages/db/src/schema/chatThreads.ts packages/db/migrations packages/db/test packages/services apps/api apps/agent
git status   # review: hanya file rambatan task ini
git commit -m "feat(db)!: chat_threads.workspace_id NOT NULL with cascade delete"
```

---

### Task 12: Onboarding + PRODUCT.md/DESIGN.md + gate akhir fase

**Files:**
- Modify: `apps/svelte/src/lib/features/onboarding/lib/onboarding-content.ts`
- Modify: `apps/svelte/PRODUCT.md`
- Modify: `apps/svelte/DESIGN.md` (hanya bila menyebut IA lama — cek dulu)
- Modify (bila test copy gagal): `apps/svelte/src/lib/features/onboarding/lib/*.spec.ts`

- [ ] **Step 1: Copy onboarding — "kamu lagi nulis apa?" sebagai pembuka**

Di `ONBOARDING_COPY` ganti entri `welcome` dan `finish`:

```ts
	welcome: {
		title: 'Kamu lagi nulis apa?',
		description:
			'Skripsi, artikel jurnal, atau ide yang masih mentah — semuanya dimulai dari satu proyek. Kita siapkan arahmu di sini.'
	},
```

```ts
	finish: {
		title: 'Rasa penasaranmu sekarang punya rumah.',
		description: 'Buat proyek pertamamu — Aqsha membantu mencari dan memeriksa; keputusan akhirnya tetap milikmu.'
	}
```

`STEP_HAND_NOTE.welcome`: ganti ke `'mulai dari proyek pertamamu'`. Struktur step machine TIDAK berubah. Jalankan `cd apps/svelte && bun run test` — perbarui assertion copy di spec onboarding/journey bila ada yang mengunci string lama.

- [ ] **Step 2: PRODUCT.md**

Di bagian **Product Purpose**, ganti kalimat pertama menjadi:

> Aqsha keeps research and writing in one place, organized around the student's actual deliverable: a writing project (thesis, journal article, proposal) with an editable chapter outline, a per-project source collection drawn from one account-wide library, and Astra chat that always works inside a project's context.

Dan di **Users** (kalimat "The job to be done…"), tambahkan setelahnya:

> The product's home is the project list, and a project's home is its chapter outline — chat and sources orbit the writing, not the other way around.

Sweep sebutan "workspaces/artifacts" yang menggambarkan IA lama → "projects" seperlunya (jangan menulis ulang seluruh dokumen).

- [ ] **Step 3: DESIGN.md**

`/usr/bin/grep -n "workspace" apps/svelte/DESIGN.md` — DESIGN.md adalah sistem visual; hanya perbarui kalimat yang menyebut IA lama (bila ada). Tanpa perubahan token/komponen.

- [ ] **Step 4: Gate akhir Fase 2**

Run (dari root):
```bash
bun run build:dist && bun run typecheck && bun run test
cd apps/svelte && bun run check && bun run test && bun run lint && cd ../..
```
Expected: hijau, KECUALI `apps/web` di typecheck root (merah by design sejak Fase 1 — jangan diperbaiki).

Checklist E2E manual (dev server, akun dev):
1. Onboarding selesai → mendarat di `/app` daftar proyek (empty state "Kamu lagi nulis apa?").
2. Buat proyek skripsi (topik saja) → rumah proyek tahap eksplorasi, 6 bab template.
3. Chat di panel proyek → chip "nama proyek" terlihat, jawaban streaming, `chat_threads.workspace_id` terisi, thread muncul di switcher proyek itu saja.
4. "Tulis dengan Astra" bab 2 → draft masuk composer.
5. Ubah status bab → progress beranda ikut; ubah tahap via stepper; atur tenggat.
6. Buka thread penuh `/app/projects/:id/threads/:tid`; buka bab (placeholder); `/app/library` placeholder; `/app/workspaces` 404.
7. Proyek `bebas` → tanpa stepper/kerangka.
8. Cek dark mode + keyboard di dialog Proyek baru & stepper (WCAG 2.2 AA).

Konsultasikan `docs/product/versioning-and-changelog.md`: `apps/svelte` belum cutover/live → kemungkinan besar TIDAK butuh entri changelog; catat keputusannya di PR.

- [ ] **Step 5: Commit penutup**

```bash
git add apps/svelte/src/lib/features/onboarding apps/svelte/PRODUCT.md apps/svelte/DESIGN.md
git commit -m "feat(svelte): project-first onboarding copy and product docs"
```

---

## Self-Review (sudah dijalankan penulis plan)

- **Spec coverage Fase 2**: beranda daftar proyek + dialog tanpa friksi (Task 5), rumah proyek tiga zona + freeform (Task 6–7), route projects/sections/threads + artifact rehome (Task 8), sidebar baru tanpa recent-threads global + Perpustakaan/Jelajah/Pengaturan (Task 9), hapus route lama tanpa redirect + composer hanya dalam konteks proyek (Task 10, termasuk pencabutan chat explore), `workspaceId` → RequestContext `aqsha-workspace-id` (Task 4), migration NOT NULL deviasi Fase 1 (Task 11), PRODUCT/DESIGN + onboarding (Task 12).
- **Placeholder scan**: tidak ada TBD; task sweep (2, 10) memakai aturan transformasi eksplisit + svelte-check-driven dengan perintah verifikasi, mengikuti preseden plan Fase 1. Titik yang bergantung API library pihak ketiga (bentuk `Select`, `requestContext` client-js, method `ComposerMentions`) diberi instruksi verifikasi eksplisit terhadap kode terpasang.
- **Konsistensi tipe**: `WorkspaceKind/Stage/SectionStatus/WorkspaceSection` (Task 1) dipakai Task 5–9; `useWorkspaceCitations/useLinkCitation/useUnlinkCitation/useAssignCitationSection` (Task 2) dipakai Task 7; `useThreadsList(enabled, workspaceId)`/`useRecentThreadSummaries(enabled, workspaceId)` (Task 3) dipakai Task 4 & 7; `ThreadDetailShell.workspace`/`ExploreThreadChat.workspaceId`/`threadUrlFor` (Task 4) dipakai Task 7–8; `NewProjectDialog { open, onOpenChange }` (Task 5) dipakai Task 9; `ProjectSidePanel` props (Task 7) cocok dengan pemanggil di Task 6.
- **Deviasi tercatat** di Global Constraints (8 butir) untuk direview user di PR.
