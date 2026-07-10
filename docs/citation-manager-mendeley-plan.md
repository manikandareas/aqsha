# Rencana: Workspace Citation Manager + Mendeley

> Status: **DRAFT PLAN** — belum diimplementasikan. Dibuat 2026-07-10.
> Bahasa: Indonesia (istilah teknis tetap English), sesuai `AGENTS.md`.

## 1. Tujuan

Menambahkan **Citation Manager** pada halaman workspace detail Aqsha agar pengguna dapat:

1. Mengimpor koleksi referensi hasil ekspor Mendeley.
2. Menyimpan, memeriksa, mencari, memberi tag, dan menghapus duplikat referensi pada scope workspace.
3. Menyisipkan sitasi stabil ke dokumen BlockNote dan menghasilkan daftar pustaka dari sitasi yang dipakai.
4. Mengekspor koleksi atau bibliography ke BibTeX/RIS.
5. Pada fase lanjutan, menghubungkan akun Mendeley melalui OAuth untuk sinkronisasi metadata terkontrol.

**Bukan tujuan v1:** mengganti Mendeley, menjadikan Mendeley sebagai provider login Aqsha, melakukan mirror dua arah, atau mengunduh semua PDF Mendeley otomatis.

## 2. Keputusan produk yang dikunci

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Login Aqsha tetap Clerk. | Koneksi Mendeley adalah integrasi data tambahan, bukan identitas pengguna Aqsha. |
| 2 | V1 adalah **import-first** (`.bib` dan `.ris`), tanpa OAuth. | Onboarding cepat, tidak ada token eksternal, dan format tersebut didukung oleh alur ekspor/impor Mendeley. |
| 3 | OAuth Mendeley menjadi fase 4, opt-in. | Perlu aplikasi developer, token encryption, UX consent, sync cursor, dan conflict handling. |
| 4 | Aqsha menyimpan salinan bibliografi workspace sendiri. | Citation dan bibliography harus tetap bekerja saat koneksi Mendeley putus atau user disconnect. |
| 5 | PDF Mendeley tidak diimpor otomatis. | Metadata jauh lebih aman dan ringan; file berpotensi memiliki hak akses/lisensi serta ukuran besar. User boleh memilih import file secara eksplisit pada fase lanjutan. |
| 6 | Citation Library adalah entitas baru, bukan sekadar `artifact_paper_metadata` atau `research_sources`. | Referensi dapat tidak memiliki file Aqsha, satu referensi bisa dipakai oleh banyak dokumen, dan sumber chat bersifat thread/turn-scoped. |
| 7 | Style default disimpan per workspace; citation dalam dokumen menyimpan `citationId`, bukan teks hasil format. | Pergantian style dapat merender ulang seluruh citation dan bibliography secara aman. |
| 8 | V1 menyediakan APA 7, IEEE, Vancouver, dan Chicago Author-Date lewat CSL engine. | Keempat style mencakup kebutuhan awal tanpa mengklaim seluruh katalog style Mendeley. |

## 3. Kondisi repo saat ini

### 3.1 Workspace dan artifact

- Route workspace detail: `apps/web/app/app/(product)/workspaces/[workspaceId]/page.tsx` → `WorkspaceDetailClient`.
- Konten utama adalah `WorkspaceLibrarySurface`/`WorkspaceLibraryBoard`; toolbar sudah menangani create document, upload file, save URL, folder, search, filter, dan sort.
- API workspace artifact sudah ber-owner scope melalui `ArtifactService.list` dan `WorkspaceService.assertWorkspaceOwner`.
- `artifact_paper_metadata` sudah menyimpan metadata paper workspace: `title`, `abstract`, `doi`, `authors`, `journal`, `publisher`, `publishedYear`, `keywords`, `metadataSource`, dan `sourceUrl`.
- PDF dan URL akademik telah melalui resolver/enrichment. Ini dapat menjadi kandidat reference yang sudah punya artifact, tetapi belum merupakan Citation Library.

### 3.2 Citation yang telah ada

