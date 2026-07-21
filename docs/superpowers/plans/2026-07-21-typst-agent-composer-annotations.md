# Agent Typst, Composer, Proposal, dan Anotasi Proyek Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat Astra sadar proyek Typst secara implisit, menghasilkan proposal patch tervalidasi yang ditinjau sebagai diff per-hunk, serta memberi anotasi lifecycle Clear tiga detik yang tidak mengganggu preview.

**Architecture:** Thread proyek tetap menjadi otoritas scope. Input processor menambahkan manifest kecil proyek aktif per turn; source Typst, RAG, dan bibliografi dibaca on-demand melalui tool yang sudah owner-scoped. Proposal disimpan sebagai satu pending record dengan CAS + dry-run compile, lalu ditampilkan sebagai diff CodeMirror-adjacent; preview SVG hanya menerima banner review. Anotasi disimpan terpisah dan dismiss batch dilakukan setelah countdown UI selesai.

**Tech Stack:** Svelte 5 runes, SvelteKit, TanStack Svelte Query, CodeMirror 6, Typst worker (`@myriaddreamin/typst.ts`), Elysia, Mastra, Drizzle/Postgres, `diff`, Bun test, Vitest Browser/Playwright.

## Global Constraints

- Gunakan Bun `1.3.10`; jangan gunakan npm, pnpm, atau yarn.
- Pertahankan `apps/svelte` runes-only dan boundary Typst: compile/render tetap di Worker, main thread hanya memasang SVG serta UI.
- Worktree sudah dirty, termasuk `AnnotationModeLayer.svelte` dan `annotation-agentation.svelte.ts`; perlakukan sebagai baseline pengguna, jangan reset, checkout, atau hapus perubahan yang tidak terkait.
- Astra hanya dapat membuat proposal patch terhadap dokumen Typst tunggal dari proyek thread aktif. `@mention` lintas proyek/dokumen bersifat read-only dan tetap harus lolos owner scope.
- Context proyek aktif tidak boleh menghasilkan chip/pill composer otomatis. `@mention` manual tetap visible dan prioritas.
- RAG default dibatasi proyek aktif dan dipakai bila relevan; Citation Library global hanya dipakai atas permintaan eksplisit atau setelah sumber proyek tidak cukup.
- Hanya satu proposal `pending` per proyek. Proposal baru harus mengembalikan konflik terstruktur, bukan men-supersede proposal lama.
- Semua proposal harus dry-run compile dengan BibTeX proyek; Astra maksimal tiga percobaan proposal per turn edit. Source resmi hanya berubah di Accept.
- Clear annotation adalah dismiss batch yang ditunda tiga detik dan dapat dibatalkan; ia tidak menghapus chip composer ataupun riwayat.
- Gunakan `$lib/icons` / `@aqsha/ui-svelte`; jangan mengimpor `lucide-*` langsung.
- Komentar shipped code menjelaskan alasan/constraint yang tidak jelas dari code, bukan fase, tiket, atau dokumen rencana ini.

---

## File Structure

| File | Tanggung jawab |
| --- | --- |
| `packages/db/src/schema/documentEditProposals.ts` | Menyimpan `resubmitInstruction` yang aman untuk prefill proposal basi. |
| `packages/db/src/repositories/documentEditProposalRepo.ts` | Insert pending atomik tanpa menimpa pending lama. |
| `packages/db/migrations/0045_typst_proposal_resubmit.sql` | Menambahkan kolom proposal kompatibel dengan baris historis. |
| `packages/services/src/typst/document-proposal.service.ts` | Union konflik pending, persist instruction, CAS/compile lifecycle. |
| `packages/services/src/annotation.service.ts` dan `packages/db/src/repositories/documentAnnotationRepo.ts` | Dismiss batch yang workspace-scoped dan memperbaiki bulk status guard. |
| `apps/api/src/routes/workspaces.ts` | Endpoint batch dismiss yang terautentikasi. |
| `apps/agent/src/mastra/processors/workspace-project-manifest.ts` | Manifest kecil proyek aktif per turn. |
| `apps/agent/src/mastra/tools/get-document-source.ts` | Source/anotasi aktif + status proposal ringkas yang trusted. |
| `apps/agent/src/mastra/tools/search-thread-documents.ts` | Default RAG ke proyek thread, mention lintas proyek eksplisit tetap owner-scoped. |
| `apps/agent/src/mastra/tools/propose-document-edit.ts` | Kontrak `resubmitInstruction`, batas tiga proposal, dan hasil konflik. |
| `apps/agent/src/mastra/instructions.ts` | Urutan source/RAG/referensi, behavior pending, dan respons proposal. |
| `apps/svelte/src/lib/features/document/api.ts` | Mutation dismiss batch, proposal type, dan invalidasi proposal setelah manual save. |
| `apps/svelte/src/lib/features/document/components/AnnotationClearToolbar.svelte` | Countdown Clear tiga detik dan Cancel yang dapat diuji. |
| `apps/svelte/src/lib/features/document/components/TypstPreview.svelte` | Memasang toolbar Clear dan banner Tinjau tanpa mengubah SVG. |
| `apps/svelte/src/lib/features/document/lib/proposal-hunk-label.ts` | Label heading Typst paling dekat untuk tiap hunk. |
| `apps/svelte/src/lib/features/document/components/ProposalReviewCard.svelte` | Reviewer read-only per-hunk, stale action, dan label section. |
| `apps/svelte/src/lib/features/document/lib/proposal-review-interactions.svelte.ts` | Context reactive untuk CTA proposal di chat tanpa prop drilling. |
| `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte` | Orkestrasi tabs, review state, autosave stale, chips, Clear, dan prefill resubmit. |
| `apps/svelte/src/lib/features/threads/lib/mastra-timeline.ts` dan `timeline-types.ts` | Mengubah hasil `propose_document_edit` sukses menjadi bagian CTA terstruktur. |
| `apps/svelte/src/lib/features/threads/components/{AssistantMessage,MessageList}.svelte` | Merender CTA Tinjau di respons agent. |
| `apps/svelte/src/lib/features/document/components/ProposalReviewCTA.svelte` | Tombol chat yang hanya aktif bila proposal pending ID-nya cocok. |

## Interface Contracts

