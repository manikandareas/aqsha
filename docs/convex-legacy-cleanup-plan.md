# Plan: Pembersihan Legacy Convex (v1 → v2) Pasca-Cutover Agent

> Status: **DRAFT siap eksekusi (2026-06-13).** Disusun setelah cutover agent Step 6
> (`docs/claude-agent-sdk-app-plan.md`) selesai: runtime agent kini sepenuhnya di
> `apps/agents` (Claude Agent SDK) di atas tabel first-party v2, komponen
> `@convex-dev/agent` + `@convex-dev/workflow` sudah di-unmount, runtime legacy di
> `packages/convex/convex/agent/` sudah dihapus.
>
> Tujuan dokumen ini: **(A)** membuang semua tabel/fungsi Convex legacy yang sudah
> tidak terpakai, dan **(B)** untuk tabel/fungsi legacy yang **masih dirujuk** kode
> hidup, mengganti pembacanya agar tidak lagi bergantung pada kode/tabel legacy.
>
> **Tanpa migrasi data.** Semua data saat ini hanya di **development**; tidak ada
> data produksi. Data lama boleh dibuang. Yang dibutuhkan hanyalah *langkah
> mekanis* mengosongkan baris dev sebelum drop tabel (Convex menolak push skema
> yang menghapus tabel yang masih berisi baris) — ini **bukan** migrasi data.

Dasar fakta dokumen ini: audit multi-agen (5 lensa peta + verifikasi adversarial
2 agen) atas `packages/convex`, `apps/agents`, dan `apps/web`. Setiap klaim
"aman dibuang / aman diganti" sudah diverifikasi terhadap ketiga paket.

---

## 1. Prinsip & invariants migrasi

1. **Greenfield drop, bukan migrasi.** Tidak ada backfill, tidak ada widen→narrow
   bertahap. Untuk tiap tabel yang di-drop: kosongkan baris dev → hapus definisi
   dari `schema.ts` → push. (`schema.ts` memakai `schemaValidation: true`, jadi
   push akan ditolak bila tabel masih punya baris.)
2. **Lockstep per batch.** Dalam satu perubahan: hapus *pembaca/penulis* sebuah
   tabel/kolom **bersamaan** dengan menghapus tabel/kolom itu dari skema. Kalau
   tidak, `bun run typecheck` (mengetik `ctx.db.query("X")` ke tabel yang sudah
   hilang) atau `convex dev --once` (ref fungsi/tabel hilang) akan gagal.
3. **Gerbang per batch (wajib hijau sebelum lanjut):**
   ```
   bun run typecheck            # app + convex + ui
   bun run lint
   bun run --filter '@aqsha/convex' test
   npx convex dev --once        # di packages/convex — regen codegen + validasi skema dev
   ```
   Pantau log push untuk `Schema validation failed`, `ReturnsValidationError`,
   `ArgumentValidationError`, "Couldn't find function …".
4. **Satu commit per batch** (revert mudah). Urutan: ganti pembaca dulu (Part B),
   baru drop (Part A) — atau gabung per-cluster selama lockstep terjaga.
5. **Konvensi Convex dipertahankan** (object syntax, validators, index, `throwAppError`,
   auth di boundary) sesuai `packages/convex/AGENTS.md`.
6. **`npx convex dev --once` = deployment DEV.** `npx convex deploy` (produksi)
   **tidak** dijalankan saat validasi; promosi ke produksi dilakukan owner di akhir.

---

## 2. Inventaris & klasifikasi

Semua 20 tabel legacy **write-dead** di v2 (tidak ada `insert`/`patch` dari kode
hidup mana pun). Klasifikasi:

### 2A. Orphan murni — DROP langsung (tidak ada pembaca hidup)

