# Waitlist Aqsha — Design Spec

## Status

- Status: Design disetujui secara percakapan
- Tanggal: 2026-07-25
- Scope: MVP waitlist sebelum Aqsha dipublikasikan

## Ringkasan

Aqsha belum dipublikasikan dan app akan dinonaktifkan sampai waktu yang belum ditentukan. Semua CTA yang sebelumnya mengarah ke auth akan diarahkan ke waitlist. Waitlist mengumpulkan email dan, secara opsional, company/universitas. Pendaftar wajib melakukan verifikasi email melalui Resend sebelum berstatus `confirmed`.

Implementasi menggunakan backend custom Aqsha: UI waitlist berada di canonical marketing site `apps/www`, data dan business logic berada di `apps/api`, `packages/db`, serta `packages/services`.

## Tujuan

1. Mengganti seluruh CTA auth pada landing dengan CTA yang sesuai konteks waitlist.
2. Mengumpulkan email dan company/universitas opsional.
3. Memastikan email dapat menerima komunikasi melalui double opt-in.
4. Menonaktifkan akses auth/product sementara melalui feature flag yang mudah dimatikan saat launch.
5. Menyimpan data di database Aqsha tanpa admin UI atau layanan waitlist pihak ketiga.

## Non-goals

- Tidak mengumpulkan nama.
- Tidak membuat akun Clerk saat user mendaftar.
- Tidak menyediakan admin dashboard atau export CSV pada MVP.
- Tidak mengirim newsletter atau marketing email berkala.
- Tidak membuat sistem invitation atau early-access cohort.
- Tidak menyimpan IP atau user-agent secara permanen.
- Tidak mematikan endpoint API secara permanen; mode inactive hanya mengontrol akses UI/product.

## Arsitektur

### Komponen

- `apps/www`
  - Halaman `/waitlist` sebagai static Astro page dengan hydrated form island.
  - Halaman verifikasi dan hasil verifikasi.
  - Semua CTA marketing mengarah ke `/waitlist`.
  - Konfigurasi endpoint backend melalui `PUBLIC_API_URL`.

- `apps/api`
  - Public route `POST /waitlist`.
  - Public route `POST /waitlist/verify`.
  - Integrasi Resend.
  - Validasi, rate limiting, dan structured errors.
  - CORS mengizinkan origin marketing site.

- `packages/db`
  - Schema `waitlist_entries`.
  - Drizzle migration.

- `packages/services`
  - `WaitlistService` untuk normalisasi email, deduplikasi, token, status transition, dan orchestration pengiriman email.

- `apps/web`
  - `WAITLIST_MODE` pada proxy dan route auth/product.
  - Saat aktif, `/sign-in`, `/sign-up`, `/app`, `/onboarding`, dan route product diarahkan ke marketing waitlist.

### Alur pendaftaran

```text
User membuka aqshara.com/waitlist
  -> mengisi email + company/universitas opsional
  -> apps/www POST ke API /waitlist
  -> API validasi dan normalisasi input
  -> entry baru disimpan sebagai pending
  -> token hash disimpan
  -> email verifikasi dikirim via Resend
  -> UI menampilkan instruksi cek email
```

Untuk email yang sudah `pending`, API dapat mengirim ulang email setelah cooldown. Untuk email yang sudah `confirmed`, API tidak mengirim email baru. Semua kasus mengembalikan respons generik yang sama agar status suatu email tidak dapat diekspos.

### Alur verifikasi

```text
User membuka link dari email
  -> apps/www /waitlist/verify?token=...
  -> halaman mengirim token ke API POST /waitlist/verify
  -> API hash token dan mencari entry pending yang cocok
  -> token valid dan belum expired: status menjadi confirmed
  -> UI menampilkan halaman sukses
```

Token bersifat single-use dan memiliki expiry. Halaman verifikasi menangani token invalid, expired, dan token yang sudah digunakan tanpa menampilkan detail internal.

## Data model

Tabel: `waitlist_entries`

