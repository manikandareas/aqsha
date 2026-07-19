# Design: Testimonial compact landing page Aqsha

## Tujuan

Menambahkan satu social-proof section yang ringkas setelah rangkaian fitur utama. Section ini mengambil ritme visual dari referensi pengguna—rating, kutipan berjenjang, highlight hasil, dan identitas pengguna—namun diterjemahkan ke design system Aqsha dan konteks mahasiswa yang sedang mengerjakan skripsi.

Section tidak boleh menambah klaim angka, logo kampus, atau testimoni yang tampak sebagai endorsement terverifikasi. Nama dan identitas yang ditampilkan adalah persona fiktif untuk kebutuhan marketing placeholder dan harus mudah diganti saat testimoni asli tersedia.

## Penempatan dan boundary

- Tambahkan komponen baru `apps/www/src/components/marketing/testimonial-section.tsx`.
- Render `TestimonialSection` di `apps/www/src/pages/index.astro` tepat setelah `<FeatureBlocksSection client:visible />` dan sebelum `<AudienceSection client:visible />`.
- Komponen berdiri sendiri dan tidak mengubah `FeatureBlocksSection`.
- Konten testimonial disimpan sebagai constant lokal bertipe statis agar mudah diganti tanpa menyentuh struktur markup.
- Tidak ada dependency atau aset gambar baru.

## Konten

Rating memakai lima bintang dekoratif dengan accessible label “Dinilai 5 dari 5”. Kutipan menggunakan bahasa pengguna yang santai dan relevan dengan positioning Aqsha:

> “Dulu aku selalu ragu tiap masukin kutipan ke skripsi. Setelah pakai Aqsha, aku bisa:
> 1. nemuin jurnal yang relevan,
> 2. nulis sambil tetap nyambung ke sumber,
> 3. dan yang paling penting—setiap kutipan bisa aku cek sebelum ketemu dosen.”
>
> “Revisiku jadi jauh lebih tenang.”

Identitas placeholder:

- Nama: Nadia Putri
- Peran: Mahasiswa tingkat akhir
- Afiliasi: Universitas Brawijaya
- Penanda: `Persona pengguna` untuk menjelaskan secara halus bahwa identitasnya bukan endorsement pengguna terverifikasi.

Kalimat hasil “setiap kutipan bisa aku cek sebelum ketemu dosen” menjadi fokus visual yang di-highlight.

## Arah visual

- Section berbentuk full-width band dengan `bg-secondary` dan `text-secondary-foreground` sebagai jeda visual setelah section fitur yang terang.
- Isi dibatasi sekitar `max-w-4xl`, rata tengah, dengan vertical padding yang compact: kurang lebih `py-20` pada mobile dan `py-24`–`py-28` pada desktop.
- Heading dan kutipan utama memakai `font-heading`; teks pendukung dan identitas memakai font sans default.
- Lima bintang memakai token `text-lemon`. Ikon diambil dari adapter ikon lokal, bukan dependency icon langsung. Jika adapter tidak menyediakan star yang sesuai, gunakan inline SVG sederhana yang hanya dimiliki komponen.
- Highlight hasil memakai bidang `lemon-soft` atau warna lemon transparan dengan foreground yang kontras. Bentuknya mengikuti radius design system dan tidak memakai gradient.
- Avatar berupa monogram `NP` dalam lingkaran dengan border 2px dan kombinasi token `mint`/`lemon`; tidak menggunakan foto stok atau wajah AI.
- Baris identitas memuat nama, peran/afiliasi, serta label kecil `Persona pengguna` dengan hierarki yang tenang agar tidak mengalahkan kutipan.
- Tidak ada card besar di dalam band. Section mengandalkan typography, spacing, dan satu highlight untuk menjaga karakter editorial Aqsha.
- Dark mode tetap menggunakan token yang sama; tidak ada warna hard-coded yang hanya bekerja di satu theme.

## Responsive behavior

- Desktop: kutipan maksimal sekitar 3–5 baris visual, daftar manfaat tetap terbaca sebagai tiga baris, identitas berada horizontal di tengah.
- Mobile: ukuran type turun secara bertahap, highlight boleh membungkus, dan baris identitas tetap horizontal selama muat lalu menggunakan alignment yang stabil tanpa overflow.
- Section tidak memakai fixed height; tinggi mengikuti isi agar localization dan font loading tidak memotong konten.

## Motion dan accessibility

- Komponen menjadi React island `client:visible` karena memakai entrance motion ringan.
- Satu kelompok konten fade-up saat masuk viewport; rating, kutipan, dan identitas boleh memakai stagger kecil tetapi total gerak tetap singkat.
- `prefers-reduced-motion` menampilkan state akhir tanpa transform.
- Kutipan menggunakan elemen `<blockquote>` dan identitas menggunakan `<footer>`/`<cite>` yang semantik.
- Bintang visual diberi `aria-hidden`; rating memiliki teks aksesibel terpisah.
- Kontras highlight dan teks harus tetap jelas pada light dan dark theme.

## Pengujian dan verifikasi

- Tambahkan test source-level minimal yang gagal sebelum implementasi dan memastikan `index.astro` menempatkan `TestimonialSection` langsung setelah `FeatureBlocksSection`.
- Tambahkan test untuk contract konten/markup bila test harness `apps/www` mendukung rendering komponen tanpa menambah setup besar; jika tidak, verifikasi semantik melalui output build.
- Jalankan pemeriksaan scoped untuk `@aqsha/www` atau command workspace yang tersedia, lalu `bun run typecheck` dan `bun run build` sesuai risiko perubahan.
- Render landing page dan ambil screenshot desktop serta mobile.
- Periksa urutan section, wrapping highlight, keterbacaan dark/light surface, alignment identitas, dan tidak adanya overflow horizontal.

## Di luar scope

- Carousel atau rotasi banyak testimonial.
- CMS, analytics event, atau fetch testimonial dari backend.
- Foto pengguna, logo universitas, dan klaim keberhasilan kuantitatif.
- Perubahan pada section fitur, audience, pricing, atau social-proof marquee yang sudah ada.
