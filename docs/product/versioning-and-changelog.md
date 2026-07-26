# Versioning & Changelog — Panduan Keputusan

> **Kebijakan versi (skema, format tag, SoT) = [VERSIONING.md](../../VERSIONING.md)** (otoritatif).
> Dokumen ini fokus pada **editorial changelog**: kapan menulis entry, kategori, dan mekaniknya.
> Selaras dengan VERSIONING.md: SoT versi = **git tag `vX.Y.Z` di `main`**, di-mirror ke field
> `version` changelog; status **pra-1.0 (`0.x`)**, rilis ber-tag pertama `v0.1.0`. Angka `1.x` pada
> contoh di bawah = **penomoran lama pra-tag** (lihat "Reconciling existing changelog entries" di
> VERSIONING.md) — dipertahankan hanya sebagai ilustrasi tingkat bump.

Dokumen ini adalah panduan **editorial changelog** untuk dua keputusan yang muncul di
hampir setiap development:

1. **Berapa versi yang tepat** untuk perubahan ini?
2. **Perlu update changelog atau tidak?**

Rujuk dokumen ini setiap kali menutup sebuah pekerjaan (PR / rilis). Tujuannya
supaya penomoran versi konsisten dan changelog hanya berisi hal yang benar-benar
dipedulikan pengguna.

---

## 1. Dua "versi" yang berbeda — jangan tertukar

| Versi | Lokasi | Untuk apa | Siapa yang lihat |
| --- | --- | --- | --- |
| **Versi produk** | git tag `vX.Y.Z` (di-mirror ke field `version` changelog) | Versi yang diumumkan ke pengguna | Pengguna (halaman `/changelog`) |
| **Versi paket** | `apps/web/package.json` (`version`) | Metadata paket internal | Developer/tooling |

**Sumber kebenaran versi = git tag `vX.Y.Z` di `main`** (lihat [VERSIONING.md](../../VERSIONING.md)).
Field `version` pada entry changelog **mencerminkan** tag itu (tanpa `v`) untuk rilis ber-versi — ia
bukan SoT-nya sendiri, tapi WAJIB sama dengan tag. Status saat ini **pra-1.0 (`0.x`)**; rilis ber-tag
pertama `v0.1.0`.

`apps/web/package.json` sengaja dibiarkan di `0.1.0` (informational) dan **tidak** dipakai sebagai
versi produk.

---

## 2. Skema versi: `MAJOR.MINOR.PATCH` (SemVer, dibaca dari sudut pengguna)

