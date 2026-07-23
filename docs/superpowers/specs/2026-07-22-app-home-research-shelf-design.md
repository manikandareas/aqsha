# Redesign Beranda `/app`: Research Shelf

**Tanggal:** 2026-07-22
**Status:** Disetujui untuk implementation planning

## Ringkasan

Beranda `/app` dirancang ulang sebagai **Research Shelf**: ruang kerja yang menampilkan proyek seperti koleksi tulisan aktif di meja belajar. Arah visual memakai **Paper + Candy**—canvas warm paper yang tenang dengan aksen mint, lavender, coral, dan lemon untuk membedakan konteks proyek tanpa membuat halaman terasa ramai.

Redesign mempertahankan data contract workspace, API query, navigasi, sidebar, serta alur pembuatan dan pembukaan proyek yang sudah ada. Perubahan berfokus pada hierarki informasi, layout responsif, bahasa warna, state UI, dan kualitas interaksi.

## Tujuan

- Membuat pengguna segera memahami bahwa beranda adalah rumah seluruh proyek tulis mereka.
- Membantu pengguna memindai dan mengenali proyek melalui cover yang konsisten.
- Menyediakan jalur yang jelas untuk membuat proyek, menjelajahi paper, dan membuka perpustakaan.
- Mempertahankan calm density: cukup informatif untuk riset tanpa terasa seperti dashboard administratif.
- Menghadirkan karakter Aqsha yang playful pada momen kecil, bukan dekorasi page-level.

## Prinsip Desain

1. **Project-first.** Proyek adalah konten utama; shortcut dan kontrol sorting mendukung koleksi tersebut.
2. **Color carries meaning.** Warna candy menandai jenis atau konteks proyek, bukan dekorasi acak.
3. **Paper stays quiet.** Canvas dan surfaces memakai token warm paper yang sudah menjadi identitas Aqsha.
4. **Familiar interactions.** Link, button, dropdown, focus, loading, dan error mengikuti affordance standar.
5. **Motion communicates state.** Tidak ada staggered page entrance; motion hanya memberi feedback hover, focus, pressed, atau perubahan state.

## Struktur Halaman

### 1. Header

Header berisi:

- Heading `Ruang risetmu`.
- Sapaan kontekstual atau kalimat pendamping yang singkat.
- Primary action `Proyek baru` pada desktop.

Pada mobile, `AppPageHeader` (mobileOnly) hanya menampilkan sidebar trigger. Heading `Ruang risetmu`, sapaan, dan action New tetap berada di konten page (bukan di header).

### 2. Utility strip

Shortcut `Jelajahi` dan `Perpustakaan` tampil sebagai utility links horizontal dengan ikon, label, deskripsi singkat, dan directional arrow. Elemen ini tidak memakai anatomi card penuh agar tidak bersaing dengan project shelf.

Pada viewport sempit, utility links menumpuk vertikal dengan hit target minimal 44px.

### 3. Project shelf

Section utama berisi:

- Heading project collection.
- Jumlah proyek.
- `ProjectSortMenu` ketika data tersedia.
- Slot `NewProjectCard`.
- Seluruh proyek dalam `ProjectShelfCard`.
- Action `Muat lebih banyak` ketika pagination masih tersedia.

Grid memakai container queries: satu kolom → dua → tiga → empat (maksimal) sesuai lebar kolom, full-bleed tanpa `max-w-7xl`, gutter `px-5` / `@2xl:px-6`.

## Komponen

### `HomeDashboardPage.svelte`

Tetap menjadi orchestrator untuk:

- Query daftar workspace.
- Sapaan berdasarkan viewer dan waktu lokal.
- State sorting.
- Derivasi daftar proyek terurut.
- Loading, empty, error, pagination, dan populated states.

Page tidak mengambil alih tanggung jawab visual detail card.

### `HomeFeatureShortcuts.svelte`

Menampilkan utility links untuk `Jelajahi` dan `Perpustakaan`. Aksen warna hanya berada pada icon well atau interaction state. Container tidak memakai nested cards atau decorative shadow.

### `NewProjectCard.svelte`

Menjadi slot shelf yang eksplisit dengan:

- Ikon plus.
- Label `Proyek baru`.
- Penjelasan singkat yang mengurangi keraguan saat memulai.

Dashed border tetap boleh digunakan untuk membedakan creation affordance dari proyek yang sudah ada. Focus, hover, dan pressed state mengikuti vocabulary button/link Aqsha.

### `ProjectShelfCard.svelte`

Nama ini menggantikan `RecentProjectCard.svelte`, karena card dipakai untuk seluruh proyek, bukan hanya proyek terbaru.

Anatomi card:

1. Cover proyek dengan warna candy.
2. Jenis proyek dan emoji bila tersedia.
3. Cuplikan `topicNote`, atau empty copy yang ramah bila belum ada.
4. Judul proyek.
5. Waktu terakhir diedit.