| Tabel | Catatan |
|---|---|
| `agentRunSteps` | v2 → `agentRunEvents2`. Hanya disentuh account-cleanup. |
| `agentRunEvents` | v2 → `agentRunEvents2`. |
| `researchRoundStates` | v2 → `researchPhaseStates`. |
| `researchSources` | dirujuk `citationChecks.sourceIds` (drop sekluster). |
| `researchExtracts` | dirujuk `citationChecks.extractIds` (drop sekluster). |
| `citationChecks` | bawa `v.id` ke researchSources/researchExtracts/computationChecks + `runId`. Drop sekluster. |
| `sandboxRuns` | verifikasi statistik kini tulis `agentRuns2.verificationReportJson`. |
| `computationChecks` | dirujuk `citationChecks.computationCheckIds`; `sandboxRunId`→sandboxRuns. |
| `messageCommands` | provenance slash-command kini di `chatMessages`/`agentRuns2.mode` + routing apps/agents. |
| `messageWorkspaceArtifacts` | digantikan `artifacts.createdByMessageId`. |
| `messageArtifacts` | bawa `versionId=v.id(artifactVersions)` (artifactVersions tetap; drop messageArtifacts saja). |
| `messageRichContent` | mention inline kini di `chatMessages.text` + parsing mention-markers web. |
| `messageContextArtifacts` | satu-satunya penulis (`persistMessageContextArtifacts`) tak ada pemanggil. |
| `messageContextWorkspaces` | satu-satunya penulis (`persistMessageContextWorkspaces`) tak ada pemanggil. |
| `skillActivations` | skills kini native SDK di `apps/agents/.claude/skills/`; tak ada penulis. |
| `skills` (katalog) | sda — katalog skill kini filesystem, bukan tabel Convex. |

### 2B. Dead-but-referenced — GANTI pembaca lalu DROP

| Tabel | Pembaca hidup yang harus diganti |
|---|---|
| `agentRuns` | (1) `billing/reconciliation.ts reconcileRunCost` (query mati, 0 pemanggil) — hapus; (2) 3 kolom `v.id("agentRuns")` di `providerUsageLedger`/`artifacts`/`artifactVersions` + `const runId` (schema.ts:9); (3) **tipe frontend `AgentRunId = Id<"agentRuns">`** (lihat §3.5). |
| `threadMetadata` | (1) `artifacts.ts saveAttachmentToWorkspace` (~:809) baca `threadMetadata.workspaceId`; (2) `workspaces/moveModel.ts syncThreadContextRowsAfterArtifactWorkspaceMove` (~:116). Repoint ke `chatThreads.workspaceId`. |
| `messageWorkspaceActions` | `workspaces.ts listActionsForMessage` + `apps/web message-row.tsx` (`<MessageWorkspaceActions>`). Hapus query + UI (selalu kosong di v2). |
| `threadContextArtifacts` | jalur RAG hidup `service.searchThreadDocuments → ragContext → listRagTargetsForThread`. Tabel tak pernah ditulis di v2 (context dikirim per-pesan via dispatch payload). Sederhanakan reader. |
| `threadContextWorkspaces` | sda (`listWorkspaceRagTargetsForThread`). |

### 2C. Fungsi/berkas Convex yang ikut mati

- `billing/reconciliation.ts`: `reconcileRunCost` (hapus); `aggregateRunCost` + `tests/runCostReconciliation.test.ts` (hapus bila reconciliation tak dibangun ulang).
- `agent/context/threadContext.ts`: `buildPromptContextForThread` (0 pemanggil — prompt kini dirakit `apps/agents/src/agent/contextAssembly.ts`), `listForThread`/`add`/`addMany`/`toggle`, `persistMessageContextArtifacts`/`persistMessageContextWorkspaces`, `getThreadFiledWorkspaceId`/`listActiveWorkspaceIdsForThread`, helper privat terkait. **Sisakan** hanya yang dipakai jalur RAG hidup (`listThreadDocumentArtifacts`, resolusi artifact, `isOwnedThread`, `listRagTargetsForThread` versi ramping).
- `agent/context/threadContextWorkspaces.ts`: `listWorkspacesForThread` + mutation penulis; nasib `listWorkspaceRagTargetsForThread` ditentukan oleh keputusan RAG (§4, P3).
- `agent/skills/skillRegistry.ts`: **hapus seluruh berkas** setelah `buildPromptContextForThread` hilang (importer satu-satunya). Folder `agent/skills/` lalu kosong → hapus.
- `billing/entitlements.ts`: `runIdValidator` + param `runId` di `consumeCredits`/`recordProviderUsage`/`consumeCreditsInternal` (penulis hidup tak pernah kirim `runId`). `recordProviderUsage` sendiri tanpa pemanggil → pertimbangkan hapus.
- `accountCleanup/agent.ts`: blok baca+hapus tabel legacy (**baris ~15–111**, 12 tabel) — hapus; **sisakan** `deleteV2AgentData`.
- `accountCleanup/artifacts.ts`: blok hapus `messageContextArtifacts` + `messageArtifacts`.