- `packages/services/src/research/references.ts` memformat **`research_sources` per thread** menjadi APA 7, BibTeX, dan RIS.
- `apps/web/components/ai-elements/inline-citation.tsx` merender nomor sumber `[n]` pada jawaban Astra.
- `apps/web/features/artifacts/utils/citation.ts` memiliki helper format satu paper untuk UI artifact.
- Tidak ada endpoint, table, read model, atau UI untuk koleksi sitasi **workspace-scoped**.

**Konsekuensi:** formatter sumber chat tidak boleh dijadikan source of truth Citation Manager. Keduanya dapat berbagi primitive normalisasi DOI, export, dan CSL renderer setelah diekstrak dengan hati-hati, tetapi lifecycle datanya berbeda.

### 3.3 Editor dokumen

- Dokumen markdown memakai BlockNote melalui `blocknote-document-editor.tsx` dan dipersist ke `artifact_contents.blocksJson`, `markdown`, serta `plainText`.
- `artifactId` dan block ID BlockNote stabil, sehingga siap menjadi anchor untuk usage citation.
- Belum ada inline citation node, bibliography block, atau query citation workspace dari editor.

## 4. Desain pengalaman pengguna

### 4.1 Posisi dalam workspace detail

Tambahkan segmented view di toolbar workspace:

```text
Workspace name          Library | Citations                   Chat
```

- State view disimpan di URL: `?view=library` (default) dan `?view=citations`.
- Citation Manager mengambil area konten utama, bukan right panel; right panel tetap khusus chat Astra.
- URL yang bisa dibagikan: `/app/workspaces/:workspaceId?view=citations`.
- Counter `Citations (42)` ditampilkan setelah data tersedia; jangan blocking render Library hanya demi menghitung counter.

### 4.2 Empty state

Jika belum ada reference, tampilkan tiga tindakan:

1. **Import from Mendeley** — menerima `.bib` dan `.ris`.
2. **Add by DOI** — resolver metadata Aqsha.
3. **Add manually** — form type, title, author, year, venue, URL/DOI.

Tombol **Connect Mendeley** ditampilkan sebagai “Coming next” sampai fase OAuth benar-benar tersedia; jangan menawarkan alur yang belum berfungsi.

### 4.3 Flow import Mendeley (v1)

```text
Mendeley Export (.bib/.ris)
        → upload file
        → parse + normalize server-side
        → preview valid / incomplete / duplicate
        → user pilih record dan policy duplicate
        → commit batch
        → Citation Library workspace
```

1. User di Mendeley melakukan Export ke BibTeX atau RIS.
2. User memilih **Import from Mendeley** pada workspace Aqsha.
3. Frontend mengunggah file ke API preview; API memvalidasi ukuran, format, batas record, dan parser error.
4. Preview menampilkan jumlah valid, incomplete, duplicate, serta error per baris.
5. User memilih record yang diimpor dan policy: `skip duplicates` (default), `merge missing fields`, atau `import anyway`.
6. Commit membuat/merge `workspace_citations`, lalu menampilkan summary yang dapat dibatalkan selama batch belum dipakai dokumen.

### 4.4 Citation Library view

Kolom list/table:

- checkbox bulk action;
- title dan document type;
- first author + year;
- venue/publisher;
- DOI/URL;
- tags;
- metadata status: `verified`, `needs-review`, `incomplete`, `duplicate`;
- source badge: `Mendeley import`, `Aqsha artifact`, `manual`, atau nanti `Mendeley sync`.

Tindakan per item:

- open detail drawer;
- edit metadata;
- link/unlink artifact Aqsha;
- copy formatted citation;
- mark as reviewed;
- merge duplicate;
- delete dari workspace (tidak menghapus artifact/file asli).

Bulk action: tag, export selected, merge suggestion, delete selected.

### 4.5 Citation di BlockNote

1. User membuka dokumen markdown di workspace.
2. `/citation` atau tombol **Cite** membuka citation picker yang mencari Citation Library workspace aktif.
3. User memilih satu atau beberapa references; editor menaruh inline citation node yang hanya menyimpan `citationIds` dan optional locator (`page`, `chapter`, `prefix`, `suffix`).
4. Node merender preview sesuai style workspace; perubahan style hanya mengubah render, bukan ID referensi di dokumen.
5. `/bibliography` menambahkan bibliography block yang mengumpulkan citation node dokumen dalam urutan kemunculan atau urutan alphabetic menurut style.
6. Reference yang dihapus dari library tetapi sudah dipakai dokumen berubah menjadi status `missing`; user harus restore, remap, atau remove citation secara eksplisit. Jangan diam-diam menghapus node dari dokumen.

