# Secret management dengan Infisical

Aqsha memakai **Infisical self-hosted** (`https://secrets.aqshara.com`) sebagai single source of
truth untuk semua secret/config build & runtime. Menambah atau merotasi secret cukup di Infisical —
tanpa menyentuh GitHub atau Dokploy. Model deploy tak berubah: **build off-VPS di CI → GHCR → Dokploy
pull/restart**; hanya *sumber* secret yang berpindah.

## Kenapa

Env runtime tumbuh (~40: Clerk, OpenAI, Mayar ×12, Sentry, Langfuse, Grafana, Mistral, …). Mengelola
manual di Dokploy Environment tab + duplikatnya di GitHub Variables/Secrets tidak scalable, dan makin
parah begitu ada environment kedua (staging). Infisical menyatukannya dengan slug `dev`/`staging`/`prod`.

## Tiga titik konsumsi secret

| Titik | Dikonsumsi | Cara |
|---|---|---|
| **Build-time** | CI job `build` (di-bake ke image web) | `Infisical/secrets-action` pull folder `/build` → env → `build-args` |
| **Deploy-time** | CI job `deploy` | `Infisical/secrets-action` pull folder `/deploy` → env |
| **Runtime** | container web/api/worker/agent/migrate | image entrypoint `infisical run` pull folder `/app` → env proses |

**Asimetri penting:** `NEXT_PUBLIC_*` di-*bake* ke image web saat build → image web `staging` ≠ `prod`.
Image api/agent netral-environment (semua config runtime dari Infisical) → bisa dipakai lintas-env.

## Prinsip pembagian (kenapa tidak 100% lewat Infisical)

Container **milik kita** (Dockerfile kita kontrol) dibungkus `infisical run` via entrypoint. Container
**stock image** (postgres/redis/minio/minio-init) tak punya CLI dan membaca env lewat
interpolasi `${VAR}` compose → kredensial infra-nya **tetap di Dokploy Environment tab**. Hasilnya:
Dokploy env menyusut dari ~40 → ~6 wajib (+ `IMAGE_TAG`/isolasi staging opsional), dan seluruh secret
aplikasi pindah ke Infisical. (Observability sekarang Sentry-first — env-gated di Infisical `/app`/
`/build`, bukan lagi lewat Dokploy `COMPOSE_PROFILES`/`GRAFANA_CLOUD_*`.)

---

## Model Infisical

**Project `aqsha`**, environment slug: `dev` / `staging` / `prod`. Slug `staging` dan `prod` sama-sama
punya pipeline deploy (lihat "Staging" di bawah); struktur folder identik di semua env.

| Folder | Isi | Dibaca oleh |
|---|---|---|
| `/build` | `NEXT_PUBLIC_*`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_AUTH_TOKEN` | CI job `build` (identity `gh-actions`) |
| `/deploy` | `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_COMPOSE_ID` | CI job `deploy` (identity `gh-actions`) |
| `/infra` | `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER/PASSWORD` | direferensi `/app`; nilai juga disalin ke Dokploy untuk stock image |
| `/app` | semua secret runtime app (lihat `.env.example` bagian D) | entrypoint `infisical run` (identity `dokploy-<env>`) |

`DATABASE_URL`/`REDIS_URL`/`S3_*` di `/app` pakai **secret reference** ke `/infra` (sintaks Infisical
dot-notation `${<env>.<folder>.<KEY>}`, mis. `DATABASE_URL = postgresql://aqsha:${prod.infra.POSTGRES_PASSWORD}@postgres:5432/aqsha`)
agar password tak ditulis dua kali. `infisical run` meng-expand referensi otomatis. Prefix env WAJIB
sama dengan environment folder `/app` yang membacanya.

**Machine identities (Universal Auth):**

| Identity | Akses | Disimpan di |
|---|---|---|
| `gh-actions` | read `/build` + `/deploy`, env `prod` + `staging` | GitHub Secrets `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET` |
| `dokploy-prod` | read `/app` + `/infra`, env `prod` SAJA | bootstrap di Dokploy stack prod |
| `dokploy-staging` | read `/app` + `/infra`, env `staging` SAJA | bootstrap di Dokploy stack staging |

Identity Dokploy sengaja di-scope per env (tanpa akses silang): `/app` staging yang keliru membawa
referensi `${prod.infra.*}` akan gagal resolve (fail-closed), bukan diam-diam membaca password prod.

---

## Cara kerja runtime (entrypoint)

`infra/infisical-entrypoint.sh` di-bake ke tiap image app sebagai `/usr/local/bin/aqsha-entrypoint`
dan diset sebagai `ENTRYPOINT`; `CMD` (atau `command:` override worker/migrate) diteruskan sebagai
`"$@"`. Alur:

1. Jika `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID` kosong → `exec "$@"` langsung (build lokal / dev tanpa
   Infisical, pakai env ambient).
2. Selain itu: `infisical login --method=universal-auth …` → token → `infisical run --env $INFISICAL_ENV
   --path /app … -- "$@"` (secret disuntik sebagai env vars ke proses app).

Dokploy hanya menyuplai 5 var bootstrap: `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID/_CLIENT_SECRET`,
`INFISICAL_PROJECT_ID`, `INFISICAL_API_URL`, `INFISICAL_ENV`.

---

## Owner setup checklist (satu kali)

1. **Infisical** → buat project `aqsha`; environment `dev`, `staging`, `prod`; folder `/build`
   `/deploy` `/infra` `/app`.
