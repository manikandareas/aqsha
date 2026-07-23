# Advanced literature search untuk Explore

## Tujuan

Ubah `/app/explore` menjadi pencarian literatur **paper-first**. Mahasiswa dapat mencari paper OpenAlex dengan keyword biasa, mempersempit hasil melalui advanced filters yang mudah dipahami, menyimpan banyak sumber sekaligus, dan kembali ke pencarian yang sama melalui URL yang dapat dibagikan. Saat query kosong, feed kurasi yang ada tetap tampil sebagai state default di bawah hero; ia tidak memakai Filter Builder.

Referensi visual pengguna menentukan struktur: hero pencarian di keadaan awal, search bar ringkas setelah hasil tampil, serta daftar hasil vertikal. Referensi tersebut tidak mengubah visual language Aqsha: halaman tetap memakai warm-paper, border 2px, tactile controls, dan dark mode yang setara.

## Ruang lingkup

Termasuk:

- Pencarian OpenAlex Works berbasis keyword standar (`search`).
- Filter Builder yang mengekspos seluruh filter Works yang relevan bagi pengguna, dikelompokkan dalam bahasa produk.
- Popover filter besar sebelum pencarian dan sidebar filter sticky setelah hasil tampil.
- Drawer filter pada layar kecil.
- Apply eksplisit, URL state, autocomplete entitas, list result paper, batch save, dan ekspor sitasi.

Tidak termasuk:

- Semantic search.
- Boolean `AND`/`OR`/`NOT`, exact phrase, proximity, wildcard, dan fuzzy search sebagai fitur UI.
- Filter metadata teknis atau identifier mentah seperti OpenAlex ID, PMID, PMCID, MAG ID, raw affiliation, embedding, atau timestamp internal.
- Journal rank eksternal seperti SINTA, Scopus indexing/quartile, CiteScore, atau SJR. OpenAlex tidak menyediakannya secara native; fitur tersebut memerlukan integrasi dan lisensi sumber eksternal tersendiri.

## Struktur pengalaman

### Keadaan awal

1. App header Aqsha tetap ada di atas halaman.
2. Hero terpusat menampilkan judul **Cari literatur**, deskripsi singkat, search bar lebar, trigger **Filter**, dan tombol Cari.
3. Quick examples di bawah search bar hanya mengisi keyword contoh; mereka bukan mode pencarian atau semantic search.
4. Feed kurasi existing tetap berada di bawah hero saat query kosong; ia menghilang ketika sebuah query dijalankan.
5. Trigger **Filter** membuka popover besar yang di-render melalui portal agar tidak terpotong scroll container.
6. Popover memiliki navigasi kategori di sisi kiri, editor filter di sisi kanan, ringkasan filter aktif, serta footer `Reset` dan `Terapkan filter`. Tombol Apply dinonaktifkan hingga query non-kosong; filter tidak menghasilkan daftar paper tanpa keyword.

### Keadaan hasil

1. Hero menyusut menjadi search bar ringkas di bagian atas hasil.
2. Desktop memakai grid `272px + minmax(0, 1fr)`: sidebar filter sticky di kiri dan list hasil di kanan.
3. Sidebar merupakan representasi state yang sama dengan popover; tidak ada state atau formulir filter kedua.
4. Pada mobile, sidebar berubah menjadi drawer. Trigger Filter membuka drawer dan menjebak fokus hingga ditutup.
5. Popover/drawer/sidebar tidak menjalankan request saat nilai berubah. Hanya `Terapkan filter` yang meng-commit filter dan memperbarui hasil.

## Filter Builder

Filter Builder memakai katalog metadata terpusat. Katalog tersebut menentukan label, kategori, tipe input, autocomplete provider, dan mapping ke filter OpenAlex yang diizinkan. UI tidak pernah menerima raw OpenAlex filter dari pengguna.

### Kategori dan filter

| Kategori | Filter user-facing |
| --- | --- |
| Publikasi | Rentang tahun/tanggal, tipe karya, bahasa, jurnal/venue, ISSN, publisher, indeks database |
| Akses | Open access/status OA, PDF, full text, versi submitted/accepted/published, repository full text, lisensi, DOAJ, core source, serta rentang/currency APC listed atau paid |
| Dampak | Rentang sitasi, FWCI, top 1%/10% citation percentile, jumlah author, jumlah referensi |
| Penulis & afiliasi | Author, ORCID, corresponding author, institusi, tipe institusi, negara, benua, Global South |
| Bidang riset | Topic, subfield, field, domain, concept, keyword, Sustainable Development Goal |
| Pendanaan | Funder dan award |
| Keterhubungan | Mengutip paper tertentu, disitasi oleh paper tertentu, terkait dengan paper tertentu |
| Kelengkapan & integritas | Ada abstrak, DOI, referensi, serta status retracted |

Hasil retracted dikecualikan secara default. Pengguna dapat mengubahnya pada kategori Kelengkapan & integritas.

Author, institution, venue, topic, dan funder memakai autocomplete, lalu menyimpan ID OpenAlex sebagai nilai filter. Rentang angka menggunakan bahasa `minimal`/`maksimal`; operator mentah tidak tampil. Banyak filter selalu mempersempit hasil tanpa mengekspos konsep Boolean kepada pengguna.

## Hasil pencarian

Hasil dirender sebagai list vertikal padat agar paper mudah dibandingkan dan dipindai.

Setiap row memuat:

- Judul yang membuka paper reader.
- Potongan abstrak/sinopsis dari sumber, bukan AI-generated takeaway.
- Author, tahun, venue, tipe karya, dan jumlah sitasi.
- Badge yang hanya muncul bila bermakna: Open Access, PDF tersedia, review/preprint, atau retracted bila hasil retracted diizinkan.
- Aksi per paper: `Baca`, `Simpan ke perpustakaan`, dan sumber asli.

Toolbar hasil memuat jumlah hasil, ringkasan filter aktif, dan urutan. Urutan default adalah relevansi; opsi lain mengikuti atribut sort OpenAlex yang dibuka oleh katalog.

Checkbox memunculkan batch toolbar dengan jumlah pilihan, `Simpan N sumber`, dan `Ekspor sitasi`. Export bekerja langsung atas paper terpilih tanpa mewajibkan pengguna menyimpannya lebih dahulu, dengan format BibTeX, RIS, dan CSL-JSON. Pilihan dihapus setiap query, urutan, atau filter yang diterapkan berubah agar batch action tidak menyasar hasil yang sudah tidak terlihat.

## Data dan state

### State pencarian

`AppliedSearchState` adalah sumber kebenaran untuk query, sort, dan filter yang sedang berlaku. Draft filter hidup terpisah di popover/sidebar/drawer sampai pengguna menekan `Terapkan filter`.

Applied state diserialisasi sebagai `q` (keyword), `sort` (sort ID), dan `f` (base64url JSON `{ v: 1, clauses: FilterClause[] }`). URL harus dapat dipulihkan saat reload, Back/Forward, SSR, atau dibagikan. URL tidak boleh menyimpan raw filter string OpenAlex.

Menutup popover/drawer dengan tombol Tutup atau Escape membuang draft yang belum diterapkan. Reset hanya mengubah draft sampai pengguna menekan `Terapkan filter`.

### Kontrak backend

Backend menerima query dan filter clauses bertipe, memvalidasi setiap field terhadap katalog allowlist, lalu memetakannya ke parameter `search`, `filter`, dan `sort` OpenAlex. Semua logika mapping, normalisasi, cache key, dan error aplikasi berada di `packages/services`; route Elysia tetap tipis.

Pencarian berfilter mengakses OpenAlex langsung. Waterfall OpenAlex → arXiv → Crossref yang sekarang dipakai untuk pencarian sederhana tidak boleh dipakai untuk request berfilter karena provider fallback tidak dapat menjamin filter yang sama.

Autocomplete memanggil entitas OpenAlex yang relevan sebelum search Works berjalan. Pagination memakai cursor OpenAlex dan selalu kembali ke halaman pertama ketika applied state berubah.

Batch save membutuhkan operasi citation khusus. Operasi ini harus deduplikasi setiap sumber dan mengembalikan hasil per item agar UI dapat melaporkan, misalnya, `5 tersimpan, 1 gagal`. API saat ini hanya mendukung simpan satu sumber, sehingga tidak cukup untuk batch workflow. Export membangun BibTeX, RIS, atau CSL-JSON dari metadata paper yang dipilih.

## Keadaan kualitas

- **Loading:** skeleton mempertahankan geometri sidebar/drawer dan rows hasil.
- **Tidak ada hasil:** tampilkan query dan jumlah filter aktif, jelaskan bahwa filter mungkin terlalu sempit, serta sediakan `Hapus semua filter` tanpa menghapus query.
- **Validasi:** nilai tidak valid ditandai di builder sebelum request. Filter URL usang atau tidak dikenal diabaikan dengan pemberitahuan ramah.
- **Kegagalan layanan:** gunakan structured application error, pesan yang dapat dibaca, dan tombol `Coba lagi`. Tidak pernah menampilkan error mentah provider.
- **Batch parsial:** hasil sukses tetap dipertahankan; status menyebut jumlah berhasil dan gagal.
- **Aksesibilitas:** semua field memiliki label; popover/drawer mengelola fokus; Escape menutup; checkbox memiliki nama paper; filter aktif tidak bergantung pada warna; reduced motion dihormati.

## Batas komponen

- `features/explore/search-state`: codec URL, normalisasi, dan tipe public state.
- `features/explore/filter-catalog`: metadata filter yang dipakai UI dan kontrak backend.
- `features/explore/components`: search hero, popover builder, sidebar/drawer, result toolbar, result row, dan batch toolbar.
- `features/discovery`: typed query options dan model response paper; komponen discovery editorial yang lama tidak dipakai untuk result list literature.
- `packages/services`: validasi clauses, mapper OpenAlex, cache, autocomplete, dan batch citation service.
- `apps/api`: route request/response bertipe yang memanggil service.

## Verifikasi

1. Unit test codec URL: normalisasi, serialisasi, nilai usang, Back/Forward, dan pemulihan SSR.
2. Unit test katalog/filter mapper: setiap field yang diizinkan, rentang, autocomplete ID, default retraction exclusion, sort, dan penolakan field mentah.
3. Unit test query options: cache key, cursor reset saat Apply, dan state draft tidak menjalankan request.
4. Unit/integration test batch save: deduplikasi, hasil parsial, serta invalidasi cache citation.
5. Component test: popover/sidebar/drawer berbagi draft yang sama; Escape membuang draft; Apply meng-commit state.
6. E2E desktop dan mobile: hero → popover → hasil/sidebar atau drawer, keyboard focus, empty/error/retry, batch save, dan export citation.

## Referensi data

- OpenAlex Works API reference: https://developers.openalex.org/api-reference/works
- OpenAlex filtering guide: https://developers.openalex.org/guides/filtering
- OpenAlex searching guide: https://developers.openalex.org/guides/searching
- OpenAlex Sources API reference: https://developers.openalex.org/api-reference/sources