Warna cover ditentukan secara deterministik dari `workspace.kind`. Mapping harus memakai token yang sudah tersedia (`mint`, `lavender`, `coral`, dan `lemon`) agar stabil di light dan dark mode. Warna bukan satu-satunya pembeda; label jenis proyek selalu tetap terlihat.

Seluruh card menjadi satu target link. Tidak ada nested interactive element di dalam hit target utama. Focus ring memakai token ring mint, sementara hover cukup mengubah border atau posisi secara halus tanpa wide blur shadow.

### `ProjectSortMenu.svelte`

Mempertahankan opsi sorting yang sudah ada. Trigger dibuat ringkas dan tetap menampilkan pilihan aktif. Menu memakai shared dropdown component agar portal, keyboard behavior, dan stacking context tetap konsisten.

## Color dan Typography

- Canvas: `background` atau paper rail token yang sudah ada.
- Card face: raised paper/card token.
- Body text: `foreground`.
- Secondary text: `muted-foreground` yang tetap memenuhi contrast minimum.
- Primary action dan active choice: emerald `primary`.
- Binary/focus state: mint `ring`.
- Project cover accents: mint, lavender, coral, dan lemon soft tokens.

Heading memakai `font-heading`/Nunito Sans. UI labels, metadata, controls, dan descriptions tetap memakai Inter. Heading tidak memakai fluid display scale yang berlebihan; ukuran mengikuti product UI hierarchy yang stabil.

## State dan Error Handling

### Loading

Loading state memakai skeleton dengan anatomi cover dan metadata yang sama seperti final card. Ini menjaga layout tetap stabil saat data selesai dimuat.

### Empty

Empty state menjelaskan manfaat proyek pertama dan tetap menyediakan `NewProjectCard` atau primary creation action. Copy mengarahkan langkah berikutnya tanpa nada peringatan.

### Error

Query error ditampilkan sebagai inline state di area project shelf. Pesan dinormalisasi melalui `readableApiErrorMessage` dari `$lib/errors`; raw `error.message` tidak ditampilkan. State menyediakan action `Coba lagi` yang memanggil query refetch.

### Pagination

`Muat lebih banyak` tetap tersedia. Selama request berikutnya berjalan, label dan disabled/loading state harus jelas tanpa mengganti seluruh shelf menjadi skeleton.

## Responsiveness dan Accessibility

- Mobile sidebar trigger dimiliki page-owned `AppPageHeader` (bukan `AppShell`).
- Home memakai `AppPageHeader` trigger-only (`mobileOnly`, tanpa title/actions); hero tetap konten page.
- Interactive target minimal 44px pada mobile.
- Semua card, shortcut, sorting, retry, dan pagination dapat dioperasikan dengan keyboard.
- Focus-visible state memiliki contrast yang jelas.
- Body dan placeholder text memenuhi WCAG 2.2 AA.
- Label jenis proyek mendampingi warna agar informasi tidak bergantung pada warna saja.
- `prefers-reduced-motion` menghapus transform non-esensial.
- Heading hierarchy tetap berurutan dan project section memakai `aria-labelledby`.
- Loading dan error state memiliki status semantics yang sesuai tanpa announcement berulang.

## Motion

- Tidak ada orchestrated page-load animation atau stagger.
- Hover/focus transition berada pada kisaran 150–200ms dengan ease-out.
- Project card boleh bergerak maksimal 2px saat hover jika tidak mengganggu layout.
- Reduced-motion menghapus transform dan mempertahankan perubahan warna/border secara instan atau crossfade singkat.

## Batasan Scope

Termasuk:

- Redesign route `/app` dan komponen presentasional yang langsung dipakai route tersebut.
- Rename `RecentProjectCard.svelte` menjadi `ProjectShelfCard.svelte` beserta import terkait.
- Penyesuaian unit test yang relevan untuk sorting atau mapping presentasi.

Tidak termasuk:

- Perubahan API workspace atau database.
- Redesign sidebar utama.
- Perubahan halaman detail proyek, library, atau explore.
- Perubahan navigasi atau route contract.
- Penambahan analytics, progress model, atau field baru yang belum tersedia dari API.

## Verifikasi

1. Jalankan formatter pada file yang disentuh.
2. Jalankan `bun run check` dari `apps/svelte`.
3. Jalankan unit test yang relevan untuk workspace sorting dan presentational helpers.
4. Verifikasi route `/app` secara visual pada desktop, tablet, dan mobile.
5. Verifikasi light mode dan dark mode.
6. Verifikasi keyboard navigation, focus-visible, loading, empty, error, populated, dan pagination states.
7. Pastikan tidak ada horizontal overflow, clipped dropdown, raw API error, atau layout shift besar.

## Kriteria Selesai

- `/app` terlihat dan berfungsi sebagai Research Shelf dengan palette Paper + Candy.
- Seluruh proyek menggunakan `ProjectShelfCard`, bukan nama atau konsep “recent project”.
- Pengguna dapat membuat, menyortir, membuka, dan memuat proyek tambahan tanpa regresi.
- State loading, empty, error, dan populated memakai bahasa visual yang konsisten.
- Hasil lulus Svelte check dan verifikasi visual responsif.