Aqsha memakai [SemVer](https://semver.org/) tapi maknanya diikat ke **dampak
yang dirasakan pengguna**, bukan API contract.

### `MAJOR` — `X.0.0`

Naik ketika kebiasaan lama pengguna **berubah mendasar**:

- Redesign total alur kerja inti atau perubahan model interaksi utama.
- Fitur lama dihapus/diganti sehingga cara lama tidak berlaku lagi.
- Migrasi yang mengharuskan pengguna beradaptasi.

> Belum pernah terjadi — Aqsha masih **pra-1.0 (`0.x`)**; `1.0.0` justru dicadangkan untuk rilis
> stabil/GA pertama (lihat VERSIONING.md). Naikkan MAJOR dengan hati-hati; ini sinyal "produk
> terasa berbeda".

### `MINOR` — `x.Y.0`

Naik ketika ada **kapabilitas baru yang user-facing** atau peningkatan
signifikan, tanpa merusak kebiasaan lama:

- Fitur/mode baru — contoh: `/deep`, analisis statistik di chat, citation manager.
- Peningkatan besar pada fitur yang sudah ada (menambah cara kerja / kemampuan).

> **Ini bump default untuk sebuah "rilis fitur".** Ketiga entry changelog yang
> ada sekarang semuanya bump MINOR.

### `PATCH` — `x.y.Z`

Naik ketika hanya ada **perbaikan atau penyempurnaan kecil** yang tetap layak
diberitahu ke pengguna, tanpa fitur baru:

- Perbaikan bug yang pengguna alami.
- Polish kecil: copy, performa, UX detail.

---

## 3. Peta kategori changelog → tingkat bump

Kategori changelog (`categories` di frontmatter) memetakan langsung ke tingkat
bump. Kalau satu entry punya beberapa kategori, **ambil tingkat tertinggi.**

| Kategori | Arti | Bump minimum |
| --- | --- | --- |
| `baru` | Fitur/kemampuan baru | **MINOR** |
| `peningkatan` | Perbaikan/penambahan pada yang sudah ada | **MINOR** kalau menambah kemampuan nyata; **PATCH** kalau sekadar polish |
| `perbaikan` | Perbaikan bug | **PATCH** |

Contoh dari entry yang ada:

- `1.5.0` → `["baru", "peningkatan"]` → ada `baru` ⇒ MINOR. ✔
- `1.4.0` → `["baru"]` → MINOR. ✔
- `1.3.0` → `["peningkatan", "perbaikan"]` → peningkatan menambah kemampuan (verifikasi sumber + ekspor sitasi) ⇒ MINOR. ✔

---

## 4. Pohon keputusan

### 4a. Apakah perlu update changelog?

Ajukan satu pertanyaan: **"Kalau saya pengguna, apakah saya menyadari atau
peduli dengan perubahan ini?"**

**PERLU changelog** kalau perubahan mengubah **apa yang pengguna lihat, rasakan,
atau bisa lakukan**:

- Fitur / mode / halaman / panel baru.
- Perubahan UX atau alur yang terlihat.
- Perbaikan bug yang pengguna alami.
- Perubahan copy penting, pricing, atau kuota.

**TIDAK perlu changelog** kalau perubahan murni internal:

- Refactor, dead-code cleanup, rename internal.
- Infra / CI / Docker / observability.
- Dependency bump tanpa efek ke pengguna.
- Test, docs internal, tooling.
- Migrasi DB yang tidak mengubah perilaku yang terlihat.

> Ragu? Default-nya **jangan** tambah changelog. Changelog yang bersih (hanya hal
> yang dipedulikan pengguna) lebih berharga daripada yang penuh noise internal.

### 4b. Apakah perlu bump versi produk?

**Bump versi terikat ke changelog.** Aturannya:

- **Perlu changelog ⇒ tentukan bump** (pakai §2–§3), isi field `version` di entry.
- **Tidak perlu changelog ⇒ tidak perlu bump** versi produk.

Beberapa PR internal boleh menumpuk tanpa bump apa pun. Versi baru muncul saat
ada rilis yang punya entry changelog.

### 4c. Batching — jangan bump per-PR

Satu `version` boleh memuat **beberapa PR/fitur yang dirilis bersamaan**. Bump
**per-rilis-yang-diumumkan**, bukan per-commit. Kalau dua fitur ke pengguna dalam
satu momen rilis, gabungkan jadi satu entry (atau dua entry dengan `version` sama
kalau memang beda tema) — jangan naikkan MINOR dua kali untuk satu momen rilis.

---

## 5. Cara menambah entry changelog (mekanik)

1. **Buat file** `apps/web/content/changelog/<slug>.mdx`.
   - **Flat only** — jangan taruh di subfolder. `_meta.path` harus satu segmen,
     kalau ada `/` route `[slug]` tidak match.
   - `<slug>` = URL akhir (`/changelog/<slug>`). Pakai kebab-case bahasa Indonesia
     yang deskriptif, mengikuti gaya entry yang ada.

2. **Isi frontmatter** (skema: `apps/web/content-collections.ts`):

   ```yaml
   ---
   title: "Judul ramah pengguna, sentence case"
   publishedAt: "2026-07-11"        # ISO date
   version: "1.6.0"                  # opsional secara skema — ISI untuk rilis ber-versi
   categories: ["baru", "peningkatan"]  # enum: baru | peningkatan | perbaikan
   summary: "Satu kalimat teaser untuk landing + excerpt."
   preview: "/changelog/<slug>.png" # opsional; kosong → cover generatif deterministik
   draft: false
   ---
   ```

3. **Tulis body MDX** untuk pengguna, bukan developer:
   - Bahasa santai seperti entry yang ada, jelaskan _manfaat_-nya.
   - **Sentence case, jangan all-caps** (aturan copywriting repo).
   - Pakai heading `##` untuk sub-bagian.

4. **Verifikasi lokal**:
   - `bun run build:dist` dulu kalau `dist` belum ter-build — tanpa ini landing
     bisa **500**.
   - `bun run dev:web`, lalu buka `/changelog` (katalog) dan `/changelog/<slug>`
     (detail).

### Gotcha yang sudah pernah menggigit

- Export terkompilasi bernama **`allChangelogs`** (plural), bukan `allChangelog`.
- Route `/changelog(.*)` **wajib public** di `apps/web/proxy.ts` (sudah, jangan
  dihapus) — kalau tidak, halaman ke-gate auth.
- Landing **500 tanpa `build:dist`** saat dev pertama.

---

## 6. Checklist saat menutup sebuah pekerjaan

- [ ] Apakah perubahan ini user-facing? (§4a) → kalau tidak, **selesai**, tanpa
      changelog & tanpa bump.
- [ ] Kalau ya: tentukan `categories` → tentukan tingkat bump (§2–§3).
- [ ] Ambil versi produk terakhir (entry changelog terbaru) → hitung versi baru.
- [ ] Buat entry `.mdx` (§5) dengan `version` baru, `summary`, body ramah pengguna.
- [ ] `build:dist` (kalau perlu) → cek `/changelog` & detail-nya render benar.
- [ ] (Opsional, hanya jika kebijakan sinkron diadopsi) samakan
      `apps/web/package.json` ke versi produk.

---

## Ringkasan satu paragraf

Versi produk hidup di field `version` entry changelog (SoT), pakai SemVer yang
dibaca dari sudut pengguna: **MAJOR** = kebiasaan berubah mendasar, **MINOR** =
fitur/kemampuan baru (default rilis), **PATCH** = perbaikan/polish. Changelog
hanya untuk perubahan yang **disadari pengguna**; perubahan internal tidak dapat
entry dan tidak bump versi. Bump per-rilis, bukan per-PR.
