# Resolusi Conflict PR Svelte Migration ke Development

**Tanggal:** 2026-07-27  
**Source:** `feat/apps-svelte-migration`  
**Target:** `development`

## Tujuan

Membuat branch Svelte dapat di-merge ke `development` tanpa membuang perubahan dari salah satu sisi, lalu membuka PR siap review.

## Pendekatan yang disetujui

Rebase `feat/apps-svelte-migration` di atas `origin/development`. Conflict diselesaikan dengan mempertahankan perubahan fungsional dari kedua branch.

Alternatif merge commit tidak digunakan agar riwayat PR tetap linear. PR tanpa resolusi conflict tidak digunakan karena tidak dapat di-merge.

## Resolusi per area

- **Root workspace:** pertahankan workspace `apps/www` dari `development`, serta `apps/svelte` dan seluruh script Svelte dari source branch.
- **Dependencies:** setelah `package.json` digabung, buat ulang `bun.lock` dengan Bun agar lockfile konsisten dengan manifest gabungan.
- **Services:** gabungkan export waitlist dengan komentar/pemisahan Typst; gabungkan semua rule rate-limit waitlist, LaTeX, Typst, dan library OA download.
- **Database migrations:** pertahankan migration waitlist milik `development`. Renomori seluruh rangkaian migration source yang bertabrakan setelah nomor tersebut, serta selaraskan nama file SQL, snapshot Drizzle, dan `_journal.json`. Tidak ada migration atau perubahan schema yang dibuang.

## Validasi

1. Pastikan tidak ada conflict marker atau path unmerged.
2. Jalankan `bun install --frozen-lockfile` bila lockfile telah dibuat ulang.
3. Jalankan pemeriksaan tipe dan test yang relevan pada package terdampak, lalu validasi monorepo yang diperlukan.
4. Push hasil rebase dengan `--force-with-lease` dan buat PR `feat/apps-svelte-migration` → `development`.

## Kriteria penerimaan

- Simulasi merge ke `development` selesai tanpa conflict.
- Kedua set perubahan tetap berada di tree hasil rebase.
- Database migration memiliki urutan dan metadata Drizzle yang tidak saling bertabrakan.
- PR telah dibuat dengan target `development` dan berisi ringkasan resolusi serta hasil validasi.
