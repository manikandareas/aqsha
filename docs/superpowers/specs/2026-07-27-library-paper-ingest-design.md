# Spesifikasi — Paper Perpustakaan: Ingest Otomatis, Reader Akun-Level, Context Menu

**Status:** disepakati untuk implementasi

**Tanggal:** 27 Juli 2026

## Ringkasan

Perpustakaan berhenti menjadi katalog metadata. Setiap item yang masuk — lewat unggahan PDF, DOI, entri manual, import `.bib`/`.ris`, sinkron Mendeley/Zotero, atau simpan dari Explore — melewati satu pipeline yang meresolusi metadatanya, mencoba mengambil PDF open access-nya, mengekstrak teks, lalu memecah dan meng-embed isinya. Hasilnya: agen proyek dapat menemukan kalimat yang tepat di dalam paper yang benar, lengkap dengan identitas sitasinya.

Paper mendapat alamat sendiri. `/app/artifacts/[artifactId]` menjadi rute kanonik reader, lepas dari proyek, karena satu paper memang milik akun dan bisa dipakai lintas karya tulis. Rute proyek yang ada meredirect ke sana.

Perpustakaan mendapat klik kanan. Kartu memberi aksi item, latar halaman memberi aksi tambah — termasuk menempel DOI langsung dari clipboard tanpa membuka dialog.

## Temuan yang menjadi dasar desain

- Pipeline yang diminta sebagian besar **sudah ada**, tapi terkunci di scope proyek. `finalizeUpload` (`artifact.service.ts:455`) mewajibkan `workspaceId` dan meng-assert kepemilikan workspace, padahal Perpustakaan akun-level.
- `artifacts.workspace_id` sudah nullable dan endpoint `/artifacts/:id`, `/artifacts/:id/render-payload`, `/artifacts/upload-url` (`apps/api/src/routes/artifacts.ts:140,148,69`) sudah di-scope owner, bukan workspace. Entitas dan API-nya sudah siap akun-level.
- Reader sudah diport penuh ke `apps/svelte` (`ArtifactReaderPageShell`, `ArtifactDetailView`, `PdfArtifactViewer`, `ArtifactRenderPanels`, `ArtifactDetailSidebar`), dan `ArtifactDetailView.svelte:69` sudah menurunkan sendiri `workspaceId` dari artifact-nya. Yang belum ada hanya rutenya.
- Primitif context menu sudah ada di `@aqsha/ui-svelte/components/context-menu` dan sudah dipakai di `AppSidebar.svelte:210`. Yang belum diport hanya isi menunya, dari `apps/web/features/workspaces/components/workspace-library-context-menus.tsx`.
- Seluruh repo hanya punya **empat** titik yang membuat baris `citations`: `citation-crud.methods.ts:167` (manual), `:240` (DOI), `:343` (dari artifact), dan `citation-import.service.ts:461` (import file + commit sinkron provider). Jalur Explore, batch-save, dan provider bermuara ke sana.
- `RagService` sudah hybrid: vektor ANN + FTS leksikal difusi lewat Reciprocal Rank Fusion (`rag.service.ts:96`), chunk 2000 karakter dengan overlap 200. Scope-nya difilter `artifact_embeddings.workspace_id` (`artifactEmbeddingRepo.ts:60,106`).
- `workspace_citation_links (workspace_id, citation_id)` sudah menjadi tautan proyek→referensi, dengan index `..._ws_citation` dan `..._by_citation`.
- `downloadOaPdf` (`papers/download.ts`, lengkap dengan penjaga anti-SSRF) dan `ingestResolvedPdf` (`artifact.service.ts:1104`) sudah ada, dipakai jalur ingestion URL. Keduanya belum pernah dipanggil dari jalur Perpustakaan.
- `assertLibraryCapacity` (`artifacts/capacity.ts`) menghitung **semua** artifact aktif milik owner, dan satu-satunya konsumen `ArtifactRepo.countActiveByOwner` adalah fungsi itu.
- `list_project_references` adalah satu-satunya sumber sah untuk `@key` Typst; key yang dikarang menghasilkan sitasi yatim saat compile.