### 2D. Dependency npm

- `packages/convex/package.json`: hapus `@convex-dev/agent` (baris ~60) **dan** `@convex-dev/workflow` (baris ~65) — 0 import kode di convex, komponen sudah unmount.
- `apps/web/package.json`: **PERTAHANKAN** `@convex-dev/agent` — masih dipakai `useSmoothText` di `chat-thread-state.tsx`.

### 2E. Wiring yang sudah bersih (verifikasi — tidak perlu disentuh)

- `crons.ts`: hanya `internal.agent.v2.watchdogSweep`.
- `http.ts`: hanya `auth.processClerkWebhook` + `billing.entitlements.syncSubscriptionFromPolar`.
- `package.json` `exports`: semua subpath (`prompt-commands`, `hitl-tool-names`, `mention-markers`, …) resolve ke berkas yang masih ada.

---

## 3. Part B — Ganti pembaca legacy (dilakukan SEBELUM drop)

### 3.1 Billing: lepas dari `agentRuns`

- Hapus `reconcileRunCost` (`billing/reconciliation.ts`). Ini satu-satunya
  pemakai runtime `v.id("agentRuns")` di billing dan **0 pemanggil**.
- Hapus param/kolom `runId` dari billing: `runIdValidator` (`entitlements.ts:42`),
  field `runId` di args+insert `consumeCredits` (~:259/:294), `recordProviderUsage`
  (~:337/:367), dan args `consumeCreditsInternal` (~:454). Penulis hidup
  (`agent/sendQuota.ts:52`, `providers/externalProviders.ts`, `providers/openalexProvider.ts`)
  sudah tidak mengirim `runId` → non-breaking.
- **Opsional (keputusan produk P4):** bila rekonsiliasi biaya per-run masih
  diinginkan, bangun ulang v2-native: `reconcileRunCost2({ runId: v.string() })`
  yang point-read `agentRuns2` `by_run_id` → `{ costUsd, usage, numTurns }` (biaya
  aktual SDK). Tidak butuh join `providerUsageLedger`.

### 3.2 `threadMetadata` → `chatThreads`

- `artifacts.ts saveAttachmentToWorkspace`: ganti lookup `threadMetadata.workspaceId`
  jadi `chatThreads` (`by_thread_id` → `.workspaceId`).
- `workspaces/moveModel.ts syncThreadContextRowsAfterArtifactWorkspaceMove`: blok
  sweep `threadContextArtifacts`/`threadMetadata` kini no-op → hapus blok.
- `chatThreads` sudah menyimpan `workspaceId`, `title`, `status`, `lastActivityAt`,
  `messageCount`, `lastMessagePreview` → `threadMetadata` redundan penuh. (Cek
  apakah `lastAgentKind` masih dibaca; bila ya, ia sudah ada di `chatThreads.agentKind`.)

### 3.3 `messageWorkspaceActions` → hapus fitur badge (atau redesign)

- Hapus `workspaces.ts listActionsForMessage` + pemakaian di `message-row.tsx:88`
  + komponen `<MessageWorkspaceActions>` bila tak dipakai lain. Di v2 selalu `[]`.