### 4.6 Integrasi Astra (setelah core stabil)

Saat composer berada pada workspace:

- user dapat memilih reference dari Citation Manager sebagai context chip;
- Astra menerima metadata terstruktur saja, bukan token Mendeley atau full PDF secara otomatis;
- tool dapat menyarankan citation untuk draft, tetapi menyisipkan citation ke dokumen tetap melalui action user/editor;
- respons Astra harus membedakan sumber workspace yang dipilih dari hasil web research per thread.

## 5. Kontrak data

### 5.1 Canonical record

Gunakan CSL-JSON sebagai payload canonical (`cslJson`) karena format tersebut cukup untuk render CSL dan tidak mengikat Aqsha pada bentuk BibTeX/RIS/Mendeley.

Normalisasi minimum:

```ts
type CitationRecord = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  artifactId: string | null;
  source: "mendeley_import" | "mendeley_sync" | "artifact" | "doi" | "manual";
  externalId: string | null; // Mendeley document id pada phase OAuth
  documentType: string;
  title: string;
  authors: Array<{ family?: string; given?: string; literal?: string }>;
  publishedYear: number | null;
  venue: string | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
  tags: string[];
  cslJson: unknown;
  canonicalKey: string;
  metadataStatus: "verified" | "needs_review" | "incomplete";
  createdAt: number;
  updatedAt: number;
};
```

`canonicalKey` diprioritaskan sebagai `doi:<normalized DOI>`, lalu `isbn:<normalized ISBN>`, lalu hash normalisasi `title + year + first-author`. Key ini dipakai untuk candidate duplicate, **bukan** global hard uniqueness pada fallback title karena false-positive masih mungkin.

### 5.2 Tabel dan migration

Migration baru di `packages/db/drizzle/`; nomor migration ditentukan saat implementasi dari nomor terakhir, jangan mengasumsikan nomor di plan ini.

#### `workspace_citations`

| Kolom | Catatan |
|---|---|
| `id`, `owner_user_id`, `workspace_id` | PK dan owner/workspace scope wajib |
| `artifact_id` nullable | FK artifact; satu artifact boleh belum punya citation dan citation boleh tanpa artifact |
| `source`, `external_id` | provenance serta id Mendeley di fase 4 |
| `document_type`, `title`, `authors_json`, `published_year`, `venue`, `publisher`, `doi`, `url`, `tags` | read/query model terindeks |
| `csl_json` | canonical complete record |
| `canonical_key` | dedupe candidate |
| `metadata_status`, `reviewed_at` | quality workflow |
| `created_at`, `updated_at`, `deleted_at` | soft delete agar usage dokumen tetap bisa didiagnosis |

Index minimum:

- `(owner_user_id, workspace_id, updated_at)` untuk list keyset;
- `(owner_user_id, workspace_id, doi)` untuk dedupe DOI;
- `(owner_user_id, workspace_id, canonical_key)`;
- `(owner_user_id, artifact_id)`;
- unique partial `(owner_user_id, workspace_id, source, external_id)` saat `external_id is not null`.

#### `workspace_citation_settings`

One-to-one dengan workspace: `workspace_id`, `owner_user_id`, `default_style_id`, `bibliography_sort`, timestamps. Default `apa-7th-edition`.

#### `citation_import_batches`

Menyimpan audit batch, bukan source of truth permanen: `id`, owner/workspace, source format, original filename, total/valid/duplicate/error counts, `summary_json`, `committed_at`, timestamps. Raw file dan raw metadata tidak perlu dipertahankan setelah parse/commit kecuali kebutuhan support disetujui.

#### `document_citation_usages` (fase BlockNote)

`document_artifact_id`, `citation_id`, `inline_node_id`, `occurrence_order`, `locator_json`, timestamps. Tabel ini adalah index/diagnostic; `blocksJson` tetap menyimpan node citation agar dokumen portable. Rekonsiliasi dilakukan ketika dokumen disimpan.

### 5.3 Metadata dari artifact

Tambah service helper `CitationService.createFromArtifact`:

- membaca `artifact_paper_metadata` dan artifact owner/workspace;
- membuat citation draft hanya bila paper metadata memiliki title atau DOI;
- menghubungkan `artifactId` tanpa memindahkan atau menduplikasi file;
- menjalankan dedupe yang sama dengan import.

Jangan mengubah `artifact_paper_metadata` menjadi canonical citation row. Metadata extraction tetap fokus pada enrichment artifact; Citation Manager menangani editorial choice, tag, style, usage, dan provenance import.

## 6. API dan service boundary

`apps/web` hanya memanggil Eden Treaty (`@aqsha/api`); tidak mengimpor `@aqsha/db` atau `@aqsha/services`.

### 6.1 Endpoint v1

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/workspaces/:id/citations` | keyset list + search/filter/status/tag |
| `GET` | `/workspaces/:id/citations/:citationId` | detail citation |
| `POST` | `/workspaces/:id/citations` | create manual / create-by-DOI |
| `PATCH` | `/workspaces/:id/citations/:citationId` | edit metadata/tag/link artifact |
| `DELETE` | `/workspaces/:id/citations/:citationId` | soft delete dengan guard usage |
| `POST` | `/workspaces/:id/citations/imports/preview` | multipart `.bib`/`.ris` → preview batch |
| `POST` | `/workspaces/:id/citations/imports/:batchId/commit` | commit selected entries + duplicate policy |
| `POST` | `/workspaces/:id/citations/duplicates/merge` | merge explicit source/target id |
| `GET` | `/workspaces/:id/citations/export` | `bibtex`, `ris`, `csl-json` |
| `POST` | `/workspaces/:id/citations/render` | preview citation/bibliography dengan style tertentu |
| `GET/PATCH` | `/workspaces/:id/citation-settings` | default style dan sort bibliography |

Setiap route memanggil service yang lebih dahulu melakukan `WorkspaceService.assertWorkspaceOwner`. Error baru harus memakai `appError` terstruktur dan frontend menampilkan `readableApiErrorMessage`, bukan `error.message` mentah.

### 6.2 `packages/services`

Modul baru yang disarankan:

- `citation.service.ts`: CRUD, authorization, dedupe, merge, quality status, export.
- `citation-import.service.ts`: safe parser adapter, preview, batch commit, limits, diagnostics.
- `citation-format.service.ts`: CSL rendering dan conversion output.
- `citation-normalize.ts`: DOI, ISBN, title, author, canonical key, input validation; pure dan unit-testable.

Lakukan technical spike sebelum memilih library parser/CSL:

1. Parse BibTeX dan RIS hasil ekspor Mendeley nyata.
2. Convert keduanya ke CSL-JSON tanpa kehilangan author, DOI, type, container, dan date penting.
3. Render APA 7, IEEE, Vancouver, Chicago dengan deterministic output.
4. Uji browser/server bundle agar engine hanya berjalan pada API/service bila ukuran bundle frontend tidak diperlukan.

Jangan melanjutkan formatter APA manual `research/references.ts` sebagai engine multi-style; formatter itu memiliki asumsi source chat dan author cap yang tidak cocok bagi bibliography workspace.

### 6.3 Input safety dan limits

- terima hanya `.bib` dan `.ris` pada v1, content-type tidak dipercaya sendirian;
- ukuran awal maksimal 10 MB dan maksimal 5.000 records per batch;
- parser berjalan server-side dengan timeout serta error per entry, bukan gagal total bila satu record rusak;
- jangan fetch URL arbitrary saat parse import; metadata enrichment DOI dipanggil explicit atau via queue dengan SSRF guard existing;
- rate limit import/commit dan create-by-DOI;
- log summary batch tanpa merekam access token atau raw bibliografi lengkap di level info.

## 7. Fase implementasi

### Fase 0 — Spike dan kontrak final

**Hasil:** pilihan parser/CSL tervalidasi terhadap file Mendeley contoh, type CSL-JSON final, dan keputusan format v1 terdokumentasi.

1. Kumpulkan fixture anonymized `.bib` dan `.ris` dari ekspor Mendeley: journal article, book, thesis, web page, multi-author, DOI kosong, non-ASCII.
2. Buat test spike di `packages/services` untuk parser candidate dan CSL rendering empat style.
3. Putuskan apakah EndNote XML menjadi v1.1 atau di luar scope; v1 tidak boleh memblokir hanya karena XML.
4. Tentukan policy author names, date range, editor, page, edition, publisher place, dan URL normalization.
5. Buat ADR kecil jika library yang dipilih menambah dependency besar atau memberi risiko lisensi/bundle.

**Acceptance:** seluruh fixture menghasilkan CSL-JSON valid atau diagnostic terstruktur; tidak ada formatter yang mengarang data hilang.

### Fase 1 — Core Citation Library dan import-first

**Hasil:** pengguna dapat mengimpor BibTeX/RIS Mendeley, melihat reference workspace, mengedit, dedupe, dan export.

1. `packages/db`
   - Tambah schema/repository `workspaceCitations`, `workspaceCitationSettings`, `citationImportBatches`.
   - Buat migration baru serta test repository owner/workspace scoping.
2. `packages/services`
   - Implement `citation-normalize`, parser adapter, `CitationImportService`, `CitationService`, dan renderer/exporter.
   - Buat resolver `create-by-DOI` yang reuse provider metadata Aqsha hanya setelah kontrak output dipetakan ke CSL-JSON.
   - Implement dedupe preview, policy commit, dan merge audit.
3. `apps/api`
   - Tambah `citations.ts` route module, mount pada server, serta Eden `App` type otomatis.
   - Validasi multipart, errors, limit, ownership, dan rate limit.
4. `apps/web`
   - Tambah `features/citations/` untuk API hooks, types, components, dan pure view model.
   - Tambah state `view` pada `WorkspaceLibrarySurface` tanpa merusak query controls Library (`q`, `type`, `sort`).
   - Implement empty state, import wizard, preview table, Citation Library table, detail drawer, create/edit dialog, export menu.
5. Testing
   - Unit normalisasi/format/dedupe/parser fixtures di `packages/services`.
   - API integration test: owner can CRUD/import; other owner mendapat error; malformed files tidak melakukan commit.
   - Web test untuk filter, preview state, dan error message readable.

**Acceptance:** user dapat mengimpor 100 reference BibTeX/RIS, skip/merge duplikat, menemukan DOI, mengubah tag, lalu download BibTeX/RIS dengan hasil konsisten.

### Fase 2 — Artifact bridge dan quality workflow

**Hasil:** paper PDF/URL Aqsha dapat menjadi citation tanpa duplikasi, metadata yang lemah terlihat dan dapat diperbaiki.

1. Tambah action **Add to Citations** pada artifact PDF/URL yang mempunyai metadata paper.
2. Tambah API `createFromArtifact` dan `link/unlink artifact` dengan ownership/workspace checks.
3. Tambah `metadataStatus` calculation: DOI/title/author/year missing → `incomplete`; resolver/manual reviewed → `verified`; imported unresolved → `needs_review`.
4. Citation detail menampilkan provenance dan link kembali ke artifact reader.
5. Tambahkan queue opt-in untuk resolve DOI record yang incomplete; jangan memblokir import atau list UI.

**Acceptance:** satu paper artifact dapat masuk library sekali, linknya dapat dibuka dari citation, dan menghapus citation tidak menghapus file.

### Fase 3 — BlockNote citation dan bibliography

**Hasil:** dokumen menggunakan identifier stabil dan dapat dirender ulang ketika style berubah.

1. Buat custom BlockNote inline content `citation` dengan `citationIds`, locator optional, prefix/suffix, serta node ID.
2. Buat custom `bibliography` block dengan mode `used-in-document` (default) dan `selected-collection` (future-ready).
3. Citation picker memakai query workspace citation dengan keyboard search dan multi-select.
4. Serializer:
   - `blocksJson` menyimpan canonical node;
   - markdown export memakai representasi kompatibel yang disepakati (mis. Pandoc citekey/HTML data attribute) dan tidak menjadi source of truth;
   - plainText menghasilkan readable fallback.
5. Saat autosave, rekonsiliasi `document_citation_usages` dari document block tree dalam transaksi yang aman.
6. Render reader dengan `CitationProvider` workspace, termasuk missing/deleted state.
7. Bibliography block memakai CSL renderer dan settings workspace; tombol update/rebuild manual untuk versi pertama agar perubahan besar tidak mengejutkan user.

**Acceptance:** citation bertahan setelah refresh, style APA→IEEE mengubah render tanpa ganti ID, bibliography memuat hanya reference yang dipakai, dan reference missing tidak silently hilang.

### Fase 4 — Connect Mendeley melalui OAuth

**Hasil:** user dapat menghubungkan Mendeley untuk pull metadata dari library/folder yang dipilih.

1. Registrasikan aplikasi Aqsha pada Mendeley Developer Portal dan tentukan redirect URI production/staging/local.
2. Tambah table `mendeley_connections`: owner, encrypted access/refresh token, token expiry, profile id, selected folder ids, last sync cursor/time, status/error. Token tidak pernah dikirim ke `apps/web`.
3. `apps/api`:
   - `GET /integrations/mendeley/connect` membuat OAuth `state` signed dan redirect;
   - callback memverifikasi state, menukar code di backend, mengenkripsi token, lalu redirect ke workspace integrations;
   - disconnect mencabut/deletes token lokal dan menghentikan job.
4. `packages/services/mendeley.service.ts` menjadi adapter HTTP tunggal dengan pagination, retry/backoff 429, token refresh, dan normalized error.
5. UI memilih library/folder serta mode sync `metadata only` (default). Tampilkan preview record baru/updated/conflict sebelum commit.
6. BullMQ job `mendeley-sync` menarik perubahan secara manual dan periodik; idempotent melalui `externalId` dan `sourceHash`.
7. Conflict policy awal: Aqsha tidak mengirim perubahan ke Mendeley. Bila reference yang pernah diedit lokal berubah di Mendeley, tandai `conflict` dan user memilih keep Aqsha atau accept Mendeley.

**Acceptance:** user menghubungkan akun, memilih folder, sync metadata, dapat disconnect, token tidak muncul pada log/response/browser, dan sync ulang tidak menduplikasi records.

### Fase 5 — Astra integration dan collaboration (opsional)

**Hasil:** Astra dapat memakai reference library tanpa mengorbankan user control.

1. Tambah `ContextRef` kind `workspace-citation` atau `citation-selection` di `@aqsha/chat-core`.
2. `apps/api` hydrate context memvalidasi owner + workspace; agent menerima metadata minimal dan identifier Aqsha.
3. Tambah agent read tool `search_workspace_citations`, `get_workspace_citation`; write tool hanya boleh **suggest citation**, tidak membuat citation tanpa action user kecuali owner mengaktifkan mode explicit.
4. Tampilkan citation suggestion card deterministik di chat dengan tombol insert/open document.
5. Collaboration/group Mendeley tidak dikerjakan sebelum Aqsha memiliki model kolaborasi workspace sendiri; jangan menganggap Mendeley group sebagai ACL Aqsha.

## 8. OAuth dan keamanan Mendeley

Mendeley API menawarkan documents, files, folders, groups, serta annotations. Akses library user memerlukan OAuth; catalog publik berbeda dari library user. Referensi dokumen API:

- [Mendeley Core API Resources](https://dev.mendeley.com/overview/core_resources.html)
- [Mendeley Core API Quick Start Guides](https://dev.mendeley.com/code/core_quick_start_guides.html)

Aturan keras fase OAuth:

- OAuth redirect/state/PKCE atau secret flow diverifikasi sesuai capability Mendeley saat aplikasi didaftarkan.
- Access/refresh token dienkripsi at-rest dengan secret key/KMS deployment; tidak di-serialize ke client, analytics, pino log, error body, atau BullMQ payload plaintext.
- `state` harus mengikat owner Aqsha, workspace intent, nonce, expiry, dan return URL yang allowlisted.
- Endpoint sync selalu memeriksa koneksi milik `ownerUserId`; `mendeleyDocumentId` tidak pernah menjadi authorization bypass.
- Download file hanya on-demand, user-initiated, dan harus melewati storage/antivirus/size policy Aqsha; default sync tidak memanggil endpoint file.
- Disconnect menghapus token lokal, job tertunda, dan cache credential; data citation Aqsha tidak ikut dihapus kecuali user memilih action terpisah.

## 9. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Data BibTeX/RIS kotor atau tidak lengkap | preview per-record, quality status, manual edit, dan parser fixture test |
| False-positive duplicate berbasis judul | DOI/ISBN diutamakan; fallback hanya menjadi suggestion yang harus di-approve |
| Citation style tidak konsisten | CSL-JSON canonical + satu renderer service + snapshot tests per style |
| Citation di dokumen menjadi teks mati | simpan `citationIds` di custom BlockNote node, bukan rendered text |
| Reference dihapus tapi dipakai dokumen | soft delete + missing state + remap/restore flow |
| Mendeley OAuth/token leak | backend-only exchange, encryption, redacted logging, state validation |
| Sync overwrite edit lokal | Aqsha copy one-way default + explicit conflict review |
| PDF legal/storage cost | metadata-only default dan file import explicit |
| Scope berkembang menjadi full Mendeley clone | fase dikunci: import/reference/cite/export dulu, annotation/groups/collaboration ditunda |

## 10. Verifikasi dan rollout

### Test matrix minimum

- Parser: BibTeX/RIS Mendeley, Unicode, many authors, missing DOI/year/title, malformed entry.
- Service: normalize DOI, canonical key, candidate duplicate, explicit merge, owner/workspace isolation, export snapshot.
- API: multipart preview tidak membuat record; commit idempotent; user lain tidak bisa baca/mengubah batch atau citation.
- Web: empty state, preview selection, policy duplicate, readable API error, URL state `view=citations`.
- BlockNote: insert multi-citation, reload, remove/remap missing citation, style switch, bibliography update.
- OAuth: invalid state, expired state, denied consent, expired token refresh, disconnect, repeated sync, 429 retry.

### Command verifikasi

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Untuk perubahan schema/service, jalankan juga `bun run db:generate`, review migration, lalu `bun run db:migrate` pada environment yang tepat. Build `@aqsha/db` dan `@aqsha/services` ke `dist/` sebelum smoke runtime bila kontrak shared berubah.

### Rollout

1. Ship Fase 1 di balik feature flag `workspace_citations` untuk internal users.
2. Monitor import error rate, average records/batch, duplicate decision, render failure, serta export success.
3. Perbaiki parser/quality rules dari fixture nyata sebelum membuka publik.
4. Ship Fase 3 setelah data library stabil; dokumen lama tanpa citation node tidak di-migrate paksa.
5. Jalankan OAuth Mendeley sebagai beta terpisah (`mendeley_sync_beta`) setelah security review dan aplikasi developer siap.

## 11. Ringkasan file yang diperkirakan disentuh

| Area | File/direktori |
|---|---|
| DB | `packages/db/src/schema/workspaceCitations.ts`, `workspaceCitationSettings.ts`, `citationImportBatches.ts`, repositories, `packages/db/drizzle/*` |
| Services | `packages/services/src/citation*.ts`, export `packages/services/src/index.ts`, tests/fixtures |
| API | `apps/api/src/routes/citations.ts`, server route mount, BullMQ Mendeley worker fase 4 |
| Web data | `apps/web/features/citations/api.ts`, types, query keys, hooks |
| Web UI | `apps/web/features/citations/components/*`, `apps/web/features/workspaces/components/workspace-library-surface.tsx`, toolbar/board view state |
| Artifact bridge | artifact detail actions dan `ArtifactService` helper |
| BlockNote | `blocknote-document-editor.tsx`, loader/schema components, document usage reconciliation |
| Agent (opsional) | `packages/chat-core` context ref, API hydration, agent citation read/suggestion tools |

## 12. Urutan keputusan sebelum mulai coding

1. Konfirmasi scope v1: hanya `.bib`/`.ris` atau termasuk EndNote XML.
2. Konfirmasi empat default CSL style dan apakah user boleh memilih custom CSL pada v1.
3. Konfirmasi apakah bibliography block harus otomatis update atau user menekan **Update bibliography**.
4. Konfirmasi apakah import batch yang sudah commit boleh di-undo, dan batas waktunya.
5. Konfirmasi kapan direct Mendeley OAuth dibuka: langsung setelah import v1 atau setelah BlockNote citation stabil.

Rekomendasi urutan: **Fase 0 → Fase 1 → Fase 2 → Fase 3 → evaluasi penggunaan → Fase 4**.