## Sasaran produk

1. Setiap item baru di Perpustakaan otomatis terindeks dan dapat ditemukan secara semantik — tanpa aksi tambahan dari pengguna.
2. Item yang masuk hanya bermodal DOI berusaha naik kelas jadi paper penuh: metadata terverifikasi dan, bila tersedia open access, PDF yang bisa dibaca.
3. Agen proyek menemukan kalimat yang relevan **beserta** referensi yang siap disitasi, bukan sekadar potongan teks.
4. Paper punya satu alamat kanonik yang bisa dibagikan dan tidak bergantung pada proyek.
5. Aksi yang sering dipakai dapat dijangkau lewat klik kanan, di kartu maupun di latar halaman.

## Keputusan yang mengunci desain

| Pertanyaan | Keputusan |
| --- | --- |
| Apa itu "paper" secara data | Baris `citations` + satu `artifacts` akun-level (`workspace_id = NULL`) |
| Di mana status pemrosesan hidup | Di `citations`; item tanpa PDF pun harus punya status |
| Orkestrasi post-processing | Satu antrean `library-ingest` sebagai gerbang tunggal, bukan rantai antrean |
| BullMQ atau inline | BullMQ — import `.bib` bisa membuat ratusan item sekaligus |
| Item tanpa PDF | Coba ambil PDF open access; gagal → embed judul + abstrak |
| Artifact untuk item tanpa PDF | Tetap dibuat sebagai `plain_text`, di-upgrade jadi `pdf` bila OA didapat |
| Kuota | Artifact `source = "reference"` dikecualikan dari kapasitas library |
| Scope embedding untuk agen proyek | Join lewat `workspace_citation_links`, bukan menyalin `workspace_id` |
| Rute reader | `/app/artifacts/[artifactId]` kanonik; rute proyek redirect dengan `?project=` |
| Cakupan context menu | Kartu + latar grid |

## A. Model data

Satu item Perpustakaan = satu baris `citations` (selalu) + satu `artifacts` (selalu, untuk item baru), ditautkan lewat `citations.artifact_id` yang sudah ada.

Artifact item Perpustakaan lahir sebagai `artifact_type = 'plain_text'` berisi judul, penulis, venue, dan abstrak, dengan `workspace_id = NULL` dan `source = 'reference'`. Bila langkah open access berhasil, artifact **yang sama** di-upgrade menjadi `pdf` lewat `ingestResolvedPdf` — pola yang sudah dipakai jalur ingestion URL. Konsekuensinya: embedding tetap di satu tabel, pencarian tetap satu jalur RRF, dan rute reader berlaku untuk kartu mana pun.

### Migrasi 0047 — kolom status di `citations`

| Kolom | Tipe | Isi |
| --- | --- | --- |
| `ingest_status` | text, not null, default `'pending'` | `pending` \| `processing` \| `ready` \| `failed` |
| `text_coverage` | text, not null, default `'none'` | `none` \| `abstract` \| `full_text` |
| `ingest_error` | text, nullable | pesan gagal terakhir; `null` saat sukses |
| `ingested_at` | bigint, nullable | timestamp selesai |

Ditambah CHECK untuk kedua enum dan index `(owner_user_id, ingest_status)` untuk retry serta backfill.

Migrasi yang sama menangani dua constraint yang menghalangi paper akun-level:

- `artifacts_source_check` saat ini hanya mengizinkan `('manual','upload','agent','url')`; ditambah `'reference'`, dan `artifactSources` di `artifacts/model.ts` ikut bertambah. Tanpa ini insert artifact referensi ditolak constraint.
- `artifact_paper_metadata.workspace_id` saat ini `NOT NULL`; dijadikan nullable. Paper Perpustakaan tidak punya workspace, dan tanpa perubahan ini langkah resolve tidak bisa menyimpan hasilnya sama sekali.