2. **Isi env `prod`** (mirror dari Dokploy sekarang). Di `/app`, set `DATABASE_URL`/`REDIS_URL`/`S3_*`
   sebagai reference ke `/infra`. Daftar var per folder = `.env.example`.
3. **Machine identities** → buat `gh-actions` (scope `/build`+`/deploy`, env prod) dan `dokploy-prod`
   (scope `/app`+`/infra`, env prod). Catat Client ID/Secret masing-masing + **Project ID**.
4. **GitHub → Settings → Secrets and variables → Actions**
   - Secrets: `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET` (dari `gh-actions`).
   - Variables: `INFISICAL_PROJECT_SLUG` (mis. `aqsha`).
   - **Hapus** yang lama: Variables `NEXT_PUBLIC_*`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`; Secrets
     `SENTRY_AUTH_TOKEN`, `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_COMPOSE_ID`.
5. **Dokploy → Environment tab (prod)** → sisakan hanya bagian A `.env.example`: 5 bootstrap
   `INFISICAL_*` (pakai `dokploy-prod` + Project ID) + creds `/infra` + `IMAGE_TAG` opsional (dan var
   isolasi staging di stack staging). **Hapus** sisanya — termasuk `COMPOSE_PROFILES`/`GRAFANA_CLOUD_*`
   legacy (observability kini Sentry-first, tak lewat Dokploy). Redeploy.
6. **GHCR** (tak berubah): PAT `read:packages` di Dokploy → Settings → Registry.

---

## Local development

Primer: pakai `apps/*/.env` (lihat `apps/*/.env.example`) + `infra/compose.dev.yaml` + `bun dev` — tak
wajib Infisical. Bila ingin secret dev dari Infisical:

```bash
infisical login --domain=https://secrets.aqshara.com     # sekali
infisical run --projectId=<id> --env=dev --path=/app -- bun dev
```

## Local / emergency full-stack (CI down)

`compose.build.yaml` + `docker compose up` tetap jalan tanpa Infisical (entrypoint fallback), TAPI app
butuh secret dari env ambient. Isi 5 bootstrap `INFISICAL_*` (env `dev`/`prod`) di `.env` samping
compose agar entrypoint menarik dari Infisical; bila Infisical benar-benar tak terjangkau, suplai
secret `/app` lewat compose override `env_file:`.

---

## Verifikasi

1. **Lokal tanpa Infisical** — `docker compose -f compose.yaml -f compose.build.yaml build` lalu
   `docker compose up -d` tetap jalan (fallback entrypoint).
2. **Entrypoint** — jalankan image api dengan 5 `INFISICAL_*` di mesin ber-akses `secrets.aqshara.com`:
   log `Injecting N Infisical secrets` muncul; `/ping` OK.
3. **CI build** — push `main` (atau `workflow_dispatch`): step "Import build secrets from Infisical"
   sukses; halaman sign-in Clerk memakai publishable key benar; source-map Sentry terupload.
4. **Deploy** — Dokploy pull `:latest`, semua service up; `docker compose --profile migrate run --rm
   migrate` sukses (dapat `DATABASE_URL` dari Infisical); Astra streaming + upload artifact OK.
5. **Rotasi** — ubah satu secret `/app` → restart service → nilai baru terpakai.

## Risiko & mitigasi

- **Dependensi start-time ke `secrets.aqshara.com`** — container gagal (re)start bila Infisical down.
  Mitigasi: fallback entrypoint; container yang sedang jalan tetap pegang env-nya (hanya restart yang
  butuh Infisical). Infisical self-host di infra yang sama.
- **1 nilai duplikat** (`POSTGRES_PASSWORD`/`REDIS_PASSWORD`/`MINIO_*`) ada di Dokploy `/infra` DAN
  direferensi Infisical `/app`. Jarang dirotasi; saat rotasi ubah keduanya.
- **CI bergantung Infisical** saat build. Gate `ci.yml` tetap independen (keyless, self-skip).

## Staging

Alur branch: feature → `development` (integrasi + test lokal, tanpa deploy) → `staging` (deploy
stack staging) → `main` (deploy prod).

Staging memakai **`deploy.yml` yang sama** (branch-aware, bukan file terpisah — semua perbedaan
env adalah data, bukan langkah): push ke `staging` men-set `INFISICAL_ENV=staging`, yang
memilih `/build` staging (bake `NEXT_PUBLIC_*` staging ke image web) dan `/deploy` staging
(`DOKPLOY_COMPOSE_ID`-nya menunjuk compose service staging). Tag image: `:staging` (mutable) +
`sha-<short>-staging` (immutable, untuk pin/rollback via `IMAGE_TAG`); suffix `-staging` wajib
karena fast-forward merge `staging`→`main` menghasilkan sha sama dan image web kedua env
berbeda isi bake-nya.

Stack Dokploy kedua memakai `compose.yaml` yang sama dari branch `staging`, diisolasi lewat
env tab: `AQSHA_PROJECT_NAME=aqsha-staging` (prefix semua volume + network), `POSTGRES_HOST_PORT=5436`,
`IMAGE_TAG=staging`, bootstrap `INFISICAL_ENV=staging` + creds `dokploy-staging`. Domain:
`staging.aqshara.com` / `api.staging.aqshara.com` / `assets.staging.aqshara.com`. Isi env `staging`
mengikuti `.env.example` dengan delta: referensi `${staging.infra.*}`, Clerk development instance
(`pk_test`/`sk_test`), `MAYAR_SERVER=sandbox`, `SENTRY_ENVIRONMENT=staging`. Runbook lengkap:
DEPLOYMENT.md → Staging.
