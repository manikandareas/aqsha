# Aqsha www — Realignment marketing research-first

**Status:** desain disetujui  
**Tanggal:** 2026-07-26  
**Cakupan:** marketing site `apps/www` (landing, waitlist, blog, changelog, SEO/navigasi/footer bersama)  
**Pendekatan:** opsi 2 — selaraskan copy, data, CTA, editorial, dan placeholder preview produk sambil mempertahankan page graph dan komposisi visual Astro saat ini.

## 1. Tujuan

Marketing site publik masih menggambarkan Aqsha sebagai produk chat/workspace yang memverifikasi sumber untuk melindungi mahasiswa saat direview. Arah produk aktif sudah berbeda: Aqsha adalah workspace riset-dan-penulisan yang berpusat pada proyek karya tulis mahasiswa, dokumen Typst kontinu, perpustakaan sitasi terhubung, penemuan literatur paper-first, dan Astra sebagai co-writer scoped proyek yang mengusulkan perubahan untuk direview.

Pekerjaan ini menyelaraskan `apps/www` dengan arah tersebut tanpa redesign total visual atau component system. Aksi konversi publik tetap flow `/waitlist` yang diaktifkan.

## 2. Sasaran

- Menempatkan proyek karya tulis—bukan chat, workspace generik, atau policing sumber—sebagai cerita marketing utama.
- Mengomunikasikan loop produk: proyek → sumber → draf Typst → proposal/review Astra → ekspor.
- Mempertahankan surface Astro warm-paper, keycap, responsif, serta ritme visual yang telah ada.
- Mengganti media produk usang dengan placeholder jujur yang siap diisi screenshot atau demo dari `apps/svelte` kelak.
- Mereset konten editorial dan metadata publik agar seluruh route memakai bahasa research-first.
- Mengaktifkan seluruh CTA akuisisi menuju `/waitlist`.

## 3. Di luar cakupan

- Tidak ada visual redesign penuh atau penggantian page graph landing.
- Tidak ada perubahan kontrak API waitlist, flow verifikasi email, nilai harga, atau logika entitlement billing.
- Tidak ada screenshot produk, rekaman demo, atau representasi UI palsu yang dibuat-buat.
- Tidak ada changelog yang mengklaim rilis kapabilitas yang belum diumumkan atau belum tersedia.
- Tidak ada perubahan pada `apps/svelte` atau worktree migrasi Svelte yang aktif.

## 4. Pesan produk

### Positioning

- Positioning utama: **Ideas, neatly linked.**
- Penjelasan produk: Aqsha menempatkan proyek, dokumen, sumber, dan Astra mahasiswa dalam satu workflow riset-dan-penulisan agar setiap ide tetap terhubung ke bukti di belakangnya.
- Audience utama: student researcher—mahasiswa tingkat akhir, pascasarjana, dan penulis akademik awal yang mengerjakan skripsi, tesis, proposal, paper, atau literature review.
- Voice: calm, clear, playful; capable but not clinical; sentence case dalam Bahasa Indonesia.

### Pesan yang dihapus

Hapus atau ganti copy yang tidak selaras dengan pivot:

- Janji fear-driven seperti “aman saat sidang”, “tidak akan ketahuan”, atau “cek sitasi menjamin kebenaran”.
- Framing lama yang menjadikan generic workspace/file board dan global chat sebagai pusat pengalaman.
- Klaim yang tidak didukung tentang jumlah mahasiswa aktif, testimonial, social proof, atau hasil produk.
- Klaim produk turunan dari cerita provenance/anti-AI-detection lama.

## 5. Perubahan landing page

Landing page mempertahankan ritme komponen, hydration model, perilaku responsif, dan layout inti yang ada. Data serta copy-nya diganti untuk menceritakan produk research-first.

### 5.1 Hero

- Arah headline: **“Dari riset yang tercecer ke karya tulis yang siap direview.”**
- Supporting copy menjelaskan hubungan antara proyek karya tulis, dokumen Typst, perpustakaan referensi, dan Astra.
- CTA utama: **Gabung waitlist** → `/waitlist`.
- CTA sekunder: **Lihat cara kerjanya** → section workflow.
- Hero collage yang ada dipertahankan, tetapi label dan visual surface-nya menggambarkan produk baru, bukan chat/workspace yang Astra-first.

### 5.2 Urutan fitur

`features.ts` tetap menjadi source of truth bersama bagi hero collage, mega-nav, dan feature block bernomor. Isinya diganti menjadi empat kapabilitas research-first:

1. **Mulai dari karya tulismu** — proyek adalah rumah tunggal untuk skripsi, tesis, proposal, artikel, makalah, atau karya tulis lain.
2. **Tulis dalam satu dokumen yang hidup** — dokumen Typst kontinu, preview, dan outline yang dapat dinavigasi menjadi surface penulisan.
3. **Jaga sumber tetap terhubung** — library akun dan proyek menjaga sitasi, sumber, serta draf tetap terkoneksi.
4. **Astra mengusulkan, kamu yang memutuskan** — Astra bekerja dalam konteks proyek dan memberikan proposal edit untuk direview, bukan mengubah dokumen resmi secara langsung.

### 5.3 Section perbandingan

Komposisi side-by-side yang ada dipertahankan, tetapi diubah menjadi perbandingan workflow yang netral:

- tab, catatan, percakapan AI, dan dokumen terpencar versus workspace berbasis proyek;
- sitasi yang lepas dari draf versus referensi yang terhubung ke proyek aktif;
- AI yang mengubah prosa tanpa langkah review versus proposal dan review per-hunk Astra.