`artifacts.indexing_status` tidak berubah maknanya — itu detail level artifact. `citations.ingest_status` adalah agregat level item perpustakaan dan **hanya orkestrator yang menulisnya**. UI Perpustakaan membaca `citations`; reader membaca `artifacts`.

Baris lama ikut default `pending`. Migrasi tidak meng-enqueue apa pun; backfill dijalankan terpisah.

### Kuota

`ArtifactRepo.countActiveByOwner` menerima filter yang mengecualikan `source = 'reference'`, sehingga item referensi tidak memakan `libraryItemLimit`. Tanpa ini, satu import `.bib` 200 entri menghabiskan kuota paket Free. Perubahannya terkurung: `capacity.ts` adalah satu-satunya konsumen.

## B. Pipeline ingest

### Gerbang

`LibraryIngestService.enqueue({ ownerUserId, citationIds })` dipanggil tepat setelah keempat titik insert citation. Jalur masuk baru di masa depan cukup memanggil fungsi yang sama.

### Antrean

- Nama: `library-ingest`, ditambahkan ke `ARTIFACT_QUEUES` (`clients/queue.ts:11`).
- Worker: `apps/api/src/workers/library-ingest.worker.ts`, concurrency 2 untuk memacu panggilan eksternal.
- `jobId` stabil `library-ingest:<citationId>` sehingga enqueue ganda tidak menggandakan kerja. Re-enqueue mengikuti pola `removeJob` sebelum `add` (`clients/queue.ts:98`), karena `add()` dengan jobId yang masih ditahan BullMQ adalah no-op senyap.
- Payload job hanya `{ ownerUserId, citationId }`. Worker membaca state dari DB agar retry bekerja atas kenyataan terbaru, bukan snapshot yang sudah basi.
- Retry mengikuti default `enqueue`: 3 percobaan, backoff eksponensial 20 detik.
- Commit import 200 entri menghasilkan 200 job independen; satu DOI busuk tidak menjatuhkan 199 lainnya.

### State machine

Tiap langkah idempoten dan boleh dilewati. Status berpindah ke `processing` di awal.

1. **Resolve metadata.** Ada DOI, arXiv id, atau URL yang bisa diklasifikasi → `resolvePaper`. Patch `citations` **hanya pada field yang kosong**; entri manual pengguna tidak pernah ditimpa. `metadata_status` dinaikkan sesuai hasil, dan `PaperMetadataService.upsert` — yang tipe `workspaceId`-nya ikut menjadi nullable — menjaga aturan monotonik provenance yang sudah ada.

   Satu pengecualian yang harus eksplisit: item hasil unggahan lahir dengan judul turunan nama file (`titleFromFileName`), dan judul itu diperlakukan sebagai **placeholder** yang boleh ditimpa hasil resolve. Tanpa pengecualian ini, paper yang diunggah selamanya bernama `skripsi-final-v2.pdf`. Penandanya adalah `citations.source = 'artifact'` dengan judul yang masih identik dengan nama file.
2. **Dapatkan PDF.** Bila artifact belum `pdf`, kandidat open access dari hasil resolve diteruskan ke `downloadOaPdf`. Berhasil → `ingestResolvedPdf` meng-upgrade artifact yang sama.
3. **Ekstrak teks.** Lewat `artifacts/extract-pipeline`.
4. **Chunk + embed.** `RagService.index`. Teks penuh bila ada; bila tidak, satu chunk dari judul + penulis + venue + abstrak.
5. **Selesai.** `ingest_status = 'ready'`, `text_coverage` di-set, `ingested_at` diisi, `ingest_error` dikosongkan.

### Yang boleh gagal

Langkah 1 dan 2 best-effort: DOI tak ditemukan atau tak ada open access **bukan** kegagalan — item tetap `ready` dengan `text_coverage = 'abstract'`. Hanya langkah 4 yang menggagalkan job, karena tanpa embedding janji "bisa dicari" tidak terpenuhi. Setelah retry habis: `failed` + `ingest_error`, dan kartu menawarkan coba lagi.

