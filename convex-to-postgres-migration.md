# Migrasi Convex ke PostgreSQL + REST API

## Status Dokumen

- Status: Draft for implementation
- Product area: Workspace / Writing
- Repository: `aqshara-repo`
- Last updated: 2026-04-23
- Owner: Engineering

## Ringkasan

Dokumen ini mendefinisikan target migrasi domain bisnis utama dari `Convex` ke `PostgreSQL` dengan `REST API` sebagai access layer utama. Fokus migrasi adalah workflow workspace writing yang saat ini memakai tabel `profiles`, `workspaces`, `documents`, `document_versions`, dan `exports`.

Untuk target arsitektur baru, istilah domain `documents` diubah menjadi `journals`. Perubahan ini berlaku konsisten pada module, nama tabel, dan REST path. `Clerk` tetap menjadi authentication provider. Frontend akan memanggil backend REST langsung dengan `Bearer Clerk JWT`.

Yang tidak masuk ke ruang lingkup V1:

- semua tabel `mastra_*`
- semua fitur dan route yang berhubungan dengan agents
- `prosemirror` collaborative sync sebagai backend replacement penuh

## Tujuan Migrasi

- Menjadikan `PostgreSQL` sebagai system of record untuk domain workspace dan journal.
- Mengganti `Convex query/mutation/action` dengan `REST API` yang eksplisit dan stabil.
- Mempertahankan behavior penting yang sudah ada:
  - provisioning user + workspace dari `Clerk`
  - optimistic locking berbasis `baseUpdatedAt`
  - idempotency untuk export request
  - quota tracking per workspace
  - audit/version history untuk journal
- Menyiapkan schema yang lebih idiomatis untuk PostgreSQL tanpa mengubah product behavior secara drastis.

## Source of Truth

Rancangan di dokumen ini diturunkan dari area berikut:

- `packages/backend/convex/schema.ts`
- `packages/backend/convex/session.ts`
- `packages/backend/convex/lib/session.ts`
- `packages/backend/convex/lib/auth.ts`
- `packages/backend/convex/documents.ts`
- `packages/backend/convex/exports.ts`
- `packages/academic/src/schema/000_academic.sql`
- `packages/academic/src/schema/001_research.sql`
- `packages/academic/src/schema/002_promotion.sql`
- `packages/academic/src/qdrant/client.ts`
- `packages/academic/src/indexing/chunk-payload.ts`
- `packages/academic/src/indexing/paper-payload.ts`

## Final Decisions

- Authentication provider tetap `Clerk`
- API access style final: direct `REST API`
- Database utama untuk workspace/journal domain: `PostgreSQL`
- Domain term `documents` diganti menjadi `journals`
- Naming convention:
  - `plural` untuk module, folder, table, dan REST path
  - `singular` untuk entity, DTO, dan record type
- `Qdrant` dan `Turso/SQLite` hanya masuk sebagai current-state appendix, bukan target migrasi utama
- `prosemirror` sync ditunda ke `Phase 2`

## Target Arsitektur

### High-level flow

1. User login melalui `Clerk`.
2. Frontend mengambil `Clerk JWT`.
3. Frontend memanggil backend REST dengan `Authorization: Bearer <token>`.
4. Backend memverifikasi token ke `Clerk`.
5. Backend memetakan identity ke row `users` dan `workspaces`.
6. Backend membaca/menulis data ke `PostgreSQL`.

### Boundary

- `PostgreSQL` menyimpan semua state utama untuk `users`, `workspaces`, `journals`, `journal_versions`, dan `exports`.
- File binary dan artifact hasil proses tetap diasumsikan berada di object storage. Di schema baru dipakai field `storage_key`, bukan storage id internal Convex.
- `Qdrant` dan `Turso` tetap eksis untuk academic/research subsystem yang terpisah dari journal workspace domain.

## Excluded Scope

Hal berikut harus dinyatakan eksplisit sebagai out of scope:

- semua tabel `mastra_*`
- semua route `apps/web/app/api/agents/*`
- semua code `apps/web/lib/mastra/agents/*`
- workflow thread, chat, dan research agent
- migration design untuk `prosemirror` realtime sync sebagai bagian dari V1

## Module Overview

Module backend V1 yang harus dimiliki:

- `users`
- `workspaces`
- `workspace_members`
- `journals`
- `journal_versions`
- `exports`

Mapping dari Convex ke PostgreSQL:

| Convex | PostgreSQL target | Catatan |
|---|---|---|
| `profiles` | `users` | rename domain |
| `workspaces` | `workspaces` | tetap |
| n/a | `workspace_members` | tambahan normalisasi PostgreSQL |
| `documents` | `journals` | rename domain |
| `document_versions` | `journal_versions` | rename domain |
| `exports` | `exports` | tetap |

## PostgreSQL Design Principles

- Gunakan `uuid` sebagai primary key.
- Gunakan `timestamptz` untuk seluruh field waktu.
- Gunakan `jsonb` untuk payload kompleks seperti `content_json`, `outline_json`, dan `warnings_snapshot`.
- Gunakan `text` + `CHECK` untuk status/type yang sebelumnya berbasis literal union.
- Semua tabel utama memiliki `created_at` dan `updated_at`, kecuali tabel historis append-only yang cukup `created_at`.
- Hindari PostgreSQL enum di V1 agar rollout perubahan status/type tetap ringan.
- Pertahankan soft delete hanya bila behavior existing memang bergantung padanya.

## PostgreSQL Schema

### `users`

Purpose: canonical application user yang berasal dari `Clerk`.

Columns:

- `id uuid primary key`
- `clerk_user_id text not null unique`
- `auth_token_identifier text not null unique`
- `email text not null`
- `name text null`
- `avatar_url text null`
- `onboarding_completed_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Notes:

- `clerk_user_id` berasal dari `identity.subject`
- `auth_token_identifier` mempertahankan behavior existing yang saat ini memakai `identity.tokenIdentifier`

### `workspaces`

Purpose: tenant utama untuk semua journal workflow.

Columns:

- `id uuid primary key`
- `owner_user_id uuid not null references users(id)`
- `name text not null`
- `slug text null`
- `active_journal_count integer not null default 0`
- `archived_journal_count integer not null default 0`
- `ai_actions_used integer not null default 0`
- `ai_actions_reserved integer not null default 0`
- `exports_used integer not null default 0`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes and constraints:

- unique index on `slug` where `slug is not null`
- index on `owner_user_id`

### `workspace_members`

Purpose: normalisasi membership agar schema siap untuk multi-member walau V1 masih single-owner.

Columns:

- `id uuid primary key`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `user_id uuid not null references users(id) on delete cascade`
- `role text not null check (role in ('owner', 'member'))`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes and constraints:

- unique `(workspace_id, user_id)`
- index on `user_id`

Default V1:

- setiap workspace harus punya tepat satu row `workspace_members` dengan role `owner`

### `journals`

Purpose: canonical journal/workspace writing entity.

Columns:

- `id uuid primary key`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `owner_user_id uuid not null references users(id)`
- `title text not null`
- `type text not null check (type in ('general', 'proposal', 'thesis'))`
- `status text not null check (status in ('active', 'archived'))`
- `content_json jsonb not null`
- `outline_json jsonb null`
- `plain_text text null`
- `archived_at timestamptz null`
- `last_opened_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes and constraints:

- index `(workspace_id, archived_at)`
- index `(workspace_id, updated_at desc)`
- index `(owner_user_id)`
- optional `pg_trgm` index pada `title` untuk search title parity

### `journal_versions`

Purpose: immutable history snapshot untuk journal.

Columns:

- `id uuid primary key`
- `journal_id uuid not null references journals(id) on delete cascade`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `created_by_user_id uuid not null references users(id)`
- `version_number integer not null`
- `content_json jsonb not null`
- `plain_text text null`
- `trigger text not null check (trigger in ('journal_create', 'outline_apply', 'manual_save'))`
- `snapshot_label text null`
- `created_at timestamptz not null`

Indexes and constraints:

- unique `(journal_id, version_number)`
- index `(journal_id, created_at desc)`

Note:

- walau trigger existing masih `document_create`, di dokumen migrasi gunakan istilah baru `journal_create`

### `exports`

Purpose: export artifact lifecycle, saat ini untuk `docx`.

Columns:

- `id uuid primary key`
- `journal_id uuid not null references journals(id) on delete cascade`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `owner_user_id uuid not null references users(id)`
- `export_type text not null check (export_type in ('docx'))`
- `status text not null check (status in ('queued', 'processing', 'ready', 'failed'))`
- `storage_key text null`
- `warnings_snapshot jsonb null`
- `idempotency_key text null`
- `retry_count integer not null default 0`
- `error_message text null`
- `error_code text null`
- `ready_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes and constraints:

- index `(journal_id, status)`
- index `(workspace_id)`
- unique index on `(journal_id, idempotency_key)` where `idempotency_key is not null`

## Provisioning and Auth Rules

### Authentication

- Semua protected endpoint harus menerima `Authorization: Bearer <Clerk JWT>`.
- Backend wajib memverifikasi token ke `Clerk`.
- Jika token invalid atau tidak ada, return `401` dengan error model `unauthorized`.

### Authorization

- User hanya boleh mengakses workspace miliknya sendiri pada V1.
- Semua akses ke `journals` dan `exports` harus diverifikasi terhadap `workspace_id` user aktif.

### Provisioning

Endpoint `POST /session/ensure-profile` harus:

1. membaca identity dari token Clerk
2. mencari `users.auth_token_identifier`
3. jika ada, update metadata `email`, `name`, `avatar_url`, `updated_at`
4. jika tidak ada:
   - buat `workspaces`
   - buat `users`
   - buat `workspace_members` role `owner`

## REST API by Module

Semua response shape di bawah mengikuti naming baru `journals`.

### Session

#### `GET /session/bootstrap`

Purpose: menggantikan `getAppSession`.

Response `200`:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User",
    "avatarUrl": null,
    "planCode": "free"
  },
  "workspace": {
    "id": "uuid",
    "userId": "uuid",
    "ownerUserId": "uuid",
    "name": "User Workspace",
    "slug": null
  },
  "plan": {
    "code": "free",
    "label": "Free"
  },
  "usage": {
    "period": "2026-04",
    "aiActionsUsed": 0,
    "aiActionsReserved": 0,
    "aiActionsRemaining": 10,
    "exportsRemaining": 3
  },
  "journalStats": {
    "activeCount": 0,
    "archivedCount": 0
  },
  "onboarding": {
    "shouldShow": true,
    "reason": "missing_first_journal"
  }
}
```

Response `200` dapat berupa `null` bila user belum terprovision.

#### `GET /session/onboarding`

Response `200`:

```json
{
  "shouldShow": true,
  "reason": "missing_first_journal"
}
```

atau `null`.

#### `POST /session/ensure-profile`

Request body: none

Responses:

- `204 No Content`
- `401 Unauthorized`

### Journals

#### `GET /journals`

Query params:

- `status=active|archived` optional, default `active`
- `q` optional
- `limit` optional

Behavior:

- tanpa `q`, return list journal
- dengan `q`, lakukan title search

Response `200`:

```json
[
  {
    "id": "uuid",
    "workspaceId": "uuid",
    "ownerUserId": "uuid",
    "title": "Untitled",
    "type": "general",
    "status": "active",
    "contentJson": [],
    "outlineJson": null,
    "plainText": null,
    "archivedAt": null,
    "lastOpenedAt": "2026-04-23T00:00:00Z",
    "createdAt": "2026-04-23T00:00:00Z",
    "updatedAt": "2026-04-23T00:00:00Z"
  }
]
```

#### `GET /journals/:id`

Response `200`: `JournalRecord`

Responses:

- `200 OK`
- `404 Not Found`

#### `POST /journals`

Request:

```json
{
  "title": "Untitled",
  "type": "general"
}
```

Behavior:

- create default content
- increment workspace active counter
- mark onboarding complete bila ini journal pertama
- create `journal_versions` row pertama dengan trigger `journal_create`

Response `201`: `JournalRecord`

#### `PATCH /journals/:id`

Request:

```json
{
  "title": "New title",
  "type": "proposal"
}
```

Response `200`: `JournalRecord`

#### `PUT /journals/:id/content`

Request:

```json
{
  "baseUpdatedAt": "2026-04-23T00:00:00Z",
  "title": "Updated title",
  "contentJson": []
}
```

Behavior:

- enforce optimistic locking by `baseUpdatedAt`
- return `409` bila stale save

Response `200`: `JournalRecord`