- **Opsional (P4):** badge "simpan ke workspace" v2-native = turunkan dari
  `artifacts` ber-`createdByMessageId == message.id` + `artifacts.workspaceId`
  (kolom `createdByMessageId` adalah link pesan↔artifact v2 — **dipertahankan**).

### 3.4 RAG context (`threadContextArtifacts`/`threadContextWorkspaces`)

`ragContext.ts` (`agent/service.ts:searchThreadDocuments`) adalah **entrypoint RAG
v2 yang hidup** — KEEP, tapi rework agar tidak baca tabel pinned:

- `listRagTargetsForThread`: ambil target artifact **hanya** dari upload-thread +
  attachment pesan (tabel `artifacts`), berhenti membaca `threadContextArtifacts`.
- Target workspace: drop, **atau** (P3) terima `workspaceIds` sebagai argumen dari
  `contextRefs` run (teruskan via `service.searchThreadDocuments` ← `apps/agents`).
- `rag.ts`, `contextBudget.ts`, `mentionMarkers.ts`: **KEEP** (wrapper komponen RAG
  + konstanta budget + kontrak marker mention — masih dipakai jalur hidup).

### 3.5 Tipe frontend `AgentRunId` (temuan verifikasi — JANGAN terlewat)

`apps/web/lib/convex-refs.ts` mendefinisikan `AgentRunId = Id<"agentRuns">` dan
`toAgentRunId()`, dipakai di `message-row.tsx`, `chat-thread-state.tsx`,
`compact-thread-chat-panel.tsx`, `component-types.ts`. Karena `agentRuns` akan
di-drop, tipe ini akan rusak. Run id v2 adalah **string** (`run_*`).

- Ubah `AgentRunId` → alias `string` (atau branded string baru yang tidak terikat
  `Id<"agentRuns">`), sesuaikan `toAgentRunId()`.
- Telusuri pemakaian `onRetryRun`/`runId` di komponen — v2 `retryRun` menerima
  `string`. Selaraskan tipe agar typecheck app hijau.

### 3.6 Badge konteks per-pesan di web (sudah mati)

`message-row.tsx` membaca `message.metadata.{contextArtifacts,contextWorkspaces,
promptCommand,richContent}` yang **selalu `undefined`** di v2 (`listMessages` tak
mengembalikan `metadata`). Bersihkan UI mati + plumbing `contextArtifactSnapshot`
(`composer.tsx` membangunnya; `use-thread-experience-data-v2.ts` menerima-dan-
mengabaikannya). Tipe `ChatMessage.metadata`, `PromptCommandMetadata`,
`MessageContextArtifactMetadata`, `utils/message-context.ts` jadi tak terpakai.
→ **Keputusan produk P5** sebelum menghapus (lihat §4).

---

## 4. Keputusan produk yang perlu dikonfirmasi owner

Empat fitur ini "diam-diam berhenti bekerja" saat cutover (v2 merutekan konteks
via dispatch payload `apps/agents` dan skill via filesystem). Untuk tiap-tiap:
**drop penuh (terima regresi)** atau **bangun ulang v2-native**.

- **P1 — Pinned thread-context lintas-turn** (`threadContextArtifacts`/
  `threadContextWorkspaces`): v2 saat ini per-turn (composer @mention → contextRefs).
  Bila persistensi lintas-turn diinginkan: simpan id pin di `chatThreads`
  (mis. `pinnedArtifactIds`/`pinnedWorkspaceIds`) dan gabungkan ke `contextRefs`
  di sisi server saat `sendMessage`. **Default rekomendasi: drop** (perilaku per-turn
  sudah cukup; komentar lama di composer sudah stale).
- **P2 — Analitik aktivasi skill** (`skillActivations`/`skills`): SDK sudah
  re-inject skill body dari `.claude/skills` sendiri. Bila analitik pemakaian skill
  masih diinginkan: deteksi `PostToolUse`/tool `Skill` di `apps/agents` → tulis event
  ke `agentRunEvents2` (plan §5.2). **Default rekomendasi: drop tabel**, tambah event
  bila analitik diperlukan nanti.
