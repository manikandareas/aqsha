# Current State Qdrant dan Turso

## Status Dokumen

- Status: Active reference
- Product area: Academic / Research
- Repository: `aqshara-repo`
- Last updated: 2026-04-24
- Owner: Engineering

## Ringkasan

Dokumen ini merangkum current state subsystem `Qdrant` dan `Turso` yang dipakai untuk academic dan research workflow.

Fokus dokumen ini hanya pada:

- schema collection `Qdrant`
- schema tabel `Turso/SQLite`
- relasi data antara `Turso` dan `Qdrant`
- batasan yang perlu dipertahankan bila ada perubahan indexing atau retrieval

Yang tidak masuk ruang lingkup dokumen ini:

- migrasi `Convex`
- desain `PostgreSQL`
- desain `REST API`
- domain `journals` / workspace writing
- redesign agent workflow di luar kontrak data yang sudah ada

## Source of Truth

Rancangan current state di dokumen ini diturunkan dari area berikut:

- `packages/academic/src/schema/000_academic.sql`
- `packages/academic/src/schema/001_research.sql`
- `packages/academic/src/schema/002_promotion.sql`
- `packages/academic/src/qdrant/client.ts`
- `packages/academic/src/indexing/chunk-payload.ts`
- `packages/academic/src/indexing/paper-payload.ts`

## Final Decisions

- `Qdrant` tetap menjadi vector store untuk retrieval semantic.
- `Turso` tetap menjadi relational store untuk academic dan research workflow.
- Dokumen ini mendeskripsikan current state contract, bukan target redesign.
- Nama collection dan tabel existing dianggap kontrak yang harus dicek sebelum diubah.
- Bridge utama antara `Turso` dan `Qdrant` tetap berada pada layer `chunks` dan identifier point di Qdrant.

## Boundary

- `Turso` menyimpan canonical relational record untuk paper, chunk, ingestion, dan research workflow.
- `Qdrant` menyimpan embedding vector dan payload terindeks untuk search semantic.
- Retrieval semantic membaca vector/payload dari `Qdrant`, lalu dapat melakukan enrichment lanjutan dari data relational di `Turso`.
- Dokumen ini tidak menetapkan perubahan schema baru.

## Qdrant Schema

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

## Turso SQLite Schema

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

- `papers` adalah canonical academic record utama.
- `chunks` adalah bridge paling dekat ke Qdrant indexing layer.
- `embedding_jobs` adalah operational indexing queue.
- `research_sessions` sampai `workflow_events` adalah subsystem research workflow yang terpisah dari writing/workspace domain.

## Relasi Turso dan Qdrant

- `academic-paper-v1` merepresentasikan paper dari tabel `papers`.
- `academic-chunk-v1` merepresentasikan chunk dari tabel `chunks`.
- `chunks.qdrant_point_id` menjadi bridge utama dari `Turso` ke `Qdrant`.
- Metadata payload di `Qdrant` harus tetap cukup untuk filtering retrieval tanpa selalu join ke `Turso`.
- Record canonical non-vector tetap diperlakukan berada di `Turso`.

## Invariants

- Dimension vector existing diasumsikan `1536`; perubahan model embedding harus dianggap breaking change bila tidak kompatibel.
- `embeddingModel` dan `embeddingVersion` harus tetap tersedia di payload untuk rollout dan debugging.
- Collection names existing (`academic-paper-v1`, `academic-chunk-v1`) harus diperlakukan sebagai deployment contract sampai ada rencana migrasi eksplisit.
- Perubahan schema `chunks` yang memengaruhi `qdrant_point_id` harus diperlakukan sebagai perubahan lintas storage.

## Acceptance Criteria

- Dokumen hanya membahas `Qdrant` dan `Turso`.
- Collection `Qdrant` existing dan field payload utamanya terdokumentasi.
- Tabel `Turso` existing untuk academic dan research workflow terdokumentasi.
- Relasi `Turso` ke `Qdrant` tertulis eksplisit, termasuk `chunks.qdrant_point_id`.
- Tidak ada lagi isi tentang migrasi `Convex`, desain `PostgreSQL`, atau `REST API`.

## Assumptions

- Tidak ada redesign storage pada dokumen ini.
- Current state contract dipakai sebagai referensi implementasi dan evaluasi perubahan berikutnya.
- Academic/research subsystem tetap terpisah dari writing/workspace domain.
