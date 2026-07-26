# Spesifikasi — Kedalaman Agent Proyek Typst: Konteks, Tool, Marker Anotasi, Diff Inline

**Status:** disepakati untuk implementasi

**Tanggal:** 26 Juli 2026

## Ringkasan

Halaman proyek berhenti memperlakukan Astra sebagai agent riset umum yang kebetulan memegang dua tool Typst. Ia menjadi asisten penulisan yang tinggal di dalam dokumen: aturan perilaku dokumen-first pindah ke instruksi statis, fakta dokumen yang hidup (kerangka bab, jumlah kata, sitasi yatim, anotasi terbuka) dikirim tiap turn sebagai manifest, dan enam tool baru memberinya cara membaca serta memeriksa proyek tanpa menelan seluruh sumber.

Anotasi berhenti menjadi jejak yang hanya hidup di composer. Tiap anotasi mendapat pin bernomor yang menempel pada blok dokumen, terbaca statusnya dari bentuknya, dan membawa aksi lewat popover.

Proposal berhenti menyita panel Editor sebagai kartu. Diff muncul inline di CodeMirror bergaya merge editor: baris hapus merah pada buffer, baris tambah hijau sebagai widget, dan tombol Terima/Tolak per hunk yang langsung disimpan ke server tiap klik.

## Temuan yang menjadi dasar desain

- `workspace-project-manifest.ts` hanya menyuntik nama proyek, `contentVersion`, dan empat kalimat petunjuk. Astra harus memanggil tool sekadar untuk tahu proyeknya berisi apa.
- `instructions.ts` adalah instruksi agent riset generik; bagian Typst tinggal enam baris di paling bawah, sementara seksi `request_document_edit` (jalur Markdown/BlockNote milik `apps/web`) justru mendapat porsi lebih besar dan menyaingi jalur Typst.
- Tool dokumen hanya `get_document_source` (mengembalikan **seluruh** sumber) dan `propose_document_edit`. Tidak ada cara membaca satu bab, mengetahui isi bib proyek, atau memeriksa integritas dokumen.
- `hunks.ts` sudah menyediakan `computeProposalHunks` dan `applyHunkSelection` yang menerima subset hunk arbitrer. Accept bertahap bukan mekanisme baru, melainkan pemakaian ulang yang butuh basis stabil.
- `DocumentProposalService.accept` adalah operasi sekali-tembak yang menutup proposal, dan `isStale` dinilai dari `baseVersion !== currentVersion`. Keduanya patah bila hunk diterima satu per satu.
- `AnnotationService` menyimpan `page` + `rects` sebagai koordinat absolut. Sesudah dokumen berubah, sorotan menunjuk teks yang keliru — gejalanya samar selama penandanya hanya kotak kuning pudar.
- `apps/svelte` dilarang mengimpor `@aqsha/services` (pola sadar, lihat `lib/plan/catalog.ts`). Modul murni yang dibutuhkan kedua sisi harus diduplikasi, bukan dibagi.

## Sasaran produk

1. Permintaan menulis di halaman proyek langsung menghasilkan proposal suntingan tanpa user menyebut dokumen, file, atau format.
2. Astra mengetahui struktur, panjang, referensi, dan cacat dokumen tanpa menyeret seluruh sumber ke prompt setiap turn.
3. Setiap anotasi punya penanda permanen di dokumen yang menyatakan isinya, statusnya, dan menawarkan aksinya.
4. Proposal ditinjau di dalam editor sebagai diff, dengan keputusan per hunk yang tersimpan seketika.
5. Tidak ada jenis review kedua: usul struktur dan usul isi bermuara ke pipeline proposal yang sama.

## Keputusan yang mengunci desain

| Pertanyaan | Keputusan |
| --- | --- |
| Bagaimana Astra memilah edit vs jawaban chat | Dokumen-first otomatis; tidak bertanya lebih dulu |
| Tool apa yang ditambahkan | Keempat rumpun: peta dokumen, referensi proyek, pemeriksa, kerangka |
| Bentuk penanda anotasi | Pin bernomor menempel di blok; tanpa panel daftar |
| Kapan keputusan hunk tersimpan | Tiap klik langsung compile + save ke server |
| Chrome di panel chat | Aksi cepat di empty state saja; tanpa baris status permanen |