- **P3 — Retrieval RAG ber-scope workspace** (jalur `listWorkspaceRagTargetsForThread`):
  manifest workspace per-pesan sudah ada (judul), tapi retrieval chunk ber-scope
  workspace hilang bila reader di-drop. Bila masih diinginkan: teruskan
  `contextWorkspaceIds` per-pesan ke `service.searchThreadDocuments`. **Default:
  drop** (manifest cukup; retrieval tetap jalan untuk upload-thread).
- **P4 — Rekonsiliasi biaya per-run** (`reconcileRunCost`) & **P5 — badge konteks/aksi
  per-pesan** (UI `message-row`): keduanya kini tanpa data. **Default: drop**; bangun
  ulang v2-native (baca `agentRuns2.costUsd`; expose `contextArtifactIds` di
  `listMessages`) hanya bila owner mau fiturnya kembali.

> Rekomendasi keseluruhan: **drop semuanya** (semua data dev, fitur bisa dibangun
> ulang v2-native kapan pun). Plan di §5 mengasumsikan jalur drop; bila owner memilih
> "bangun ulang" untuk salah satu, tambahkan langkah desain v2-native dari §3.

---

## 5. Urutan eksekusi (batch, lockstep, ber-gerbang)

> Tiap batch: edit kode + skema dalam satu perubahan, kosongkan baris dev tabel
> yang di-drop, jalankan gerbang §1, commit.

### Batch C1 — Lepas billing dari `agentRuns` + bersihkan tipe `AgentRunId`
1. Hapus `reconcileRunCost` (+ `aggregateRunCost`/test bila tak dibangun ulang).
2. Buang param/kolom `runId` di `billing/entitlements.ts` + `runIdValidator`.
3. Skema: hapus kolom `runId`+index `by_owner_run` di `providerUsageLedger` (263/288),
   `artifacts` (562/595), kolom `runId` `artifactVersions` (719); hapus `const runId`
   (schema.ts:9). (Kolom `runId` di tabel legacy lain ikut hilang saat tabelnya di-drop.)
4. `artifacts.ts:144`: hapus cabang klasifikasi `artifact.runId` (sumber default via
   `artifactType`/`storageId`).
5. Frontend: `AgentRunId` → `string` (§3.5) + selaraskan komponen.
6. Gerbang. (Belum drop tabel `agentRuns` di sini — masih dipakai cleanup; di Batch C5.)

### Batch C2 — `threadMetadata` → `chatThreads` + drop konteks-pesan mati
1. `artifacts.ts saveAttachmentToWorkspace`: repoint ke `chatThreads.workspaceId`.
2. `workspaces/moveModel.ts`: hapus blok sweep threadContext/threadMetadata.
3. `threadContext.ts`: hapus `persistMessageContextArtifacts`/`persistMessageContextWorkspaces`
   + helper terkait.
4. `accountCleanup/artifacts.ts`: hapus blok `messageContextArtifacts` + `messageArtifacts`.
5. Skema: drop `messageContextArtifacts`, `messageContextWorkspaces`, `messageArtifacts`,
   `messageWorkspaceArtifacts`, `messageCommands`, `messageRichContent`
   (kosongkan baris dev dulu). Hapus blok cleanup terkait di `accountCleanup/agent.ts`.
6. Gerbang.

### Batch C3 — Sederhanakan jalur RAG + drop tabel pinned/threadMetadata
1. `ragContext.ts`: rework `listRagTargetsForThread` agar tak baca
   `threadContextArtifacts`; tangani target workspace sesuai P3.
2. `threadContext.ts`: hapus `buildPromptContextForThread`, `listForThread`/`add`/
   `addMany`/`toggle`, `getThreadFiledWorkspaceId`/`listActiveWorkspaceIdsForThread`,
   import `skillRegistry`; sisakan hanya yang dipakai RAG.
