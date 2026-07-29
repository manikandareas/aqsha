# Public landing dan waitlist

Release publik Aqsha hanya menjalankan `apps/www` dan entry API waitlist. Kode product tetap berada
di repository, tetapi `apps/web`, `apps/agent`, dan BullMQ worker tidak masuk ke
`compose.public.yaml`.

## Topologi

| Domain | Service | Port | Tanggung jawab |
| --- | --- | --- | --- |
| `aqshara.com`, `www.aqshara.com` | `www` | 8080 | Landing Astro statis dan UI waitlist |
| `api.aqshara.com` | `api` | 3001 | `/waitlist`, `/waitlist/verify`, dan health check |

Postgres dan Redis hanya internal. Stack memakai project Compose `aqsha-public`, volume baru, dan
database `aqsha_public`; jangan arahkan variabel ini ke volume atau database product lama.

## Infisical

Buat project Infisical terpisah, misalnya `aqsha-public`. Machine identity `dokploy-public` hanya
boleh membaca environment `prod`/`staging` project ini. Entry point image membaca folder `/app`.

| Folder | Variabel |
| --- | --- |
| `/infra` | `POSTGRES_PASSWORD`, `REDIS_PASSWORD` |
| `/app` | `DATABASE_URL`, `REDIS_URL`, `PUBLIC_CORS_ORIGINS`, `PUBLIC_SITE_URL`, `RESEND_API_KEY`, `WAITLIST_FROM_EMAIL`, `SENTRY_DSN_API`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `LOG_LEVEL` |
| `/build` | `PUBLIC_SITE_URL`, `PUBLIC_API_URL`, `PUBLIC_SENTRY_DSN`, `PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_ORG`, `SENTRY_PROJECT_WWW`, `SENTRY_AUTH_TOKEN` |
| `/deploy` | `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_COMPOSE_ID` |

Gunakan secret reference untuk wiring internal di `/app`:

```dotenv
DATABASE_URL=postgresql://aqsha_public:${prod.infra.POSTGRES_PASSWORD}@postgres:5432/aqsha_public
REDIS_URL=redis://:${prod.infra.REDIS_PASSWORD}@redis:6379
PUBLIC_CORS_ORIGINS=https://aqshara.com
PUBLIC_SITE_URL=https://aqshara.com
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0
LOG_LEVEL=info
```

Environment `staging` memakai hostname, kredensial, database, dan sender Resend yang terpisah.
`RESEND_API_KEY` dan `WAITLIST_FROM_EMAIL` harus siap sebelum endpoint dibuka; domain pengirim harus
sudah tervalidasi di Resend agar double opt-in benar-benar terkirim.

## Dokploy dan GitHub Actions

1. Buat Compose service baru `aqsha-public` dengan branch `main` dan Compose path
   `compose.public.yaml`. Isi tab Environment dengan [.env.public.example](../../.env.public.example).
2. Buat service staging tersendiri dengan `AQSHA_PROJECT_NAME=aqsha-public-staging`,
   `INFISICAL_ENV=staging`, dan `IMAGE_TAG=staging`.
3. Tambahkan GitHub secrets `INFISICAL_PUBLIC_CLIENT_ID` dan
   `INFISICAL_PUBLIC_CLIENT_SECRET`, serta variable `INFISICAL_PUBLIC_PROJECT_SLUG`.
   Identity `gh-actions-public` hanya perlu akses folder `/build` dan `/deploy` pada project ini.
4. Tambahkan registry credential GHCR read-only ke Dokploy. Pipeline membuat image
   `aqsha-www` dan `aqsha-api`; VPS hanya menarik image, tidak membangun source.

`migrate` tidak berjalan bersama `docker compose up`. Setelah service baru aktif tetapi sebelum
domain production dipindahkan, jalankan di terminal Dokploy:

```bash
docker compose -f compose.public.yaml --profile migrate run --rm migrate
```

Migrasi publik hanya membuat tabel `waitlist_entries`. Menjalankan `bun run db:migrate` terhadap
database product lama dilarang untuk release ini karena riwayat migrasi product dapat menghapus atau
mengubah data lama.

## Sentry

Buat dua project Sentry:

- `aqsha-www` untuk browser error landing dan waitlist.
- `aqsha-api` untuk error API dan log Pino terpilih.

`PUBLIC_SENTRY_DSN` dibake ke bundle Astro. `SENTRY_AUTH_TOKEN` hanya tersedia pada build CI untuk
upload source map dan tidak masuk image Nginx. API membaca `SENTRY_DSN_API` dari Infisical saat
runtime; release kedua project mengikuti commit SHA image.

Tambahkan uptime monitor Sentry untuk `https://aqshara.com/` dan
`https://api.aqshara.com/healthz`, serta alert untuk event error baru dan health check gagal.

## Cutover

1. Deploy dan uji `aqsha-public-staging`: landing, submit waitlist, email, verifikasi token, 429,
   `/healthz`, dan event Sentry yang sudah memiliki source map.
2. Deploy stack production baru tanpa domain production terlebih dahulu, jalankan migrasi publik,
   lalu lakukan smoke test melalui domain sementara atau terminal internal.
3. Hentikan container `web`, `agent`, dan `worker` pada stack product lama. Jangan memakai
   `docker compose down -v`; volume product harus tetap dapat dipulihkan.
4. Pindahkan `aqshara.com`/`www.aqshara.com` ke `www:8080` dan `api.aqshara.com` ke `api:3001`.
5. Setelah staging hijau dan domain baru siap, pindahkan ref `main` ke commit cutover menggunakan
   `--force-with-lease` sesuai prosedur branch cutover.

Rollback landing/API cukup dengan mem-pin `IMAGE_TAG=sha-<short>` lalu deploy ulang. Stack product
lama dan volumenya dibiarkan utuh sampai masa stabilisasi selesai.