```ts
// packages/services/src/typst/document-proposal.service.ts
export type ProposeDocumentEditResult =
  | { ok: true; proposalId: string; summary: string }
  | { ok: false; reason: 'compile_error'; compileErrors: TypstDiagnostic[] }
  | { ok: false; reason: 'edit_mismatch'; message: string }
  | { ok: false; reason: 'pending_proposal'; proposalId: string; summary: string; isStale: boolean }
  | { ok: false; reason: 'retry_exhausted'; message: string };

export type PendingProposalView = {
  id: string;
  workspaceId: string;
  baseVersion: number;
  proposedSource: string;
  summary: string;
  resubmitInstruction: string;
  annotationIds: string[];
  threadId: string | null;
  createdAt: number;
  currentSource: string;
  currentVersion: number;
  isStale: boolean;
  hunks: ProposalHunk[];
};

// apps/svelte/src/lib/features/document/api.ts
export function useDismissWorkspaceAnnotations(
  workspaceId: () => string
): { mutateAsync(input: { ids: string[] }): Promise<{ ok: true }> };

// apps/svelte/src/lib/features/document/lib/proposal-hunk-label.ts
export function proposalHunkLabel(source: string, hunk: ProposalHunk): string;
// Returns the closest previous Typst heading, otherwise `Baris <start>–<end>`.
```

### Task 1: Persist instruction resubmit dan cegah supersede proposal

**Files:**
- Create: `packages/db/migrations/0045_typst_proposal_resubmit.sql`
- Modify: `packages/db/src/schema/documentEditProposals.ts:16-45`
- Modify: `packages/db/src/repositories/documentEditProposalRepo.ts:9-66`
- Modify: `packages/services/src/typst/document-proposal.service.ts:20-364`
- Test: `packages/services/test/document-proposal.test.ts`

**Interfaces:**
- Consumes: `DocumentEditProposalRepo.findPendingByWorkspace(ownerUserId, workspaceId)` and the existing partial unique index.
- Produces: `resubmitInstruction` on every `PendingProposalView` and a `pending_proposal` failure union. The agent tool and Svelte API consume these names verbatim.

- [ ] **Step 1: Write service tests for instruction persistence and pending conflict**

First add this helper below `resetDoc` so every test can leave a clean pending-proposal lifecycle:

```ts
async function rejectPendingProposal(): Promise<void> {
  const pending = await DocumentProposalService.getPending(db, { ownerUserId: OWNER, workspaceId: WS });
  if (pending) await DocumentProposalService.reject(db, { ownerUserId: OWNER, proposalId: pending.id });
}
```

At the end of the existing `propose fullSource valid` test, call `await rejectPendingProposal()`. At the start of each later integration test that creates a proposal, call the same helper before `resetDoc`. Change the existing invalid-compile assertion from “Pending sebelumnya tetap” to `expect(pending).toBeNull()`: a new invalid candidate is only compiled when no pending proposal blocks it.

Then add this case after the first valid proposal test. It rejects its own proposal at the end so later cases retain isolated lifecycle.

```ts
itest('proposal pending menyimpan instruksi susun ulang dan menolak proposal kedua', async () => {
  await rejectPendingProposal();
  await resetDoc('= Pendahuluan\n\nVersi awal.\n');
  const first = await DocumentProposalService.propose(db, {
    ownerUserId: OWNER,
    workspaceId: WS,
    fullSource: '= Pendahuluan\n\nVersi revisi.\n',
    summary: 'Perbaiki pembuka',
    resubmitInstruction: 'Perbaiki paragraf pembuka agar lebih jelas.',
    enforceRateLimit: false,
  });
  if (!first.ok) throw new Error('proposal pertama harus tersimpan');

  const pending = await DocumentProposalService.getPending(db, { ownerUserId: OWNER, workspaceId: WS });
  expect(pending?.resubmitInstruction).toBe('Perbaiki paragraf pembuka agar lebih jelas.');

  const second = await DocumentProposalService.propose(db, {
    ownerUserId: OWNER,
    workspaceId: WS,
    fullSource: '= Pendahuluan\n\nVersi lain.\n',
    summary: 'Jangan mengganti proposal pertama',
    resubmitInstruction: 'Instruksi lain.',
    enforceRateLimit: false,
  });
  expect(second).toEqual({
    ok: false,
    reason: 'pending_proposal',
    proposalId: first.proposalId,
    summary: 'Perbaiki pembuka',
    isStale: false,
  });

  const row = await DocumentEditProposalRepo.findById(db, OWNER, first.proposalId);
  expect(row?.status).toBe('pending');
  await DocumentProposalService.reject(db, { ownerUserId: OWNER, proposalId: first.proposalId });
});
```

- [ ] **Step 2: Run the focused service test to confirm it fails**

Run: `bun run --filter '@aqsha/services' test test/document-proposal.test.ts`

Expected: FAIL because `resubmitInstruction` is not accepted and the second proposal supersedes the first.

- [ ] **Step 3: Add the schema and deterministic migration**

In `documentEditProposals`, add a non-null text field with an empty default for historical rows:

```ts
resubmitInstruction: text('resubmit_instruction').notNull().default(''),
```

Create `packages/db/migrations/0045_typst_proposal_resubmit.sql` with:

```sql
ALTER TABLE "document_edit_proposals"
  ADD COLUMN "resubmit_instruction" text NOT NULL DEFAULT '';
```

Run `bun run db:generate -- --name typst_proposal_resubmit` and keep the generated snapshot/journal only if it produces the same schema change; do not hand-edit an unrelated migration.

- [ ] **Step 4: Replace supersede-on-create with conflict-aware insert**

Replace `supersedePendingByWorkspace` with an insert helper that reports whether the partial unique index accepted the row:

```ts
async insertPendingIfAbsent(db: DbOrTx, row: NewDocumentEditProposal): Promise<boolean> {
  const inserted = await db
    .insert(documentEditProposals)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: documentEditProposals.id });
  return inserted.length === 1;
}
```

Delete `supersedePendingByWorkspace`; no caller may change an existing `pending` row during creation.

In `DocumentProposalService.propose`, check the current pending proposal before `consumeCompileQuota`. If found, return:

```ts
return {
  ok: false,
  reason: 'pending_proposal',
  proposalId: pending.id,
  summary: pending.summary,
  isStale: pending.baseVersion !== (doc?.contentVersion ?? 0),
};
```

After the dry-run compile, call `insertPendingIfAbsent`. If a concurrent request won, re-read pending and return the same union; do not throw a database unique-constraint error. Persist `resubmitInstruction` and expose it from `getPending`.

- [ ] **Step 5: Keep accept/reject annotation semantics explicit**

Keep the existing transitions in `accept` and `reject`:

```ts
// accept
await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, proposal.annotationIds, {
  status: 'resolved',
  updatedAt: now,
});

// reject
await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, proposal.annotationIds, {
  status: 'open',
  updatedAt: now,
});
```

Do not change `dismissed` annotations here; Clear remains a user-owned action.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
bun run --filter '@aqsha/services' test test/document-proposal.test.ts
bun run --filter '@aqsha/db' typecheck
bun run --filter '@aqsha/services' typecheck
```

Expected: document proposal tests pass; both TypeScript checks exit 0.

- [ ] **Step 7: Commit the isolated persistence lifecycle**

```bash
git add packages/db/migrations/0045_typst_proposal_resubmit.sql packages/db/migrations/meta packages/db/src/schema/documentEditProposals.ts packages/db/src/repositories/documentEditProposalRepo.ts packages/services/src/typst/document-proposal.service.ts packages/services/test/document-proposal.test.ts
git commit -m "feat: preserve pending typst proposals for review"
```

### Task 2: Give Astra trusted project context, project RAG defaults, and bounded proposal retries

**Files:**
- Create: `apps/agent/src/mastra/processors/workspace-project-manifest.ts`
- Create: `apps/agent/src/mastra/tools/document-proposal-attempts.ts`
- Test: `apps/agent/test/document-proposal-attempts.test.ts`
- Modify: `apps/agent/src/mastra/agents/astra-lite.ts:13-174`
- Modify: `apps/agent/src/mastra/lib/tool-context.ts:1-180`
- Modify: `apps/agent/src/mastra/tools/get-document-source.ts:8-52`
- Modify: `apps/agent/src/mastra/tools/search-thread-documents.ts:7-52`
- Modify: `apps/agent/src/mastra/tools/propose-document-edit.ts:8-66`
- Modify: `apps/agent/src/mastra/instructions.ts:72-98`
- Modify: `apps/agent/package.json`

**Interfaces:**
- Consumes: `ChatThreadRepo.findById`, `WorkspaceService.get`, `WorkspaceDocumentService.getDocument`, `RagService.searchThreadDocuments`, and `DocumentProposalService.propose` from Task 1.
- Produces: a per-turn `<system-reminder>` for the active project, `resubmitInstruction` tool input, and `retry_exhausted` after three proposal attempts in a request context.

- [ ] **Step 1: Write the pure retry guard test**

Create `apps/agent/test/document-proposal-attempts.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { nextDocumentProposalAttempt } from '../src/mastra/tools/document-proposal-attempts';

describe('nextDocumentProposalAttempt', () => {
  test('allows exactly three calls then blocks the fourth', () => {
    const state = { attempts: 0 };
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: true, attempt: 1 });
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: true, attempt: 2 });
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: true, attempt: 3 });
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: false, attempts: 3 });
  });
});
```

- [ ] **Step 2: Run it and confirm the missing-module failure**

Run: `bun test apps/agent/test/document-proposal-attempts.test.ts`

Expected: FAIL with module-not-found for `document-proposal-attempts`.

- [ ] **Step 3: Implement retry guard and register an agent test command**

Create `apps/agent/src/mastra/tools/document-proposal-attempts.ts`:

```ts
export type DocumentProposalAttemptState = { attempts: number };

export function nextDocumentProposalAttempt(
  state: DocumentProposalAttemptState,
): { ok: true; attempt: number } | { ok: false; attempts: number } {
  if (state.attempts >= 3) return { ok: false, attempts: state.attempts };
  state.attempts += 1;
  return { ok: true, attempt: state.attempts };
}
```

Add to `apps/agent/package.json`:

```json
"test": "bun test --timeout 30000"
```

Store `DocumentProposalAttemptState` in a server-owned request-context key declared in `tool-context.ts`, pre-seeded in `AQSHA_SERVER_OWNED_CONTEXT_KEYS`, then call the helper before `DocumentProposalService.propose`. Return this failure on call four:

```ts
{ ok: false, reason: 'retry_exhausted', message: 'Tiga percobaan proposal sudah dilakukan pada turn ini.' }
```

- [ ] **Step 4: Add the project manifest processor after thread projection**

Create `workspace-project-manifest.ts` following the `threadArtifactManifestProcessor` shape. Resolve owner/thread, load the thread, then load only workspace name and document version. Push this exact bounded reminder when `workspaceId` exists:

```ts
systemMessages.push({
  role: 'system',
  content: [
    '<system-reminder>',
    `Proyek aktif: "${workspace.name}" (workspaceId: ${workspace.id}).`,
    `Dokumen Typst aktif: ${document ? `tersedia, contentVersion ${document.contentVersion}` : 'belum ditulis'}.`,
    'Gunakan proyek ini sebagai scope default tanpa meminta @mention. Untuk pertanyaan isi proyek, cari artifact relevan dengan `search_thread_documents` tanpa workspaceId; untuk edit Typst selalu baca `get_document_source` terlebih dahulu.',
    'Dokumen/proyek yang disebut lewat @mention adalah context baca prioritas. Jangan mengubahnya kecuali itu dokumen aktif dari thread ini.',
    '</system-reminder>',
  ].join('\n'),
});
```

Import this processor into `astra-lite.ts` and place it after `projectionInput` and `billingPrecheck`, before `threadArtifactManifestProcessor`. It must return `messages` unchanged on lookup failure.

- [ ] **Step 5: Scope default reads correctly and retain explicit cross-project read**

In `search-thread-documents.ts`, load the caller's thread first. Use `thread.workspaceId` when `input.workspaceId` is absent; only pass an explicit `input.workspaceId` through after `WorkspaceService.assertWorkspaceOwner` succeeds. The call must remain:

```ts
const matches = await RagService.searchThreadDocuments(getServiceDb(), {
  ownerUserId,
  workspaceId: targetWorkspaceId,
  query: input.query,
  limit: input.limit,
});
```

In `get-document-source.ts`, include a compact pending proposal field by calling `DocumentProposalService.getPending`:

```ts
pendingProposal: pending
  ? { id: pending.id, summary: pending.summary, hunkCount: pending.hunks.length, isStale: pending.isStale }
  : null,
```

Do not add a user-provided workspace parameter to either Typst patch tool; thread scope remains the only write target.

- [ ] **Step 6: Update tool schema and agent instructions**

Make `resubmitInstruction` required in `propose_document_edit`:

```ts
resubmitInstruction: z
  .string()
  .min(1)
  .max(1200)
  .describe('Instruksi singkat yang akan diisi kembali ke composer bila proposal menjadi basi; jangan menyatakan perubahan sudah diterapkan.'),