3. `threadContextWorkspaces.ts`: hapus `listWorkspacesForThread` + mutation penulis
   (drop modul bila `listWorkspaceRagTargetsForThread` juga di-drop per P3).
4. `accountCleanup/agent.ts`: hapus blok `threadContextArtifacts` + `threadMetadata`.
5. Skema: drop `threadContextArtifacts`, `threadContextWorkspaces`, `threadMetadata`
   (kosongkan baris dev dulu).
6. Gerbang.

### Batch C4 — Retire subsistem skill Convex
1. Hapus `agent/skills/skillRegistry.ts` (importer satu-satunya sudah hilang di C3);
   hapus folder `agent/skills/` bila kosong.
2. Skema: drop `skills` + `skillActivations` (kosongkan baris dev dulu).
3. Gerbang. (P2: bila analitik diinginkan, tambah event `agentRunEvents2` di apps/agents.)

### Batch C5 — Drop cluster run/research/sandbox legacy + `agentRuns`
1. `accountCleanup/agent.ts`: hapus seluruh sisa blok baca+hapus legacy
   (`agentRunSteps`, `agentRunEvents`, `researchRoundStates`, `researchSources`,
   `researchExtracts`, `citationChecks`, `agentRuns`, `messageWorkspaceActions`).
   Sisakan `deleteV2AgentData`.
2. `workspaces.ts`: hapus/stub `listActionsForMessage`; bersihkan `message-row.tsx`
   (badge aksi) — atau sudah di C2/§3.6.
3. Skema: drop **sekluster** `citationChecks` + `researchSources` + `researchExtracts`
   + `computationChecks` + `sandboxRuns` (saling rujuk `v.id`), lalu `agentRunSteps`,
   `agentRunEvents`, `researchRoundStates`, `messageWorkspaceActions`, dan terakhir
   `agentRuns` (semua `v.id("agentRuns")` sudah hilang sejak C1). Kosongkan baris dev.
4. Gerbang.

### Batch C6 — Bersih-bersih frontend mati + dependency
1. `message-row.tsx`/`types`/`utils/message-context.ts`: hapus badge konteks-pesan
   mati + plumbing `contextArtifactSnapshot` (P5). `citation-integrity.tsx`/`run-progress.tsx`:
   bersihkan reader mati bila query-nya sudah dihapus.
2. `packages/convex/package.json`: hapus `@convex-dev/agent` + `@convex-dev/workflow`.
   (`apps/web` tetap simpan `@convex-dev/agent` untuk `useSmoothText`.)
3. `bun install` (perbarui lockfile). Gerbang penuh + `npx convex dev --once`.

---

## 6. Prosedur mekanis "kosongkan baris → drop tabel"

Karena `schemaValidation: true`, Convex menolak push skema yang menghapus tabel
ber-baris. Untuk tiap tabel yang di-drop (dev-only):

- **Opsi A (disarankan):** satu `internalMutation` sekali-pakai yang
  `.take(N)`-loop `ctx.db.delete` per tabel, panggil via `npx convex run` /
  dashboard, lalu hapus mutation-nya. Untuk tabel yang masih ada di blok
  `accountCleanup`, blok itu bisa di-repurpose sebagai pembersih sekali jalan
  sebelum dihapus.
- **Opsi B:** hapus baris lewat Convex dashboard ("Clear table").
- **Opsi C (paling cepat untuk dev murni):** karena tak ada data berharga, boleh
  juga reset/clear data deployment dev — tapi Opsi A lebih terkontrol.

Lalu hapus definisi tabel dari `schema.ts` dan `npx convex dev --once`.

---

## 7. Risiko & rollback

- **Kode**: tiap batch `git revert`-able; gerbang menahan regresi sebelum commit.
- **Data**: drop tabel **ireversibel**, tapi dapat diterima (dev-only, tanpa produksi).
- **Risiko utama** = melewatkan satu pembaca/penulis hidup → push gagal atau fitur
  rusak. Mitigasi: lockstep + gerbang `convex dev --once` (mendeteksi ref hilang)
  + checklist §8. Temuan verifikasi yang mudah terlewat: **tipe `AgentRunId` frontend**
  (§3.5) dan **rentang blok `accountCleanup` 15–111** (12 tabel, bukan 60–111).