## Kontrak perilaku

### A. Mode proyek — aturan di instruksi, fakta di manifest

Aturan bersifat stabil sehingga tinggal di `instructions.ts` dan ikut ter-cache sebagai prefix. Fakta berubah tiap turn sehingga tetap dikirim sebagai `<system-reminder>` oleh processor.

Seksi **Mode proyek** ditambahkan ke instruksi statis dengan ruting yang eksplisit:

- Kalimat imperatif yang menyentuh teks karya tulis (tulis, tambahkan, lanjutkan, perbaiki, ringkas, panjangkan, ganti, hapus, rapikan, ubah gaya) langsung menempuh `read_document_section` untuk mendapat anchor persis → `propose_document_edit`. Tidak ada pertanyaan pembuka. Orientasi struktur diambil dari manifest, bukan dari tool; `get_document_outline` hanya dipanggil bila manifest sudah usang di tengah percakapan (dokumen berubah sesudah proposal diterima) atau sasarannya belum jelas dari manifest.
- Pertanyaan tentang isi atau dunia luar (apa, mengapa, bagaimana, carikan, bandingkan, jelaskan) dijawab di chat dan tidak menyentuh dokumen.
- Menulis draf panjang di chat lalu menawarkan "mau saya masukkan ke dokumen?" dilarang. Draf karya tulis selalu berjalan lewat proposal.
- Bila bab sasaran belum ada, heading beserta isinya masuk dalam satu proposal, bukan dua langkah.
- Seksi `request_document_edit` dipangkas menjadi satu kalimat dengan aturan presedensi: selama thread punya proyek Typst aktif, jalur edit yang benar selalu `propose_document_edit`. Tool lama tidak dihapus karena `apps/web` masih memakainya.

Manifest per-turn diperluas menjadi peta hidup: nama proyek dan `workspaceId`, nama berkas utama dan `contentVersion`, total kata, daftar bab beserta level dan jumlah kata dengan penanda bab kosong, jumlah entri bib, daftar sitasi yatim, jumlah anotasi terbuka, dan status proposal tertunda. Anggarannya sekitar 150–250 token dan menghapus satu ronde tool call yang selama ini terpakai hanya untuk orientasi.

Manifest tidak pernah memuat isi bab. Isi dibaca lewat tool.

### B. Tool baru

Seluruh tool mengambil proyek secara implisit dari scope thread; tidak ada `workspaceId` yang harus ditebak agent, dan seluruhnya terisolasi pemilik.

| Tool | Input | Keluaran | Sifat |
| --- | --- | --- | --- |
| `get_document_outline` | — | `contentVersion`, total kata, daftar bab (`index`, `level`, `title`, `line`, `words`, `isEmpty`) | baca, murah |
| `read_document_section` | `headingIndex` atau `title` | potongan sumber bab itu, rentang baris, `contentVersion` | baca |
| `list_project_references` | — | entri bib (`key`, penulis, tahun, judul, DOI) + penanda terpakai/menganggur | baca |
| `add_reference_to_project` | DOI/identifier atau metadata hasil pencarian | citation tertaut ke proyek + `key` siap pakai sebagai `@key` | tulis, butuh konfirmasi percakapan |
| `check_document` | — | hasil compile, sitasi yatim, bab kosong, heading ganda, referensi menganggur | baca; menjalankan compile dan memakai kuota compile |
| `propose_outline` | operasi struktur (tambah/urutkan/ganti nama/hapus bab) | proposal pada pipeline yang sama dengan `propose_document_edit` | tulis lewat proposal |

`get_document_source` dipertahankan tetapi turun pangkat menjadi jalur untuk dokumen kosong dan tulis-ulang menyeluruh; instruksi mengarahkan orientasi ke `get_document_outline`.

`propose_outline` sengaja bermuara ke tabel dan reviewer yang sama sehingga user hanya pernah mempelajari satu cara meninjau usulan.