```

Forward it unchanged to `DocumentProposalService.propose`.

Replace the Typst section in `instructions.ts` with rules that require this order:

```text
Untuk pertanyaan tentang proyek aktif: gunakan source Typst/anotasi bila relevan, lalu RAG proyek aktif. Jangan memasukkan seluruh proyek ke jawaban tanpa alasan.
Untuk edit: get_document_source → propose_document_edit. Proposal selalu menunggu review user.
Jika proposal pending, jelaskan bahwa user harus meninjau/menolak proposal tersebut; jangan mencoba proposal baru.
Jika tool compile_error atau edit_mismatch, baca ulang bila perlu dan coba paling banyak tiga kali. Jika retry_exhausted, berhenti dan jelaskan diagnostic.
Gunakan search_workspace_citations hanya jika user meminta Citation Library global atau sumber proyek tidak cukup.
```

- [ ] **Step 7: Verify focused agent behavior and types**

Run:

```bash
bun run --filter '@aqsha/agent' test test/document-proposal-attempts.test.ts
bun run --filter '@aqsha/agent' typecheck
```

Expected: retry test passes; agent typecheck exits 0.

- [ ] **Step 8: Commit project-aware agent behavior**

```bash
git add apps/agent/package.json apps/agent/src/mastra/agents/astra-lite.ts apps/agent/src/mastra/lib/tool-context.ts apps/agent/src/mastra/processors/workspace-project-manifest.ts apps/agent/src/mastra/tools/document-proposal-attempts.ts apps/agent/src/mastra/tools/get-document-source.ts apps/agent/src/mastra/tools/search-thread-documents.ts apps/agent/src/mastra/tools/propose-document-edit.ts apps/agent/src/mastra/instructions.ts apps/agent/test/document-proposal-attempts.test.ts
git commit -m "feat: scope Astra context to the active project"
```

### Task 3: Add workspace-safe batch dismiss for visible annotations

**Files:**
- Modify: `packages/db/src/repositories/documentAnnotationRepo.ts:49-63`
- Modify: `packages/services/src/annotation.service.ts:62-180`
- Modify: `apps/api/src/routes/workspaces.ts:202-288`
- Test: `packages/services/test/annotation.test.ts`
- Test: `apps/api/test/annotations.test.ts`

**Interfaces:**
- Consumes: `AnnotationStatus` and existing `document_annotations_by_workspace_status` index.
- Produces: `AnnotationService.dismissMany({ ownerUserId, workspaceId, ids })` and `POST /workspaces/:id/annotations/dismiss` with `{ ids: string[] }`.

- [ ] **Step 1: Add failing service tests for workspace-scoped bulk status**

Add a second annotation in a second owned workspace, then assert only the requested workspace row is dismissed:

```ts
itest('dismissMany hanya menyembunyikan anotasi open/sent pada workspace yang sama', async () => {
  const sent = await AnnotationService.create(db, {
    ownerUserId: OWNER,
    workspaceId: WS,
    kind: 'pin',
    page: 1,
    rects: [{ x: 4, y: 8, w: 0, h: 0 }],
    note: 'sudah dikirim',
  });
  await AnnotationService.markSent(db, { ownerUserId: OWNER, workspaceId: WS, ids: [sent.id], threadId: 't-1' });
  await AnnotationService.dismissMany(db, { ownerUserId: OWNER, workspaceId: WS, ids: [sent.id] });
  const row = (await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS })).find((item) => item.id === sent.id);
  expect(row?.status).toBe('dismissed');
});
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `bun run --filter '@aqsha/services' test test/annotation.test.ts`

Expected: FAIL because `dismissMany` does not exist.

- [ ] **Step 3: Make every bulk update workspace-scoped**

Change repository signature and predicate:

```ts
async updateStatusByIds(
  db: DbOrTx,
  ownerUserId: string,
  workspaceId: string,
  ids: string[],
  patch: Partial<NewDocumentAnnotation>,
): Promise<void> {
  if (ids.length === 0) return;
  await db.update(documentAnnotations).set(patch).where(and(
    eq(documentAnnotations.ownerUserId, ownerUserId),
    eq(documentAnnotations.workspaceId, workspaceId),
    inArray(documentAnnotations.id, ids),
  ));
}
```

Update `markSent`, proposal accept, and proposal reject callers to pass their known workspace ID. Add `dismissMany` after `markSent`:

```ts
async dismissMany(db: Db, input: { ownerUserId: string; workspaceId: string; ids: string[] }): Promise<{ ok: true }> {
  await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
  await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, input.workspaceId, input.ids, {
    status: 'dismissed',
    updatedAt: Date.now(),
  });
  return { ok: true };
}
```

- [ ] **Step 4: Add the authenticated API route and route test**

Insert before `mark-sent` in `workspaces.ts`:

```ts
.post('/workspaces/:id/annotations/dismiss', ({ ownerUserId, params, body }) => {
  const { db } = getDb();
  return AnnotationService.dismissMany(db, { ownerUserId, workspaceId: params.id, ids: body.ids });
}, {
  auth: true,
  body: t.Object({ ids: t.Array(t.String(), { minItems: 1, maxItems: 64 }) }),
})
```

In `apps/api/test/annotations.test.ts`, add a malformed body assertion:

```ts
itest('dismiss membutuhkan setidaknya satu id anotasi', async () => {
  const res = await req('POST', `/workspaces/x/annotations/dismiss`, `tok_${OWNER}`, { ids: [] });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 5: Run service/API tests and type checks**

Run:

```bash
bun run --filter '@aqsha/services' test test/annotation.test.ts test/document-proposal.test.ts
bun run --filter '@aqsha/api' test test/annotations.test.ts test/proposals.test.ts
bun run --filter '@aqsha/services' typecheck
bun run --filter '@aqsha/api' typecheck
```

Expected: all focused tests pass; no type errors.

- [ ] **Step 6: Commit the annotation API boundary**

```bash
git add packages/db/src/repositories/documentAnnotationRepo.ts packages/services/src/annotation.service.ts packages/services/src/typst/document-proposal.service.ts apps/api/src/routes/workspaces.ts packages/services/test/annotation.test.ts apps/api/test/annotations.test.ts
git commit -m "feat: dismiss visible document annotations safely"
```

### Task 4: Build the cancellable Clear toolbar and preserve annotation context behavior

**Files:**
- Create: `apps/svelte/src/lib/features/document/components/AnnotationClearToolbar.svelte`
- Create: `apps/svelte/src/lib/features/document/components/AnnotationClearToolbar.svelte.spec.ts`
- Modify: `apps/svelte/src/lib/features/document/components/TypstPreview.svelte:1-388`
- Modify: `apps/svelte/src/lib/features/document/api.ts:143-190`
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte:180-245,572-584`
- Test: `apps/svelte/src/lib/features/document/components/TypstPreviewAnnotation.svelte.spec.ts`