- **Cross-ref `v.id` antar-tabel**: drop sekluster (citationChecks↔researchSources/
  researchExtracts/computationChecks↔sandboxRuns; messageArtifacts→artifactVersions
  yang tetap hidup). Urutan ini wajib agar validasi skema tidak menggantung.

---

## 8. Checklist berkas yang disentuh

**Skema:** `packages/convex/convex/schema.ts` — hapus 16 def tabel (16 dari 20; lihat
catatan), `const runId` (9), 3 kolom `v.id("agentRuns")` + index `by_owner_run`,
serta index dependen.

**Backend Convex:**
- `billing/reconciliation.ts` — hapus `reconcileRunCost` (+`aggregateRunCost`/test).
- `billing/entitlements.ts` — buang `runId`/`runIdValidator`; pertimbangkan hapus `recordProviderUsage`.
- `accountCleanup/agent.ts` — hapus blok legacy (~15–111), sisakan `deleteV2AgentData`.
- `accountCleanup/artifacts.ts` — hapus blok `messageContextArtifacts`/`messageArtifacts`.
- `artifacts.ts` — repoint `saveAttachmentToWorkspace` ke `chatThreads`; hapus cabang `runId` (:144).
- `workspaces/moveModel.ts` — hapus sweep threadContext/threadMetadata.
- `workspaces.ts` — hapus/stub `listActionsForMessage`.
- `agent/context/threadContext.ts` — pangkas ke permukaan RAG hidup; hapus prompt/skill/persist mati.
- `agent/context/threadContextWorkspaces.ts` — hapus query/mutation mati (atau seluruh modul per P3).
- `agent/context/ragContext.ts` — rework agar tak baca tabel pinned (KEEP berkas).
- `agent/skills/skillRegistry.ts` — **hapus berkas**; hapus folder `agent/skills/` bila kosong.
- `packages/convex/package.json` — hapus `@convex-dev/agent` + `@convex-dev/workflow`.

**Frontend (`apps/web`):**
- `lib/convex-refs.ts` — `AgentRunId` → `string`; sesuaikan `toAgentRunId`.
- `features/thread-experience/components/message-row.tsx` — hapus badge aksi/konteks-pesan mati + tipe terkait.
- `features/thread-experience/components/{chat-thread-state,compact-thread-chat-panel,component-types}.tsx/.ts` — selaraskan tipe run id.
- `features/thread-experience/utils/message-context.ts` + `types/index.ts` — hapus tipe/util konteks-pesan tak terpakai.
- `features/thread-experience/components/composer*.tsx` — hapus plumbing `contextArtifactSnapshot`; bersihkan komentar pinned-context stale.

**Tes:** hapus `tests/runCostReconciliation.test.ts` bila `aggregateRunCost` dibuang;
tambah/perbarui tes untuk `saveAttachmentToWorkspace` (jalur `chatThreads`) dan
`deleteV2AgentData` (sudah ada). Update convex-test yang menyentuh tabel/kolom yang di-drop.

---

## 9. Definition of done

- Semua 20 tabel legacy + `const runId` + 3 kolom `v.id("agentRuns")` hilang dari `schema.ts`.
- Tidak ada lagi `ctx.db.query/insert/patch/delete` ke tabel legacy di seluruh repo.
- `@convex-dev/agent`/`@convex-dev/workflow` hilang dari `packages/convex/package.json`.
- Gerbang penuh hijau: `bun run typecheck` + `bun run lint` + `bun run --filter '@aqsha/convex' test` + `npx convex dev --once` (push bersih, tanpa "Schema validation failed"/ref hilang).
- Keputusan P1–P5 tercatat (drop vs rebuild) dan terimplementasi sesuai pilihan owner.
- (Owner) promosi ke produksi via `npx convex deploy` saat siap.