`add_reference_to_project` mengikuti aturan konfirmasi write yang sudah berlaku: ditawarkan lewat percakapan, dijalankan setelah user setuju. Ia menutup celah sitasi hantu karena `@key` yang disisipkan Astra dijamin ada di bib.

Modul baru `packages/services/src/typst/outline.ts` menjadi tulang punggung `get_document_outline`, `read_document_section`, `check_document`, dan `propose_outline`: parsing heading, penghitungan kata per bab, pemotongan bab, dan operasi struktur. Ia diduplikasi secara sadar terhadap `apps/svelte/src/lib/features/document/lib/outline.ts` karena batas impor, dan kedua sisi diikat ke fixture uji yang sama agar tidak menyimpang diam-diam.

### C. Aksi cepat di empty state chat

Saat thread proyek belum punya pesan, panel chat menampilkan tiga sampai empat aksi yang dihitung dari dokumen nyata: bab kosong yang bisa dilanjutkan, jumlah sitasi yatim yang perlu diperiksa, anotasi terbuka yang menunggu jawaban, dan bab terpanjang atau terpendek yang layak dirapikan. Aksi hilang begitu pesan pertama terkirim.

Perhitungan berjalan sepenuhnya di klien dari data yang sudah ada di halaman (`runtime.outline`, `useWorkspaceBib`, `useWorkspaceAnnotations`); tidak ada endpoint baru. Gerbang `useWorkspaceDocument` diturunkan dari `documentRuntimeActive` ke `backgroundQueriesActive` supaya aksi tetap terhitung di layar sempit yang membuka tab Chat lebih dulu.

Tidak ada baris status permanen dan tidak ada pill workspace di composer.

### D. Marker anotasi di preview

- Tiap anotasi berstatus `open` atau `sent` mendapat pin bernomor di sudut kiri-luar bloknya, diposisikan dari `overlayBoxes()` sehingga menempel pada dokumen saat scroll dan zoom tanpa listener reposisi.
- Nomor mengikuti urutan dokumen (halaman, lalu posisi vertikal), bukan urutan pembuatan.
- Pin selalu terlihat. Mode anotasi tetap hanya mengatur pembuatan anotasi baru.
- Status terbaca dari bentuk: `open` memakai lingkaran bergaris dengan sorotan lemon lembut; `sent` memakai lingkaran terisi dengan sorotan lemon pekat; anotasi yang chip-nya masih aktif di composer mendapat ring mint; `resolved` dan `dismissed` tidak dirender.
- Hover menampilkan tooltip berisi catatan dan status. Klik membuka popover berisi kutipan blok, catatan penuh, dan tiga aksi: jadikan/lepas konteks, minta Astra mengerjakannya, dan hapus.
- "Minta Astra" memasang anotasi sebagai konteks, mengisi composer dengan catatannya, lalu berpindah ke panel Chat — **tanpa mengirim otomatis**. Prefill memakai jalur `setComposerDraft` yang sudah dipakai aksi susun ulang proposal; mengirim otomatis akan menuntut kanal kirim lintas komponen yang belum ada dan membuat satu klik popover langsung membebani kuota.
- Popover memakai aturan penempatan `AnnotationModeLayer`: membalik ke atas bila mepet batas bawah dan lebarnya dijepit ke lebar stage, sehingga tetap muat di tab Preview layar sempit.
- Pin yang berdekatan digeser vertikal secukupnya agar tidak saling menumpuk.
- Chip anotasi di composer memakai nomor yang sama (`✎ ❶ Metode…`) sehingga kaitan chip dan pin tidak perlu ditebak.

**Anotasi melayang.** Saat render, `selectedText` anotasi dicari ulang di SVG memakai mesin pencarian teks yang sudah dipakai `headingTarget`. Bila ketemu, pin dan sorotan dipindahkan ke posisi baru. Bila tidak ketemu, pin ditandai melayang: tampil redup, tooltip menyatakan teksnya sudah berubah, dan popover hanya menawarkan hapus. Tanpa perlakuan ini, penerimaan proposal akan rutin meninggalkan pin bernomor di atas teks yang salah.

### E. Proposal per-hunk dan diff inline