`ingestResolvedPdf` dan `finalizeUpload` diperluas agar `workspaceId` opsional — assert kepemilikan workspace dijalankan hanya bila nilainya ada. Satu perubahan tanda tangan, bukan jalur kedua.

## C. Jangkauan pencarian agen

`ArtifactEmbeddingRepo.searchSimilar` dan `searchLexical` mengganti filter kolom tunggal dengan disjungsi:

```sql
WHERE ae.owner_user_id = $owner
  AND ( ae.workspace_id = $ws
        OR EXISTS (SELECT 1 FROM citations c
                     JOIN workspace_citation_links l ON l.citation_id = c.id
                    WHERE c.artifact_id = ae.artifact_id
                      AND l.workspace_id  = $ws
                      AND c.deleted_at IS NULL) )
```

Seluruh jalur join sudah ter-index (`citations_by_owner_artifact`, `workspace_citation_links_ws_citation`, `workspace_citation_links_by_citation`). Fusi RRF tidak berubah — hanya himpunan kandidatnya yang melebar.

Efeknya: melepas referensi dari proyek langsung mempersempit pencarian agen tanpa reindex, dan menautkannya ke proyek kedua langsung melebarkannya. Tidak ada state yang perlu disinkronkan.

`ThreadDocumentMatch` (`rag.service.ts:16`) bertambah `citationId` dan `bibKey` untuk chunk yang berasal dari item Perpustakaan, dan `search_thread_documents` meneruskannya. **Penjaga:** bila `bib_key` belum di-assign (nilainya lazy), field itu dikosongkan dan agen tetap wajib mengambil key dari `list_project_references`. Invarian bahwa `@key` hanya lahir dari satu sumber tidak boleh retak.

## D. Permukaan UI

### Unggah dari Perpustakaan

- Item **"Unggah PDF"** menjadi entri pertama di dropdown `+` `LibraryPage.svelte:245-269`, menjadi CTA utama di `CitationEmptyState`, dan grid menerima drag-and-drop seperti papan proyek.
- Presign memakai `/artifacts/upload-url` yang sudah owner-scoped; finalize memakai `finalizeUpload` tanpa `workspaceId`, lalu `createFromArtifact` — sehingga gerbang ingest ikut jalan sendiri.
- `createFromArtifact` (`citation-crud.methods.ts:255`) diperluas untuk itu: `workspaceId` menjadi opsional (assert workspace hanya bila ada), dan prasyarat "artifact wajib sudah punya metadata paper di workspace ini" dilonggarkan. Saat metadata belum ada — dan pada unggahan baru memang belum — judul artifact dipakai sebagai placeholder alih-alih melempar `citation_artifact_no_metadata`. Melonggarkan method ini lebih baik daripada menambah titik insert kelima yang harus diingat untuk disambungkan ke gerbang.
- Progress memakai pola toast antrean unggah yang sudah ada.

### Rute reader

- `/app/artifacts/[artifactId]/+page.svelte` tipis, memanggil `ArtifactReaderPageShell` tanpa `workspaceId`.
- `/app/projects/[projectId]/artifacts/[artifactId]` meredirect ke rute kanonik dengan `?project=<id>`, yang dipakai untuk breadcrumb dan aksi berkonteks proyek.
- `CitationDetailView.svelte:272` mencabut syarat `workspaceId` pada "Buka di reader"; cukup `artifactId`, mengarah ke rute kanonik.
- Klik kartu tetap membuka panel detail. Membaca paper adalah aksi eksplisit dari panel atau context menu, bukan efek samping klik.

### Context menu

Kartu: Buka paper · Lihat detail · Salin sitasi · Tambah ke proyek / Lepas dari proyek · Buka DOI · Pilih beberapa · Hapus.

Latar grid: Unggah PDF… · Tambah dari DOI… · Tempel DOI · Isi manual… · Import file… · Pilih beberapa.

Dua penjaga:

- Trigger latar dibatasi ke kontainer grid, bukan seluruh dokumen, supaya klik kanan di header, teks, dan tautan tetap memberi menu asli browser.
- "Tempel DOI" **tidak** memeriksa clipboard saat menu dibuka. `navigator.clipboard.readText()` butuh izin dan tidak tersedia seragam antar-browser, sehingga memeriksanya di awal membuat isi menu berubah tanpa sebab yang bisa dipahami. Item selalu tampil; pembacaan terjadi saat dipilih, dan bila gagal atau isinya bukan DOI ia jatuh ke dialog DOI biasa.

### Status di kartu

Ikon status metadata di kanan bawah tetap. Penanda cakupan teks (teks penuh / abstrak saja) muncul di kiri bawah. Selama `pending`/`processing` kartu memakai overlay halus alih-alih ikon ketiga; kartu `failed` menampilkan aksi coba lagi. Pembaruan lewat `refetchInterval` TanStack Query yang aktif hanya selama masih ada item belum selesai, lalu berhenti sendiri.

## E. Kegagalan, biaya, observability

- **PDF hasil pindaian** tanpa lapisan teks menghasilkan ekstraksi kosong → turun ke `abstract`, atau `none` bila abstraknya pun tak ada. Bukan kegagalan. OCR di luar ruang lingkup.
- **Embedding disabled**: worker sudah `assertEmbeddingEnabled()` saat boot sehingga di produksi mustahil. Di dev tanpa key, item tetap `ready` dengan log peringatan — kondisi lingkungan, bukan kegagalan item.
- **Soft delete dan merge duplikat**: filter `c.deleted_at IS NULL` membuat chunk milik sitasi terhapus otomatis hilang dari pencarian proyek, termasuk anggota yang kalah saat merge. Penghapusan permanen memanggil `RagService.deleteByArtifact`; menghapus item Perpustakaan ikut men-soft-delete artifact referensinya.
- **Biaya**: tidak ada debit kuota baru. Yang ditambahkan pembatasan laju unduhan PDF per-owner di gerbang worker — rumah yang tepat untuk TODO di `papers/download.ts:21`.
- **Backfill** perpustakaan lama dijalankan sebagai perintah terpisah dengan batch kecil; `jobId` stabil membuatnya aman diulang.
- **Log** terstruktur per langkah, dan pelaporan Sentry hanya pada kegagalan terminal, mengikuti pola worker yang sudah ada di `apps/api/src/workers/index.ts:78`.

## F. Pengujian

`packages/services` — state machine per langkah: resolve gagal tetap lanjut; tidak ada open access jatuh ke abstrak; embed gagal menghasilkan `failed` beserta pesannya; menjalankan job dua kali tidak menggandakan artifact maupun chunk.

`packages/db` — kueri scope dengan empat kasus yang membedakan benar-salahnya disjungsi: chunk milik proyek, chunk paper tertaut, chunk paper **tidak** tertaut, dan chunk sitasi terhapus. Ditambah uji kapasitas: artifact `source = 'reference'` tidak menambah hitungan.

`apps/svelte` — context menu dan status kartu sebagai `.svelte.test.ts` di project browser; rune `$state` tidak ter-compile di runner node. Spec kontrak rute yang ada (`library-page-contract.spec.ts`, `url-state-boundaries.spec.ts`) diperluas untuk rute artifacts kanonik beserta redirect-nya.

## Di luar ruang lingkup

- OCR untuk PDF hasil pindaian.
- Mode pencarian "seluruh perpustakaan akun" untuk percakapan yang tidak terikat proyek; percakapan seperti itu tetap berperilaku seperti sekarang.
- Pengaturan gaya sitasi yang saat ini tidak punya pintu masuk di `apps/svelte` (`CitationSettingsDialog` hanya dipakai `CitationsPanel` yang sudah tidak diimpor siapa pun). Cacat nyata, tapi bukan bagian dari pekerjaan ini.
- Klik kanan di dalam reader PDF.
- Entri changelog dan bump versi produk — ditunda ke cutover `apps/svelte`, konsisten dengan pekerjaan migrasi sebelumnya.