Section ini tidak boleh menyerang kompetitor bernama, mengklaim sitasi palsu, atau memakai bahasa fear-driven.

### 5.4 Section pendukung

- Marquee dan testimonial yang mengandalkan social proof tak terverifikasi dihapus atau diubah menjadi audience marker statis tanpa angka maupun endorsement.
- Penempatan founder story dapat dipertahankan, tetapi copy-nya ditulis ulang menjadi cerita “mengapa Aqsha dimulai dari karya tulis”.
- Pricing section dipertahankan. Entitlement “Workspace” yang tampil diganti menjadi **Proyek**; nilai harga, batas library, dan batas Deep Research tetap berasal dari katalog saat ini.
- Jawaban FAQ membahas proyek, Typst, referensi terhubung, peran Astra yang dapat direview, dan akses waitlist. Tidak boleh menjanjikan kebenaran atau memakai marketing anti-hallucination.
- Footer, navigasi, anchor section, dan metadata landing menggunakan istilah baru: proyek, dokumen, literatur, referensi, dan draf.

## 6. Kontrak placeholder preview produk

Chrome dan layout responsive frame yang ada dipertahankan. Sebuah leaf component `ProductPreviewPlaceholder` yang fokus ditambahkan untuk menggantikan image produk statis yang usang.

### Input

- `surface`: identity surface yang stabil, misalnya research shelf, dokumen Typst, referensi, atau explore.
- `title`: judul frame yang terlihat.
- `caption`: deskripsi konteks singkat.

### Perilaku

- Merender placeholder preview produk yang netral dan jelas labelnya di dalam dimensi serta chrome frame yang saat ini ada.
- Tidak membuat screenshot produk palsu atau data yang tidak didukung.
- Bersifat dekoratif untuk assistive technology; feature heading dan deskripsi terkait menyampaikan informasinya.
- Media mendatang dapat menggantikan placeholder sambil mempertahankan aspect ratio, chrome, layout, dan semantic alt text dari data fitur.

## 7. CTA dan waitlist

- Semua acquisition button yang sebelumnya disabled menjadi link aksesibel menuju `/waitlist`.
- Label CTA dapat berbeda sesuai konteks, tetapi semua harus menuju route yang sama.
- Konstanta path waitlist bersama mencegah destination drift.
- Form waitlist, API call verifikasi, error handling, dan perilaku email tidak diubah.
- Copy halaman waitlist menjelaskan akses awal untuk Aqsha research-first dan mempertahankan penjelasan bahwa email bukan newsletter.

## 8. Reset editorial

### Blog

Hapus katalog blog lama dan ganti dengan artikel evergreen research-first. Topik awal:

- Mengapa proyek karya tulis perlu didahulukan dari percakapan AI.
- Menjaga sumber, klaim, dan draf tetap terhubung.
- Astra sebagai co-writer yang mengusulkan edit untuk direview.

Entry baru memakai slug baru; redirect untuk legacy slug yang dihapus tidak termasuk cakupan ini.

### Changelog

Katalog changelog lama dihapus. Karena pivot belum dirilis secara publik, changelog baru tidak boleh mengklaim rilis yang belum terjadi.

- Indeks changelog mendapat empty state eksplisit dengan penjelasan singkat serta CTA `/waitlist`.
- Latest-update teaser pada landing tetap menoleransi tidak adanya changelog published.
- Entry masa depan hanya dipublikasikan untuk kapabilitas yang siap diumumkan.

## 9. SEO dan aksesibilitas

- Perbarui title, description, Open Graph copy, canonical-facing copy, dan JSON-LD `SoftwareApplication` landing, blog, changelog, serta waitlist mengikuti positioning research-first.
- Derivasikan FAQ structured data dari source of truth FAQ yang sudah diperbarui.
- Pertahankan semantic heading, CTA link yang keyboard-accessible, focus style yang terlihat, serta reduced-motion support saat ini.
- Pastikan empty state changelog merupakan halaman informatif yang valid, bukan region kosong atau error.
- Periksa light dan dark theme untuk placeholder yang terbaca serta penggunaan token berorientasi AA yang ada.

## 10. Batas implementasi

### Reuse dan adjust

- Base/marketing layout Astro, routing, infrastruktur content collection, style/token, button, theme control, motion provider, chrome frame saat ini, layout pricing receipt, FAQ accordion, form/API waitlist, dan SEO helper.
- Komposisi serta urutan section landing yang ada selama tetap melayani narasi baru.

### Diganti atau ditulis ulang secara material

- Data fitur, label fitur, image usage, hero copy, data/copy perbandingan, data FAQ, copy navigasi, copy footer, metadata, structured data, copy waitlist, konten blog, serta katalog/index state changelog.
- Komponen atau section lama yang hanya berfungsi menyajikan social proof tak terverifikasi atau klaim produk yang telah ditinggalkan.

## 11. Verifikasi

1. Tambahkan test fokus untuk batas catalogue/placeholder baru atau changelog empty state bila relevan.
2. Jalankan `bun run --filter '@aqsha/www' typecheck`.
3. Jalankan `bun run --filter '@aqsha/www' build`.
4. Inspeksi manual `/`, `/waitlist`, `/blog`, dan `/changelog` pada desktop/mobile serta light/dark theme.
5. Konfirmasi seluruh CTA akuisisi menuju `/waitlist`.
6. Scan source/konten publik untuk legacy term dan klaim yang telah dihapus, termasuk framing generic workspace, copy sitasi fear-driven, referensi media lama, dan social proof tak terverifikasi.