**Basis stabil.** Indeks hunk diikat ke snapshot sumber saat proposal dibuat, bukan ke dokumen berjalan. Tabel `document_edit_proposals` mendapat tiga kolom: `base_source` (snapshot sumber basis), `hunk_decisions` (peta indeks → `accepted`/`rejected`), dan `applied_version` (versi dokumen terakhir yang ditulis proposal ini, awalnya sama dengan `base_version`).

**Kebasian** dinilai ulang sebagai `currentVersion !== appliedVersion`, yang berarti "ada yang mengubah dokumen selain proposal ini". Perilaku basi yang sudah ada dipertahankan: hunk sisa dinonaktifkan, user hanya dapat menolak sisanya atau meminta Astra menyusun ulang.

**Endpoint** `POST /workspaces/:id/proposals/:pid/hunks/:index` menerima `{ decision: "accept" | "reject" }`:

1. Proposal wajib berstatus `pending` dan `currentVersion` wajib sama dengan `appliedVersion`; bila tidak, kembalikan hasil basi.
2. `reject` hanya mencatat keputusan. Tidak ada compile, tidak ada save, tidak ada kuota terpakai.
3. `accept` menghitung `applyHunkSelection(base_source, hunks, seluruh indeks diterima)`, menjalankan compile, lalu `saveDocument` dengan CAS terhadap `applied_version`, dan menaikkan `applied_version` ke versi hasil.
4. Bila hasil keputusan membuat sumber identik dengan `proposed_source`, compile dilewati karena sumber itu sudah lolos compile saat proposal dibuat.
5. Compile gagal membuat hunk tetap belum diputuskan dan mengembalikan diagnostik; dokumen tidak berubah.
6. Saat seluruh hunk sudah diputuskan, proposal ditutup: berstatus `accepted` bila ada yang diterima, `rejected` bila tidak satu pun. Anotasi terkait di-`resolved` atau dibuka kembali di titik ini, bukan per hunk, karena satu anotasi dapat dijawab beberapa hunk.

**`getPending`** mengembalikan hunk sisa yang sudah dianchor ulang ke sumber tersimpan, dihitung sebagai diff antara sumber tersimpan dan hasil penerapan hunk yang diterima ditambah hunk yang belum diputuskan. Klien tidak menghitung offset baris sendiri.

**Aksi borong** dipertahankan lewat jalur `accept` yang sudah ada: terima sisanya dan tolak sisanya dikirim sebagai satu panggilan berisi daftar indeks, supaya proposal dengan banyak hunk tidak menuntut sebanyak itu ronde jaringan.

**Editor.** Extension CodeMirror baru merender hunk sisa terhadap buffer yang isinya sumber tersimpan. Baris hapus memang ada di buffer dan dihias sebagai baris coral; baris tambah disisipkan sebagai block widget mint yang tidak dapat diketik. Di atas tiap hunk ada block widget berisi label bab dari `proposalHunkLabel` beserta tombol Terima dan Tolak, dan tempat munculnya pesan compile gagal untuk hunk itu.

Editor bersifat read-only selama masih ada hunk yang belum diputuskan; tanpa itu ketikan user membasikan sisa hunk pada setiap klik. Bannernya menerangkan alasan.

**Banner preview** dipertahankan dan berubah menjadi penunjuk sisa (misalnya "Astra mengusulkan 5 bagian · 3 tersisa") dengan aksi berpindah ke tab Editor. `ProposalReviewCard.svelte` dihapus dan `proposal-review-interactions.svelte.ts` disederhanakan mengikutinya.

Sesudah tiap keputusan yang menyimpan, dokumen di-reseed dari server lewat mekanisme `docKey` yang sudah ada sehingga editor menampilkan teks final dan preview ter-compile ulang.

## Perubahan data

Satu migrasi baru di `packages/db/migrations` (`0046_*`) menambahkan `base_source`, `hunk_decisions`, dan `applied_version` ke `document_edit_proposals`. Proposal pending yang sudah ada saat migrasi berjalan diisi `base_source` kosong dan `applied_version` sama dengan `base_version`; baris dengan `base_source` kosong diperlakukan sebagai basi sehingga user menolaknya lalu meminta Astra menyusun ulang.