#### `PUT /journals/:id/outline`

Request:

```json
{
  "baseUpdatedAt": "2026-04-23T00:00:00Z",
  "outline": {
    "title": "Outline",
    "nodes": []
  }
}
```

Behavior:

- apply outline ke `content_json`
- create new `journal_versions` row dengan trigger `outline_apply`

Response `200`: `JournalRecord`

#### `POST /journals/:id/archive`

Behavior:

- set `status = archived`
- set `archived_at`
- update workspace counters

Response `200`: `JournalRecord`

#### `POST /journals/:id/restore`

Behavior:

- set `status = active`
- clear `archived_at`
- update workspace counters

Response `200`: `JournalRecord`

#### `DELETE /journals/:id`

Behavior:

- hard delete `journals`
- hard delete dependent `journal_versions` dan `exports`
- delete linked stored artifacts
- update workspace counters

Response `200`:

```json
{
  "ok": true
}
```

#### `GET /journals/:id/versions`

Query params:

- `limit` optional

Response `200`:

```json
[
  {
    "id": "uuid",
    "journalId": "uuid",
    "workspaceId": "uuid",
    "versionNumber": 1,
    "contentJson": [],
    "plainText": null,
    "trigger": "journal_create",
    "snapshotLabel": null,
    "createdByUserId": "uuid",
    "createdAt": "2026-04-23T00:00:00Z"
  }
]
```

### Exports

#### `GET /journals/:id/exports/preflight`

Response `200`:

```json
{
  "ready": true,
  "blockers": [],
  "warnings": []
}
```

#### `POST /journals/:id/exports`

Request:

```json
{
  "idempotencyKey": "client-generated-key"
}
```

Response `200`:

```json
{
  "export": {},
  "isReplay": false,
  "preflightWarnings": []
}
```

Behavior:

- enforce quota
- reject bila preflight blocker ada
- replay-safe by `idempotencyKey`
- current export type hanya `docx`

#### `GET /exports`

Query params:

- `journalId` optional
- `status` optional
- `limit` optional

Response `200`: `ExportRecord[]`

#### `GET /exports/:id`

Response `200`: `ExportRecord`

#### `GET /exports/:id/download-url`

Response `200`:

```json
{
  "downloadUrl": "https://storage.example.com/..."
}
```

atau

```json
{
  "downloadUrl": null
}
```

#### `POST /exports/:id/retry`

Response `200`:

```json
{
  "export": {},
  "isReplay": false
}
```

## Domain Types

Dokumen implementasi harus memakai naming berikut:

- `ProfileRecord` -> `UserRecord`
- `DocumentRecord` -> `JournalRecord`
- `DocumentVersionRecord` -> `JournalVersionRecord`
- `CreateDocumentInput` -> `CreateJournalInput`
- `UpdateDocumentInput` -> `UpdateJournalInput`
- `SaveDocumentContentInput` -> `SaveJournalContentInput`

## Error Handling

Gunakan error model yang konsisten:

```json
{
  "error": {
    "code": "stale_journal_save",
    "message": "This journal changed before your save completed."
  }
}
```

Code yang perlu dipertahankan secara semantik:

- `unauthorized`
- `workspace_not_found`
- `journal_not_found`
- `export_not_found`
- `quota_exceeded`
- `stale_journal_save`
- `export_blocked`
- `export_generation_failed`

## Migration Notes

- Current Convex counters `activeDocumentCount` dan `archivedDocumentCount` harus di-rename menjadi `active_journal_count` dan `archived_journal_count`.
- Existing `planCode` dipertahankan pada subscription/session layer. `aiActionsUsed`, `aiActionsReserved`, dan `exportsUsed` tetap dipertahankan secara semantik pada workspace usage.
- Semua referensi `ownerProfileId` diubah menjadi `ownerUserId`.
- Semua referensi `documentId` pada domain utama diubah menjadi `journalId`.
- Storage identifier lama dari Convex tidak perlu dipertahankan secara naming; gunakan `storage_key` untuk layer baru.

## Appendix A: Current Qdrant Schema

### Collections

#### `academic-paper-v1`

Vector config:

- `size = 1536`
- `distance = Cosine`
- embedding model existing: `text-embedding-3-small`
- embedding version existing: `v1`

Primary payload fields:

- `paperId`
- `title`
- `doi`
- `openAlexId`
- `semanticScholarId`
- `arxivId`
- `year`
- `language`
- `paperType`
- `contentTier`
- `sourcePriority`
- `citationCount`
- `referenceCount`
- `isOpenAccess`
- `indonesiaAffiliated`
- `authorAffiliationCountries`
- `institutionCountries`
- `openAlexTopicIds`
- `embeddingModel`
- `embeddingVersion`

Indexed payload fields:

- keyword: `paperId`, `contentTier`, `doi`, `openAlexId`, `semanticScholarId`, `arxivId`, `language`, `paperType`, `sourcePriority`, `authorAffiliationCountries`, `institutionCountries`, `openAlexTopicIds`, `embeddingModel`, `embeddingVersion`
- integer: `year`, `citationCount`, `referenceCount`
- bool: `isOpenAccess`, `indonesiaAffiliated`

#### `academic-chunk-v1`

Vector config:

- `size = 1536`
- `distance = Cosine`

Primary payload fields:

- `chunkId`
- `chunkIndex`
- `paperId`
- `paperTitle`
- `paperType`
- `year`
- `contentTier`
- `section`
- `snippet`
- `sourceOrigin`
- `textType`
- `embeddingModel`
- `embeddingVersion`

Indexed payload fields:

- keyword: `paperId`, `chunkId`, `embeddingModel`, `embeddingVersion`, `section`, `sourceOrigin`, `textType`, `contentTier`, `paperType`
- integer: `year`, `chunkIndex`

### Relation to Turso

- `academic-paper-v1` merepresentasikan paper dari tabel `papers`
- `academic-chunk-v1` merepresentasikan chunk dari tabel `chunks`
- `chunks.qdrant_point_id` menjadi bridge utama dari Turso ke Qdrant

## Appendix B: Current Turso SQLite Schema

### Academic tables

- `papers`
- `ingestion_runs`
- `paper_sources`
- `authors`
- `paper_authors`
- `paper_edges`
- `chunks`
- `embedding_jobs`

### Research workflow tables

- `research_sessions`
- `claims`
- `claim_evidence`
- `citations`
- `workflow_events`

### Internal table

- `_academic_migrations`

### Notes

- `papers` adalah canonical academic record utama
- `chunks` adalah bridge paling dekat ke Qdrant indexing layer
- `embedding_jobs` adalah operational indexing queue
- `research_sessions` sampai `workflow_events` adalah subsystem research workflow yang terpisah dari journal workspace domain

## Phase 2 / Deferred

Item berikut sengaja tidak dirancang detail pada V1:

- replacement untuk `prosemirror` snapshot/steps sync
- transport realtime untuk collaborative editing
- full migration design untuk route AI streaming yang masih nyaman dijalankan lewat web/BFF layer
- redesign academic subsystem di `Turso` dan `Qdrant`

Jika collaborative editing tetap wajib setelah Convex dilepas, maka Phase 2 harus menambahkan module terpisah untuk:

- `GET /collab/journals/:id/snapshot`
- `POST /collab/journals/:id/snapshot`
- `GET /collab/journals/:id/steps`
- `POST /collab/journals/:id/steps`
- version reconciliation dan conflict recovery

## Acceptance Criteria

- Semua tabel Convex non-`mastra` pada domain workspace writing telah terpetakan ke schema PostgreSQL baru.
- Rename `documents` -> `journals` konsisten di seluruh module, tabel, dan endpoint.
- `Clerk` tertulis eksplisit sebagai auth source yang dipertahankan.
- Semua endpoint REST utama untuk `session`, `journals`, dan `exports` terdefinisi.
- Quota, idempotency, optimistic locking, dan version history tertulis eksplisit.
- Appendix `Qdrant` dan `Turso` sesuai dengan state repo saat ini.
- `prosemirror` collaborative sync tertulis eksplisit sebagai `Phase 2`.

## Assumptions

- Direct REST adalah gaya akses final yang diinginkan.
- V1 memprioritaskan parity workflow journal/workspace yang aktif saat ini, bukan redesign product behavior.
- Object storage tetap tersedia pada arsitektur baru.
- Academic/research subsystem tidak dipindahkan ke PostgreSQL pada gelombang migrasi ini.