**Interfaces:**
- Consumes: `useDismissWorkspaceAnnotations`, `AnnotationAgentation.enabled`, and preview annotation IDs.
- Produces: `onDismissAnnotations(ids: string[]): Promise<void>` from `TypstPreview`; it only receives snapshot IDs with visible statuses.

- [ ] **Step 1: Write a browser test for countdown completion and cancel**

Create `AnnotationClearToolbar.svelte.spec.ts` with fake timers:

```ts
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AnnotationClearToolbar from './AnnotationClearToolbar.svelte';

describe('AnnotationClearToolbar', () => {
  it('dismisses the initial visible-id snapshot after three seconds', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn().mockResolvedValue(undefined);
    render(AnnotationClearToolbar, { visibleIds: ['a', 'b'], onDismiss });
    await page.getByRole('button', { name: 'Bersihkan anotasi' }).click();
    await expect.element(page.getByRole('button', { name: 'Batal clear' })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onDismiss).toHaveBeenCalledWith(['a', 'b']);
    vi.useRealTimers();
  });

  it('does not dismiss when user cancels before the deadline', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(AnnotationClearToolbar, { visibleIds: ['a'], onDismiss });
    await page.getByRole('button', { name: 'Bersihkan anotasi' }).click();
    await page.getByRole('button', { name: 'Batal clear' }).click();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the browser test and verify it fails**

Run: `bun run --filter '@aqsha/svelte' test src/lib/features/document/components/AnnotationClearToolbar.svelte.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the countdown component without touching document state**

`AnnotationClearToolbar.svelte` owns only a snapshot and timer. Its public props are:

```ts
let {
  visibleIds,
  onDismiss,
  disabled = false,
}: {
  visibleIds: readonly string[];
  onDismiss: (ids: string[]) => Promise<void>;
  disabled?: boolean;
} = $props();
```

On click, copy `visibleIds` into `snapshotIds`, set `deadline = Date.now() + 3000`, and update a `progress` state every 50ms. Render the progress as `background: conic-gradient(var(--primary) ${progress * 360}deg, transparent 0)` around the Clear icon. On Cancel, clear both timers and state. On deadline, await `onDismiss(snapshotIds)`, then clear state in `finally`. Use `onDestroy` to clear timers.

- [ ] **Step 4: Wire API mutation and keep chips intact**

Add this Svelte hook in `document/api.ts`:

```ts
export function useDismissWorkspaceAnnotations(workspaceId: () => string) {
  const api = getApiClient();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: async (input: { ids: string[] }) =>
      unwrap(await api.workspaces({ id: workspaceId() }).annotations.dismiss.post(input)) as { ok: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId()) });
    },
  }));
}
```

In `ProjectHomePage.svelte`, instantiate it and pass:

```ts
onDismissAnnotations={async (ids) => {
  await dismissAnnotations.mutateAsync({ ids });
}}
```

Do not call `mentions.clearSelectionRefs`, `removeSelectionRefByKey`, or any composer mutation in this handler.

- [ ] **Step 5: Change the annotation creation cap to preserve the mark**

Replace the early-return cap in `handleCreateAnnotation` with a post-create decision:

```ts
const canAddToComposer =
  mentions.selectionRefs.filter((ref) => ref.kind === 'document-annotation').length < MAX_CONTEXT_ANNOTATIONS;

createAnnotation.mutate(input, {
  onSuccess: (annotation) => {
    if (!canAddToComposer) {
      toast.info(`Anotasi tersimpan. Lepas chip konteks untuk menambah lagi (maksimal ${MAX_CONTEXT_ANNOTATIONS}).`);
      return;
    }
    mentions.addSelectionRef(/* existing document-annotation ref */);
  },
});
```

The annotation mode remains enabled because `AnnotationAgentation.submit()` must still only close its popover, never call `toggle()`.

- [ ] **Step 6: Mount toolbar inside active annotation controls**

Extend `TypstPreview` props with `onDismissAnnotations?: (ids: string[]) => Promise<void>`. Derive visible IDs from `annotations` by filtering only `open` and `sent`. Replace the current bottom-right single-button shell with a `role="toolbar"` that remains visible while `agentation.enabled`:

```svelte
{#if agentation.enabled}
  <div class="absolute right-4 bottom-4 z-30 flex items-center gap-1 rounded-full border-2 border-border bg-card p-1" data-annotation-ui>
    <Button aria-label="Matikan mode anotasi" ... onclick={() => agentation.toggle()}>
      <Icon icon={MessageSquarePlusIcon} class="size-4" />
    </Button>
    <AnnotationClearToolbar
      visibleIds={visibleAnnotationIds}
      disabled={visibleAnnotationIds.length === 0}
      onDismiss={(ids) => onDismissAnnotations?.(ids) ?? Promise.resolve()}
    />
  </div>
{:else}
  <!-- existing single enable button -->
{/if}
```

Keep `dismissed` and `resolved` filtered from overlays. The Clear snapshot is intentionally independent of annotations created after the countdown begins.

- [ ] **Step 7: Expand preview behavior tests**

In `TypstPreviewAnnotation.svelte.spec.ts`, add a test that enables annotation mode, renders a `sent` annotation, starts Clear, clicks Cancel, and asserts its overlay button still exists. Add a completion test that spies on `onDismissAnnotations` and expects the `['sent-id']` snapshot after three seconds. Retain the existing hover/popover tests unchanged.

- [ ] **Step 8: Run focused Svelte tests and checks**

Run:

```bash
bun run --filter '@aqsha/svelte' test src/lib/features/document/components/AnnotationClearToolbar.svelte.spec.ts src/lib/features/document/components/TypstPreviewAnnotation.svelte.spec.ts
bun run typecheck:svelte
```

Expected: countdown/cancel and existing annotation-mode scenarios pass; Svelte typecheck exits 0.

- [ ] **Step 9: Commit the annotation UX slice**