| Field | Tipe/aturan | Keterangan |
|---|---|---|
| `id` | UUID primary key | Identitas entry |
| `email` | text, not null, unique | Email ternormalisasi lowercase dan trimmed |
| `companyOrUniversity` | text nullable | Maksimum 160 karakter |
| `status` | text + check | Hanya `pending` atau `confirmed` |
| `verificationTokenHash` | text nullable | Hash token, bukan token asli |
| `verificationExpiresAt` | bigint nullable | Epoch milliseconds |
| `verifiedAt` | bigint nullable | Epoch milliseconds saat konfirmasi |
| `createdAt` | bigint not null | Epoch milliseconds |
| `updatedAt` | bigint not null | Epoch milliseconds |

Cooldown dan rate limit dikontrol melalui Redis, bukan kolom tambahan. Token hash dikosongkan setelah berhasil digunakan.

Normalisasi email:

- trim whitespace
- lowercase
- validasi format
- unique berdasarkan hasil normalisasi

## API contract

### `POST /waitlist`

Request:

```ts
{
  email: string;
  companyOrUniversity?: string;
}
```

Rules:

- `email` wajib dan valid.
- `companyOrUniversity` opsional; whitespace-only diperlakukan sebagai kosong.
- Input memiliki batas panjang eksplisit.
- Endpoint tidak memerlukan Clerk auth.

Response sukses untuk semua kondisi normal:

```ts
{
  ok: true;
}
```

Behavior:

- Entry baru: simpan `pending` dan kirim email verifikasi.
- Entry `pending`: kirim ulang email jika cooldown terpenuhi.
- Entry `confirmed`: tidak mengirim email baru.
- Duplicate tidak menghasilkan error yang membocorkan keberadaan email.

### `POST /waitlist/verify`

Request:

```ts
{
  token: string;
}
```

Behavior:

- Token valid, pending, dan belum expired: ubah menjadi `confirmed`, isi `verifiedAt`, hapus token hash.
- Token invalid/expired/already used: return structured error aman.
- Tidak ada informasi internal database dalam response.

Error yang dirender UI setidaknya mencakup:

- input tidak valid
- rate limit
- token expired/invalid
- kegagalan pengiriman email
- internal error generik

## Email Resend

Environment yang dibutuhkan:

```text
RESEND_API_KEY
WAITLIST_FROM_EMAIL
PUBLIC_SITE_URL
PUBLIC_API_URL
```

Email verifikasi:

- menggunakan branding Aqsha
- menjelaskan bahwa user mendaftar waitlist
- menyertakan link konfirmasi
- menyebutkan masa berlaku link
- menyatakan bahwa email digunakan untuk informasi peluncuran Aqsha saja

Jika Resend gagal:

- entry tetap `pending`
- UI menampilkan pesan retry yang aman
- user dapat submit ulang setelah cooldown
- detail error hanya dicatat di server/logging

## UI dan copy

### Halaman `/waitlist`

Field:

- Email — wajib
- Company/Universitas — opsional

State:

1. Default form.
2. Submitting dengan tombol disabled.
3. Submitted: `Cek email kamu untuk mengonfirmasi pendaftaran.`
4. Error yang spesifik pada input tetapi tidak membocorkan status email.
5. Verified: `Email kamu sudah terdaftar di waitlist Aqsha.`

UI harus accessible, memiliki label field, error association, focus state, dan tetap usable di mobile.

### CTA marketing

Semua CTA auth pada canonical marketing site `apps/www` diubah menjadi konteks waitlist:

- `Mulai gratis` -> `Gabung waitlist`
- `Coba gratis` -> `Gabung waitlist`
- `Masuk` -> `Dapatkan kabar saat rilis`
- CTA pricing -> `Daftar untuk akses saat rilis`
- CTA FAQ, bottom CTA, dan footer -> `Gabung waitlist`

Semua link mengarah ke `/waitlist` pada `PUBLIC_SITE_URL`, bukan lagi `appUrl('/sign-in')` atau `appUrl('/sign-up')`.