## Batasan dan non-goals

- Tidak ada track-changes pada SVG preview, pemetaan sumber ke SVG, atau modifikasi renderer Typst.
- Tidak ada tool tulis langsung. Seluruh perubahan sumber tetap berupa proposal yang ditinjau user.
- Tidak ada patch terhadap proyek atau dokumen lain yang hanya di-mention.
- Tetap maksimal satu proposal pending per proyek, tanpa supersede otomatis.
- Tidak ada panel daftar anotasi dan tidak ada baris status permanen di composer.
- Tidak ada library diff, editor, atau anotasi baru. Pakai CodeMirror, `diff`, TanStack Query, dan komponen UI yang sudah ada.
- `request_document_edit` dan jalur dokumen Markdown `apps/web` tidak diubah perilakunya, hanya diturunkan presedensinya di dalam scope proyek Typst.

## Kriteria penerimaan

1. "Tambahkan pembahasan tentang X" di chat proyek menghasilkan proposal tanpa Astra bertanya lebih dulu dan tanpa draf panjang muncul di chat; "apa itu X" dijawab di chat tanpa menyentuh dokumen.
2. Astra dapat menyebut struktur bab, jumlah kata, dan bab kosong tanpa memanggil tool apa pun karena manifest sudah memuatnya.
3. `read_document_section` mengembalikan satu bab beserta rentang barisnya, dan anchor `oldText` proposal berasal dari potongan itu.
4. `add_reference_to_project` menghasilkan `@key` yang muncul di `list_project_references` dan lolos `check_document` tanpa berstatus yatim.
5. `check_document` melaporkan sitasi yatim, bab kosong, dan heading ganda pada dokumen uji yang sengaja cacat.
6. `propose_outline` menghasilkan proposal yang tampil di reviewer inline yang sama dengan proposal isi.
7. Empty state chat menampilkan aksi yang cocok dengan keadaan dokumen nyata dan hilang setelah pesan pertama.
8. Dua anotasi pada dokumen menampilkan pin ❶ dan ❷ terurut dari atas; hover menampilkan catatan; klik membuka popover dengan ketiga aksinya; chip composer menampilkan nomor yang sama.
9. Anotasi yang teks acuannya sudah tidak ada di dokumen tampil sebagai pin melayang dan hanya menawarkan hapus.
10. Proposal tiga hunk dapat diselesaikan sebagai terima–tolak–terima; tiap terima menyimpan seketika, tolak tidak memicu compile, dan proposal tertutup tepat setelah keputusan ketiga.
11. Menerima hunk yang membuat dokumen gagal compile menyisakan hunk itu belum diputuskan, menampilkan diagnostik di action bar-nya, dan tidak mengubah dokumen.
12. Menyunting dokumen dari sesi lain saat review berjalan menandai sisa hunk basi dan hanya menyisakan tolak sisanya serta minta Astra susun ulang.
13. Editor read-only selama masih ada hunk belum diputuskan, dan kembali dapat disunting setelah proposal tertutup.
14. Seluruh operasi tetap terisolasi pemilik dan workspace.

## Risiko yang diterima

- **Compile per klik.** Proposal lima hunk yang diterima satu per satu memakai lima compile dan lima kuota. Ini konsekuensi langsung dari keputusan menyimpan tiap klik; jalan pintas compile hanya menolong keputusan terakhir. Aksi borong tersedia bagi user yang ingin menghindarinya.
- **Urutan hunk bisa berarti.** Menerima hunk yang memakai `@key` sebelum hunk yang menambahkan sitasinya akan gagal compile. Perilaku ini dijelaskan lewat diagnostik per hunk dan bukan dianggap bug.
- **Dua parser heading.** Sisi server dan klien punya implementasi terpisah karena batas impor. Fixture uji bersama menahan penyimpangan, tetapi ini tetap utang yang harus disebut saat salah satunya diubah.
- **Manifest lebih berat.** Setiap turn membawa 150–250 token tambahan. Ditukar dengan hilangnya satu ronde tool call orientasi pada hampir setiap permintaan edit.