```bash
git add apps/svelte/src/lib/features/document/components/AnnotationClearToolbar.svelte apps/svelte/src/lib/features/document/components/AnnotationClearToolbar.svelte.spec.ts apps/svelte/src/lib/features/document/components/TypstPreview.svelte apps/svelte/src/lib/features/document/components/TypstPreviewAnnotation.svelte.spec.ts apps/svelte/src/lib/features/document/api.ts apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte
git commit -m "feat: add cancellable annotation clear"
```

### Task 5: Make proposal review a read-only Editor flow with section-labelled hunks

**Files:**
- Create: `apps/svelte/src/lib/features/document/lib/proposal-hunk-label.ts`
- Create: `apps/svelte/src/lib/features/document/lib/proposal-hunk-label.spec.ts`
- Modify: `apps/svelte/src/lib/features/document/api.ts:32-52,206-278`
- Modify: `apps/svelte/src/lib/features/document/components/ProposalReviewCard.svelte:1-166`
- Modify: `apps/svelte/src/lib/features/document/components/TypstPreview.svelte:25-48,278-385`
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte:70-120,251-284,311-600`

**Interfaces:**
- Consumes: `PendingProposalView.currentSource`, `ProposalHunk`, `resubmitInstruction`, and runtime autosave.
- Produces: `beginProposalReview()`, `exitProposalReview()`, `requestProposalResubmit()`, a preview-only `onReviewProposal`, and `Editor (hunkCount)` tab labels.

- [ ] **Step 1: Write the pure hunk-label test**

Create `proposal-hunk-label.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { proposalHunkLabel } from './proposal-hunk-label';