Marketing tree yang relevan berada di `apps/www/src/components/marketing/`. Folder marketing lama di `apps/web/features/marketing` tidak boleh diubah karena sudah ditandai frozen.

## Inactive app mode

Gunakan `WAITLIST_MODE=true` pada `apps/web`.

Saat aktif:

- `/sign-in` redirect ke `${NEXT_PUBLIC_SITE_URL}/waitlist`.
- `/sign-up` redirect ke `${NEXT_PUBLIC_SITE_URL}/waitlist`.
- `/app`, `/onboarding`, dan route product redirect ke waitlist.
- Halaman Clerk auth tidak dirender.
- Route waitlist tetap public dan tidak terkena redirect Clerk.

Saat `WAITLIST_MODE=false`, flow auth yang ada dapat dipulihkan tanpa mengubah komponen waitlist.

## Keamanan dan abuse prevention

- Token dibuat dengan secure random generator.
- Hanya hash token disimpan di database.
- Token single-use dan expired, dengan expiry default 24 jam.
- Rate limit submit berdasarkan IP.
- Rate limit resend berdasarkan email.
- Honeypot field tersembunyi untuk bot sederhana.
- Batas panjang input dan body request.
- Email tidak ditulis penuh ke log.
- Response duplicate tetap generik untuk mencegah email enumeration.
- API error memakai structured application error sesuai pola Aqsha.
- Error tak terduga tidak mengekspos detail Resend atau database.

## Privacy

- Data digunakan hanya untuk notifikasi peluncuran/akses Aqsha.
- Tidak ada newsletter marketing tanpa consent tambahan.
- Form menampilkan keterangan singkat bahwa data hanya digunakan untuk notifikasi peluncuran Aqsha.
- Full privacy policy tidak termasuk scope implementasi waitlist ini.
- Penghapusan data dilakukan manual via SQL pada MVP.

## Testing dan acceptance criteria

### Service/API tests

- Email valid dan invalid.
- Email ternormalisasi dengan benar.
- Company/universitas boleh kosong.
- Company/universitas melewati batas panjang ditolak.
- Duplicate pending tidak membuat row baru.
- Duplicate confirmed tidak mengirim email baru.
- Token valid mengubah status `pending` menjadi `confirmed`.
- Token expired, invalid, dan already used ditolak.
- Token hash tidak tersimpan sebagai plaintext.
- Rate limit dan cooldown berjalan.
- Resend failure mempertahankan status `pending`.
- Response duplicate tidak membocorkan status email.

### Web tests/manual QA

- Submit form dari desktop dan mobile.
- Loading, validation, success, dan error state.
- Link email membuka halaman verifikasi.
- Verifikasi sukses dan token invalid/expired.
- Semua CTA marketing mengarah ke `/waitlist`.
- Auth/product redirect aktif saat `WAITLIST_MODE=true`.
- Waitlist tetap public meskipun Clerk middleware aktif.
- Build dan typecheck `apps/www`, `apps/api`, dan package terkait berhasil.

## Deployment/configuration checklist

1. Tambahkan schema dan migration database.
2. Siapkan Resend API key dan verified sender domain.
3. Tambahkan environment waitlist pada API, web, dan www.
4. Tambahkan origin `PUBLIC_SITE_URL` ke CORS API.
5. Deploy API lebih dahulu agar form memiliki target endpoint.
6. Deploy marketing site dengan CTA dan halaman waitlist.
7. Deploy web dengan `WAITLIST_MODE=true`.
8. Smoke test submit, email, verify, dan redirect auth di production.
9. Simpan prosedur mematikan `WAITLIST_MODE` untuk launch.

## Keputusan yang diterima

- Custom Aqsha backend, bukan SaaS waitlist.
- Email + company/universitas opsional.
- Double opt-in melalui Resend.
- Tidak ada admin UI atau export endpoint pada MVP.
- Tidak ada newsletter marketing.
- Canonical marketing tetap `apps/www`.
- App inactive dikontrol dengan feature flag.