describe('proposalHunkLabel', () => {
  it('uses the closest Typst heading before a hunk', () => {
    const source = '= Pendahuluan\n\nSatu.\n\n= Metode\n\nDua.\n';
    expect(proposalHunkLabel(source, { index: 1, oldStart: 6, oldLines: 1, newStart: 6, newLines: 1, lines: [] }))
      .toBe('Metode');
  });

  it('falls back to a line range when no heading exists', () => {
    expect(proposalHunkLabel('Tanpa heading\n', { index: 0, oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [] }))
      .toBe('Baris 1–2');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --filter '@aqsha/svelte' test src/lib/features/document/lib/proposal-hunk-label.spec.ts`

Expected: FAIL because `proposal-hunk-label.ts` does not exist.

- [ ] **Step 3: Implement heading resolution**

Create `proposal-hunk-label.ts`:

```ts
import type { ProposalHunk } from '../api';

const HEADING = /^(=+)\s+(.+?)\s*$/;

export function proposalHunkLabel(source: string, hunk: ProposalHunk): string {
  const lines = source.split('\n');
  const end = Math.max(0, Math.min(hunk.oldStart - 1, lines.length - 1));
  for (let index = end; index >= 0; index -= 1) {
    const match = HEADING.exec(lines[index] ?? '');
    if (match?.[2]) return match[2].trim();
  }
  const last = hunk.oldStart + Math.max(hunk.oldLines, 1) - 1;
  return `Baris ${hunk.oldStart}–${last}`;
}
```

- [ ] **Step 4: Extend the Svelte proposal contract and stale invalidation**

Add `resubmitInstruction: string` to `PendingProposalView`. In `useSaveWorkspaceDocument.onSuccess`, invalidate pending proposals in addition to bibliography:

```ts
void qc.invalidateQueries({ queryKey: queryKeys.workspaces.proposals(workspaceId()) });
```

This is what makes manual editor saves turn a currently pending proposal into `isStale` without blocking user edits.

- [ ] **Step 5: Make the card an actual read-only reviewer**

Change `ProposalReviewCard` props to accept `source`, `onExitReview`, and optional `onResubmit`. Render `proposalHunkLabel(source, hunk)` before the fallback range. Preserve existing checkbox semantics: a checkbox off means Skip; submitting `undefined` means all selected, otherwise submit selected indexes.

For stale proposals render:

```svelte
<Button type="button" variant="outline" onclick={onExitReview}>Kembali menyunting</Button>
<Button type="button" variant="outline" onclick={onReject}>Tolak</Button>
<Button type="button" onclick={onResubmit}>Minta Astra susun ulang</Button>
```

Do not render the Accept button while stale. For non-stale proposals keep `Tolak` and `Terima (selected/total)`.

- [ ] **Step 6: Orchestrate tabs, review state, and the explicit resubmit action**

In `ProjectHomePage.svelte`, add:

```ts
let reviewingProposalId = $state<string | null>(null);
const proposalHunkCount = $derived(proposal.data?.hunks.length ?? 0);
const reviewingProposal = $derived(reviewingProposalId !== null && reviewingProposalId === proposal.data?.id);

function beginProposalReview(): void {
  const current = proposal.data;
  if (!current) return;
  reviewingProposalId = current.id;
  selectLeftMode('editor');
}

function exitProposalReview(): void {
  reviewingProposalId = null;
  proposalAcceptErrors = null;
}
```

Make `handleAcceptProposal` and `handleRejectProposal` call `exitProposalReview()` only after success, so a failed subset compile keeps the reviewer and selection visible. Add this explicit resubmit flow:

```ts
function requestProposalResubmit(): void {
  const current = proposal.data;
  if (!current) return;
  rejectProposal.mutate(current.id, {
    onSuccess: () => {
      exitProposalReview();
      mentions.setComposerDraft(current.resubmitInstruction || current.summary);
      selectLeftMode('chat');
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menyiapkan usulan ulang.')),
  });
}
```

The user action resolves the old stale proposal but does not send the prefilled composer content.

Replace the current editor-panel composition: if `reviewingProposal`, render only `ProposalReviewCard` in the pane; otherwise render the normal `Editor` and permit manual edits. This makes the reviewer read-only without ever locking the normal source editor.

- [ ] **Step 7: Add badges and preview-only review notice**

Replace both desktop/mobile Editor labels with:

```svelte
<Icon icon={Code2Icon} class="size-3" /> Editor
{#if proposalHunkCount > 0}
  <span class="rounded-full bg-primary px-1.5 text-micro leading-4 text-primary-foreground">{proposalHunkCount}</span>
{/if}
```

Pass `proposalHunkCount` and `onReviewProposal={beginProposalReview}` to `TypstPreview`. Render a banner above the SVG only when `proposalHunkCount > 0`:

```svelte
<div class="m-3 flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card px-3 py-2">
  <span class="text-label">Astra mengusulkan {proposalHunkCount} bagian.</span>
  <Button type="button" size="sm" onclick={() => onReviewProposal?.()}>Tinjau usulan</Button>
</div>
```

The banner must not render Accept/Reject and must not substitute `proposal.proposedSource` for `runtime.previewSvg`.

- [ ] **Step 8: Run focused tests, then Svelte checks**

Run:

```bash
bun run --filter '@aqsha/svelte' test src/lib/features/document/lib/proposal-hunk-label.spec.ts src/lib/features/document/components/TypstPreview.svelte.spec.ts
bun run typecheck:svelte
```

Expected: labels and preview worker boundary tests pass; typecheck exits 0.

- [ ] **Step 9: Commit the editor review slice**

```bash
git add apps/svelte/src/lib/features/document/lib/proposal-hunk-label.ts apps/svelte/src/lib/features/document/lib/proposal-hunk-label.spec.ts apps/svelte/src/lib/features/document/api.ts apps/svelte/src/lib/features/document/components/ProposalReviewCard.svelte apps/svelte/src/lib/features/document/components/TypstPreview.svelte apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte
git commit -m "feat: review Typst proposals as section diffs"
```

### Task 6: Render the Tinjau CTA inside Astra’s completed response

**Files:**
- Create: `apps/svelte/src/lib/features/document/lib/proposal-review-interactions.svelte.ts`
- Create: `apps/svelte/src/lib/features/document/components/ProposalReviewCTA.svelte`
- Create: `apps/svelte/src/lib/features/document/components/ProposalReviewCTA.svelte.spec.ts`
- Modify: `apps/svelte/src/lib/features/threads/lib/timeline-types.ts:110-160`
- Modify: `apps/svelte/src/lib/features/threads/lib/mastra-timeline.ts`
- Modify: `apps/svelte/src/lib/features/threads/lib/mastra-timeline.spec.ts`
- Modify: `apps/svelte/src/lib/features/threads/components/AssistantMessage.svelte:1-180`
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte:70-120,447-457`

**Interfaces:**
- Consumes: tool result `{ ok: true, proposalId, summary }` emitted by `propose_document_edit` and `PendingProposalView` from Task 5.
- Produces: `TimelinePart { kind: 'document-proposal'; model: { proposalId: string; summary: string } }` and a CTA that only renders while the matching proposal is still pending.

- [ ] **Step 1: Add the timeline reducer expectation**

In `mastra-timeline.spec.ts`, add a completed `propose_document_edit` tool result fixture and assert:

```ts
expect(message.parts).toContainEqual({
  kind: 'document-proposal',
  id: expect.any(String),
  model: { proposalId: 'proposal-1', summary: 'Perbaiki dua bagian' },
});
```

- [ ] **Step 2: Run the focused reducer test and confirm it fails**

Run: `bun run --filter '@aqsha/svelte' test src/lib/features/threads/lib/mastra-timeline.spec.ts`

Expected: FAIL because no document-proposal timeline part exists.

- [ ] **Step 3: Add a structured timeline part, never a model-generated marker**

Add this type to `timeline-types.ts`:

```ts
export type DocumentProposalCardModel = { proposalId: string; summary: string };

export type TimelinePart =
  | { kind: 'text'; id: string; text: string; streaming: boolean }
  | { kind: 'reasoning'; id: string; text: string; thinking: boolean }
  | { kind: 'tool'; id: string; model: ToolRowModel }
  | { kind: 'artifact'; id: string; model: ArtifactCardModel }
  | { kind: 'document-proposal'; id: string; model: DocumentProposalCardModel };
```

In both live and rehydrated tool-result reduction paths, recognize only `toolName === 'propose_document_edit'` with `result.ok === true`, a non-empty string `proposalId`, and a non-empty string `summary`. Emit one `document-proposal` part. Any malformed/forged object remains a normal tool row and never creates a CTA.

- [ ] **Step 4: Create a reactive proposal-review interaction context**

Create `proposal-review-interactions.svelte.ts`:

```ts
import { createContext } from '$lib/context';

export type ProposalReviewInteraction = {
  proposalId: string;
  hunkCount: number;
  review: () => void;
};

export class ProposalReviewInteractions {
  #current = $state<ProposalReviewInteraction | null>(null);
  get current(): ProposalReviewInteraction | null { return this.#current; }
  set(current: ProposalReviewInteraction | null): void { this.#current = current; }
}

const context = createContext<ProposalReviewInteractions>('proposal-review-interactions');
export const setProposalReviewInteractions = (value: ProposalReviewInteractions) => context.set(value);
export const getProposalReviewInteractions = () => context.getOptional() ?? new ProposalReviewInteractions();
```

In `ProjectHomePage`, instantiate once beside `ComposerMentions`, set it in context, then synchronize it from `proposal.data` with an `$effect`. Provide `null` once a proposal is accepted/rejected so historic assistant responses do not expose a dead CTA.

- [ ] **Step 5: Render and test the CTA**

`ProposalReviewCTA.svelte` obtains interactions and accepts `{ proposalId, summary }`. Render nothing when `interactions.current?.proposalId !== proposalId`; otherwise render:

```svelte
<div class="not-prose rounded-lg border-2 border-border bg-card p-3">
  <p class="text-sm font-medium">Usulan suntingan siap ditinjau</p>
  <p class="mt-1 text-label text-muted-foreground">{summary}</p>
  <Button class="mt-3" size="sm" onclick={() => current?.review()}>
    Tinjau usulan ({current?.hunkCount})
  </Button>
</div>
```

The component test must set matching interactions, click the button, and expect its callback once; then replace with a different ID and assert the card is absent.

In `AssistantMessage.svelte`, derive `proposalParts` alongside `artifactParts` and render `ProposalReviewCTA` after the response text. This satisfies “stay in Chat after agent finishes”: rendering a CTA never changes `leftMode` until user clicks it.

- [ ] **Step 6: Run CTA and timeline checks**

Run:

```bash
bun run --filter '@aqsha/svelte' test src/lib/features/document/components/ProposalReviewCTA.svelte.spec.ts src/lib/features/threads/lib/mastra-timeline.spec.ts
bun run typecheck:svelte
```

Expected: CTA only appears for the real pending proposal; timeline reducer and typecheck pass.

- [ ] **Step 7: Commit chat-to-editor handoff**

```bash
git add apps/svelte/src/lib/features/document/lib/proposal-review-interactions.svelte.ts apps/svelte/src/lib/features/document/components/ProposalReviewCTA.svelte apps/svelte/src/lib/features/document/components/ProposalReviewCTA.svelte.spec.ts apps/svelte/src/lib/features/threads/lib/timeline-types.ts apps/svelte/src/lib/features/threads/lib/mastra-timeline.ts apps/svelte/src/lib/features/threads/lib/mastra-timeline.spec.ts apps/svelte/src/lib/features/threads/components/AssistantMessage.svelte apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte
git commit -m "feat: link Astra proposal responses to review"
```

### Task 7: Remove invisible automatic workspace pills and verify end-to-end boundaries

**Files:**
- Modify: `apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte:90-105`
- Modify: `apps/svelte/src/lib/features/threads/state/composer-mentions.svelte.ts:8-66`
- Modify: `apps/svelte/src/lib/features/threads/components/composer/composer-context-refs.spec.ts`
- Modify: `apps/svelte/src/lib/features/document/components/TypstPreview.svelte.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ThreadAgent.getWorkspaceId()` and server `thread-projection` that already persists workspace before agent tool execution.
- Produces: no automatic `ContextRef { kind: 'workspace' }` on the project page; manual mention channels remain unchanged.

- [ ] **Step 1: Add a regression test for no project-page ambient workspace pill**

Extract a pure helper in `composer-mentions.svelte.ts`:

```ts
export function projectPageAmbientRefs(): ContextRef[] {
  return [];
}
```

Add this test:

```ts
it('project page has no automatic workspace pill because thread scope is server-side', () => {
  expect(projectPageAmbientRefs()).toEqual([]);
});
```

This test intentionally covers only the project page. Existing ambient behaviors for explicit Explore/reader actions remain supported by `setAmbientContextRefs`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run --filter '@aqsha/svelte' test src/lib/features/threads/components/composer/composer-context-refs.spec.ts`

Expected: FAIL because `projectPageAmbientRefs` does not exist.

- [ ] **Step 3: Stop injecting the workspace ContextRef from ProjectHomePage**

Remove the `$effect` that calls `mentions.syncAmbientFromPage([{ kind: 'workspace', ... }])`. Replace it with a single call that explicitly clears project-page ambient refs once on page setup:

```ts
mentions.syncAmbientFromPage(projectPageAmbientRefs());
```

Keep `ComposerMentions` selection refs unchanged: document annotation chips are explicit user selections and must still merge into the composer. Do not modify `ThreadAgent.getWorkspaceId`; it is the trusted request-context bridge used by `thread-projection` for new and existing project threads.

- [ ] **Step 4: Add a worker/preview regression assertion**

In `TypstPreview.svelte.spec.ts`, render a non-null SVG with `proposalHunkCount: 2`, assert the visible text includes `Tinjau usulan`, then assert the original SVG text is present and no red/green proposal text is injected into `.typst-preview-svg`. This protects the decision that preview remains the saved document.

- [ ] **Step 5: Run the full relevant verification matrix**

Run:

```bash
bun run --filter '@aqsha/services' test test/document-proposal.test.ts test/annotation.test.ts test/hunks.test.ts
bun run --filter '@aqsha/api' test test/proposals.test.ts test/annotations.test.ts
bun run --filter '@aqsha/agent' test test/document-proposal-attempts.test.ts
bun run test:svelte
bun run typecheck:svelte
bun run --filter '@aqsha/agent' typecheck
bun run --filter '@aqsha/services' typecheck
bun run --filter '@aqsha/api' typecheck
bun run build:svelte
```

Expected: all selected tests pass, all typechecks exit 0, and the Svelte build succeeds with Typst renderer code still isolated to Worker assets.

- [ ] **Step 6: Manually verify the critical user journeys in a local project**

Run `bun dev`, then verify:

1. Chat proyek baru can ask about its document without a workspace pill and Astra receives the project context.
2. Create two annotations; both appear as chips. Fill eight chips, create a ninth, and confirm only the ninth is not automatically pinned.
3. Enable annotation mode, click Clear, wait partway, click Batal, and confirm marks remain. Repeat and wait three seconds; confirm only marks disappear while chips remain.
4. Ask Astra to edit two separate sections. Confirm Chat stays selected, CTA and preview banner only say Tinjau, and Editor badge displays `(2)`.
5. Review one hunk, skip the other, Accept, and confirm the resulting Typst source compiles and preview refreshes.
6. Create another proposal, manually edit the source, confirm Basi, use Minta Astra susun ulang, and confirm Chat contains a prefilled draft that has not been sent.

- [ ] **Step 7: Commit integration and documentation**

```bash
git add apps/svelte/src/lib/features/workspaces/pages/ProjectHomePage.svelte apps/svelte/src/lib/features/threads/state/composer-mentions.svelte.ts apps/svelte/src/lib/features/threads/components/composer/composer-context-refs.spec.ts apps/svelte/src/lib/features/document/components/TypstPreview.svelte.spec.ts package.json docs/superpowers/specs/2026-07-21-typst-agent-composer-annotations.md docs/superpowers/plans/2026-07-21-typst-agent-composer-annotations.md
git commit -m "feat: finalize project-aware Typst review workflow"
```

## Self-Review

### Spec coverage

- Implicit current project, Typst source read/patch proposal, project RAG, and external read-only mentions: Tasks 1–2 and 7.
- Three-attempt compile repair, no direct write, no silent supersede, stale/resubmit flow: Tasks 1–2 and 5.
- Git-style hunk review, section labels, accept subset, preview banner, badges, mobile/editor behavior: Task 5.
- CTA in chat response without forced navigation: Task 6.
- Annotation auto-chip cap, persistent visual mark, three-second Clear/Cancel, history/chip preservation, and resolved/rejected lifecycle: Tasks 3–4.
- Owner/workspace isolation and regression verification: Tasks 2–3 and 7.

### Placeholder scan

Tidak ada placeholder yang belum diputuskan atau langkah test yang tidak spesifik. Dynamic Drizzle generation dibatasi pada migrasi bernama `0045_typst_proposal_resubmit` serta metadata yang dihasilkannya.

### Type consistency

- `resubmitInstruction` is defined in schema, service input/view, agent tool schema, Svelte API type, and `requestProposalResubmit`.
- `pending_proposal` is defined by the service union and consumed only by the agent tool/instructions; it does not leak as an API accept result.
- `onDismissAnnotations(ids)` maps directly to `useDismissWorkspaceAnnotations({ ids })` and the batch API body.
- `ProposalReviewInteraction.proposalId` is the same ID emitted by the timeline tool-result reducer and read from `PendingProposalView`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-21-typst-agent-composer-annotations.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
