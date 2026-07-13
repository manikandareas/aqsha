# Runbook: CI/CD + Observability (Sentry-first + Langfuse on-demand)

Panduan **mengaktifkan + memverifikasi** CI/CD (build off-VPS) dan observability produksi Aqsha
setelah konsolidasi ke **Sentry** sebagai console incident harian:

- **Sentry** — error tracking, structured logs (Sentry Logs), uptime monitoring, dan cron monitoring
  untuk seluruh runtime (`web`, `api`, `worker`, `agent`).
- **Langfuse** — tool spesialis LLM trace/token/cost/eval Astra + `/deep`, dibuka **on-demand** saat
  menganalisis perilaku/biaya agent — bukan inbox alert harian.

> Keputusan & alasan konsolidasi (termasuk penghapusan Grafana Alloy + Uptime Kuma):
> `docs/observability-sentry-consolidation-plan.md`. Runbook deploy umum: `DEPLOYMENT.md`. SSOT env
> prod: root `.env.example`.
>
> Pilar **runtime** (Sentry, Langfuse) **env-gated & opt-in**: dengan env kosong mereka **diam
> (no-op, tak crash)**, jadi bisa dinyalakan bertahap. **CI/CD** dipicu event GitHub (push
> `main`/`development`), bukan env-gated.

## Peta pilar

| Pilar | Sinyal | Di mana jalan | Kuota free |
| --- | --- | --- | --- |
| **CI/CD** | build & deploy | GitHub Actions → GHCR → Dokploy | 2.000 mnt/bln (repo privat) |
| **Sentry — errors** | error (web/api/worker/agent) | SDK di tiap runtime → Sentry SaaS | 5k error/bln |
| **Sentry — logs** | selected structured logs | bridge Pino (api/worker) + `logOps` (agent) → Sentry Logs | lihat plan Sentry |
| **Sentry — uptime** | web + API readiness | Sentry Uptime (2 monitor prod) | per plan Sentry |
| **Sentry — cron** | siklus `feed-hydration-cycle` | `Sentry.withMonitor` di worker | per plan Sentry |
| **Langfuse** | LLM cost/trace per run | self-host infra + agent kirim trace | self-host |

**Urutan aktivasi disarankan:** CI/CD → Sentry (DSN → logs/uptime/cron otomatis mengikuti) →
Langfuse (independen, kapan saja). Master kill-switch exporter Mastra agent (storage + Langfuse):
`AQSHA_OBSERVABILITY=off` (tak menyentuh Sentry).

> **Dev vs prod:** semua env di bawah (selain Langfuse) untuk **produksi (Dokploy/Infisical)**. Di dev
> lokal, Sentry dibiarkan kosong (SDK no-op) dan observability agent cukup **Langfuse** via
> `bun run infra:obs`.

---

## 1. CI/CD — build off-VPS (GitHub Actions → GHCR → Dokploy)

VPS **tidak** mem-build lagi: GitHub Actions membangun 3 image (web/api/agent), push ke GHCR, lalu
memicu Dokploy untuk **pull + restart**. CI juga jadi gate (typecheck + lint + test) sebelum image
dibuat.

### 1a. Prasyarat owner (sekali)

1. **GHCR**: aktifkan **Packages** di repo. Buat **PAT classic** scope `read:packages` → Dokploy →
   **Settings → Registry** (`ghcr.io`, username GitHub, PAT) supaya Dokploy bisa pull image **privat**.
2. **GitHub → Settings → Secrets and variables → Actions** — CI menarik folder `/build` + `/deploy`
   dari Infisical (identity `gh-actions`), jadi GitHub hanya menyimpan bootstrap-nya:
   - **Secrets**: `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`.
   - **Variables**: `INFISICAL_PROJECT_SLUG` (mis. `aqsha-piov`).
   - `DOKPLOY_*` + `SENTRY_AUTH_TOKEN` di Infisical `/deploy`; `NEXT_PUBLIC_*` + `SENTRY_ORG` +
     `SENTRY_PROJECT_WEB` di Infisical `/build`. Peta lengkap: `docs/infisical-secrets-strategy.md`.
3. `GITHUB_TOKEN` (otomatis) cukup untuk push ke GHCR via `packages: write`.

### 1b. Cara kerja (tak ada langkah manual setelah setup)

- **PR → `main`/`development`**: `.github/workflows/ci.yml` — `bun install --frozen-lockfile` →
  `typecheck` → `lint` → `test`. Gate "hijau".
- **push → `main`** (prod) / **push → `development`** (staging): `.github/workflows/deploy.yml` —
  jalankan gate → `docker buildx` 3 image paralel (cache `type=gha`) → push
  `ghcr.io/manikandareas/aqsha-{web,api,agent}` (prod: `:sha-<short>` + `:latest`; staging:
  `:sha-<short>-staging` + `:staging`) → `POST /api/compose.deploy` Dokploy → VPS pull + restart.
- `GIT_COMMIT` di-bake ke tiap image (Dockerfile ARG) → jadi Sentry `release` + tag Langfuse.
  `NEXT_PUBLIC_*` di-bake **saat build di CI** dari Infisical **`/build`**.

### 1c. Migrasi DB (tetap manual, tak auto-on-boot)

```bash
docker compose --profile migrate run --rm migrate
```

### 1d. Build darurat lokal (CI mati)

```bash
docker compose -f compose.yaml -f compose.build.yaml build
docker compose up -d
```

### 1e. Verifikasi

- [ ] Buka PR → **CI hijau** (typecheck/lint/test).
- [ ] Merge ke `main` → workflow **Deploy** sukses → image `:sha-<short>` + `:latest` di GHCR →
  Dokploy redeploy.
- [ ] Rollback = set `IMAGE_TAG=sha-<short>` di Dokploy Environment lalu redeploy.

---

## 2. Sentry — console observability harian

Satu org Sentry, **3 project**: `aqsha-web`, `aqsha-api` (dipakai **api + worker**, dibedakan tag
`process`), `aqsha-agent`. Empty DSN = SDK **no-op** → aman ship duluan, nyalakan belakangan. Satu DSN
mengaktifkan **error + logs + (untuk worker) cron** sekaligus di runtime itu.

### 2a. Prasyarat owner

- Akun Sentry (free) → buat 3 project → salin **3 DSN** + **auth token** (untuk source map, =
  `SENTRY_AUTH_TOKEN` di §1a).

### 2b. Aktivasi — Infisical `/app` (runtime, disuntik entrypoint)

```dotenv
SENTRY_DSN_WEB=https://xxx@oXXX.ingest.sentry.io/1
SENTRY_DSN_API=https://xxx@oXXX.ingest.sentry.io/2      # api + worker (dibedakan tag process)
SENTRY_DSN_AGENT=https://xxx@oXXX.ingest.sentry.io/3
SENTRY_ENVIRONMENT=production                            # staging → "staging"
# SENTRY_TRACES_SAMPLE_RATE=0     # 0 = error+logs only (server tracing off; trace LLM milik Langfuse)
```

Error klien web butuh DSN **di-bake saat build**: `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` +
`SENTRY_PROJECT_WEB` + `SENTRY_AUTH_TOKEN` (upload source map) — semua di Infisical **`/build`**,
ditarik CI saat build (§1a). Session Replay off; tracing default 0 (jaga kuota).

`SENTRY_TRACES_SAMPLE_RATE` di-parse dengan helper bersama (`parseSampleRate` di `@aqsha/db`, salinan
identik di `apps/web/lib/sentry-config.ts`): nilai invalid/NaN/`<0`/`>1` → 0, jadi env salah tak
pernah diam-diam menaikkan ingest di luar kuota.

### 2c. Structured logs (Sentry Logs)

Aktif otomatis begitu DSN ada (`enableLogs: true`). **Tidak** semua stdout dikirim — hanya subset
diagnostik ter-redaksi (policy: `docs/observability-sentry-consolidation-plan.md` §5.1):

- **api + worker** — facade `apps/api/src/lib/log.ts` menambah stream Sentry **inline** (bukan
  worker-thread) di samping stdout Pino. `pinoRecordToSentryLog` memutuskan: `warn`/`error`/`fatal`
  **selalu** di-bridge; `info` **hanya** bila menandai dirinya `notable: true` (mis. `api_started`,
  `workers_started`, `cron_feed_hydration_registered`, `feed_hydration_cycle_fanout`); `debug`/`trace`
  & access-log per-request **tak pernah**. Retry job intermediate = `warn` (`job_retry`), kegagalan
  terminal = `error` (`job_failed`) + satu exception.
- **agent** — helper `logOps(level, message, attrs)` (`apps/agent/src/mastra/lib/observability-log.ts`)
  untuk event lifecycle terpilih (`deep_boot_sweep_started/failed`, `deep_run_completed`). Tak ada
  bulk-console capture; trace tetap milik Langfuse/Mastra.
- **Atribut** = allowlist field low-cardinality (`service`, `process`, `requestId`, `queue`, `jobId`,
  `status`, `durationMs`, `deepRunId`, …) + redaksi credential/PII (`scrubLogAttributes` + `redact`
  Pino). Backstop SDK `beforeSendLog` men-drop `debug`/`trace`.

Cari di Sentry → **Logs**: filter `service:aqsha-api process:worker`, `queue:artifact-indexing`, atau
`requestId:<id>` untuk melompat dari event error ke baris log terkait.

### 2d. Uptime monitoring (Sentry Uptime)

Alerts → **Uptime** → buat **2 monitor produksi** dari endpoint yang sudah ada:

- `https://aqshara.com` — web (+ body/keyword check landing).
- `https://api.aqshara.com/health/ready` — API **+ dependency** (Postgres + Redis + object storage);
  `/health/ready` gagal saat salah satunya down. **Jangan** pakai `/ping` sebagai readiness utama (ia
  sengaja tak cek dependency).

Bila plan Sentry hanya mengizinkan 1 monitor, prioritaskan `/health/ready`. **Staging** memakai
monitor terpisah dengan severity notifikasi lebih rendah (jangan ganggu on-call prod). Agent (tanpa
domain publik) **tidak** diekspos hanya demi uptime — deteksi via container state Dokploy + error
proxy web→agent + boot/unhandled error Sentry.

### 2e. Cron monitoring

Worker membungkus siklus repeatable `feed-hydration-cycle` dengan `Sentry.withMonitor` (crontab
`0 */3 * * *`, timezone `Etc/UTC`) → check-in in-progress/ok/error + **upsert monitor otomatis** saat
check-in pertama. Sentry lalu bisa alert bila siklus **gagal berjalan** (bukan hanya gagal saat
berjalan). Kegagalan job aktual tetap menghasilkan exception biasa.

### 2f. Alert & dashboard minimum

Hanya alert yang **actionable**, semua ke **satu** notification channel:

- new/regressed unhandled error (prod);
- error spike per project;
- BullMQ terminal failure (`job_failed`);
- readiness endpoint down (Uptime);
- cron `feed-hydration-cycle` missed;
- kuota/spend 70% & 90%.

Dashboard Sentry minimum: errors per `service`/`process`, top regression per `release`, terminal
worker failures per queue, selected warn/error logs, uptime prod. **Jangan** membuat rule identik di
Langfuse.

### 2g. Verifikasi

- [ ] Test error tiap runtime (dev → staging → prod) → project **benar**, stack **ter-symbolicate**,
  tag `release` = commit SHA; api vs worker terpisah tag `process`.
- [ ] Sentry → **Logs**: `api_started`/`workers_started` muncul; `job_failed` searchable per `queue`;
  access-log & `debug` **tak** muncul.
- [ ] Matikan Redis/MinIO staging bergantian → `/health/ready` non-2xx → Uptime **down** lalu recover;
  notifikasi + recovery sampai channel.
- [ ] Trigger 1 siklus feed-hydration → cron monitor `feed-hydration-cycle` **ok**.

---

## 3. Langfuse — LLM cost/trace per run (on-demand, self-host)

Trace token & biaya per run Astra + `/deep` untuk validasi unit-economics dengan data nyata.
**Independen** dari Sentry; dibuka saat menganalisis perilaku/biaya agent, bukan inbox alert.

### 3a. Arsitektur

- **Langfuse jalan SATU kali** di server infra sebagai profile `langfuse` di `infra/compose.dev.yaml`
  (stack v3: `langfuse-web` + `langfuse-worker` + Postgres + ClickHouse + Redis sendiri). Blob
  event/media **numpang MinIO app** (bucket `langfuse`).
- **Agent (dev & prod) hanya MENGIRIM trace**. Aktif bila `LANGFUSE_PUBLIC_KEY` +
  `LANGFUSE_SECRET_KEY` (+ `LANGFUSE_BASE_URL` untuk self-host) diisi. Kosong = tracing mati.
  Dimatikan total oleh `AQSHA_OBSERVABILITY=off` (yang juga mematikan storage exporter Mastra).
- Trace dev vs prod dipisah tag `environment`; per-deploy dipisah `release` (= `GIT_COMMIT`). Context
  key `deepRunId`/`threadId`/turn/tier ter-tag untuk filter + unit-economics.

```text
apps/agent (dev, laptop)  ─┐
apps/agent (prod, Dokploy) ─┼──►  langfuse-web:3000  ──►  ClickHouse (traces) + Postgres + MinIO
                            │        (infra server)
UI browser (kamu)  ─────────┘
```

### 3b. Prasyarat & secret (`infra/.env`)

Docker + Compose di server infra; `infra/.env` (turunan `infra/.env.example`); `openssl`:

```bash
echo "LANGFUSE_ENCRYPTION_KEY=$(openssl rand -hex 32)"      # WAJIB tepat 64 hex char
echo "LANGFUSE_SALT=$(openssl rand -base64 32)"
echo "LANGFUSE_NEXTAUTH_SECRET=$(openssl rand -base64 32)"
```

Isi datastore password + secret + `LANGFUSE_NEXTAUTH_URL` (WAJIB bila UI diakses dari
tailnet/subdomain) + `LANGFUSE_INIT_USER_*` + `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` (di-seed ke
project saat boot). Daftar lengkap: `infra/.env.example`.

> ⚠️ **Jangan biarkan default dev** (`changeme-*`, `0000…`) di server yang bisa diakses orang lain.

### 3c. Nyalakan stack + arahkan agent

```bash
bun run infra:obs      # = docker compose -f infra/compose.dev.yaml --profile langfuse up -d
```

Tunggu ~2–3 menit (ClickHouse + migrasi). Buka `http://<BIND_HOST>:3000` → login. Lalu arahkan agent:

**Dev (lokal)** — ⚠️ `apps/agent/.env` di mesin ini **SYMLINK** (`ls -la apps/agent/.env`); tambahkan
ke file yang **benar-benar dibaca** `mastra dev`:

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-<sama-dengan-infra>
LANGFUSE_SECRET_KEY=sk-lf-<sama-dengan-infra>
LANGFUSE_BASE_URL=http://<BIND_HOST>:3000       # WAJIB self-host (default SDK = cloud.langfuse.com)
```

**Prod (Infisical `/app`)**:

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-<sama-dengan-infra>
LANGFUSE_SECRET_KEY=sk-lf-<sama-dengan-infra>
LANGFUSE_BASE_URL=https://langfuse.<domain>     # harus terjangkau dari container agent
```

> **Cross-stack networking:** stack prod (`compose.yaml`) & Langfuse (profile compose.dev) beda
> Compose project → agent menjangkau Langfuse via URL routable (subdomain/Tailscale), **bukan** DNS
> internal `langfuse-web:3000`.

### 3d. Daftarkan harga model (WAJIB untuk kolom cost)

Langfuse belum kenal model custom → cost `$0` sampai didaftarkan. UI → **Settings → Models → + New
model**:

| Model match | Input (/1M) | Output (/1M) |
| --- | --- | --- |
| `gpt-5.1` | $1.25 | $10.00 |
| `gpt-5.4-mini` | $0.75 | $4.50 |

(Opsional: cached-input = 10% dari input untuk presisi lebih.)

### 3e. Verifikasi

- [ ] **Chat Pro** 1x → trace token in/out + **cost > $0**.
- [ ] **`/deep`** 1x → trace ber-hierarki (plan → subagents → synthesis), filter per `deepRunId` →
  jumlah cost = biaya riil per run. Korelasikan dengan log Sentry `deep_run_completed` (deepRunId
  sama).
- [ ] Tag `environment` memisah `development` vs `production`.

---

## 4. Referensi env — apa diisi di mana

| Env | Pilar | Diisi di | Catatan |
| --- | --- | --- | --- |
| `DOKPLOY_*` | CI/CD | Infisical `/deploy` | trigger deploy |
| `SENTRY_AUTH_TOKEN` | CI/CD+Sentry | Infisical `/build` | upload source map web |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB` | Sentry | Infisical `/build` | di-bake saat build |
| `SENTRY_DSN_WEB/API/AGENT`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | Sentry | Infisical `/app` | kosong = no-op; DSN mengaktifkan error+logs(+cron worker) |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` | Langfuse | Infisical `/app` (prod) + `apps/agent/.env` (dev) | kosong = tracing off |
| `LANGFUSE_*` (datastore/secret) | Langfuse | `infra/.env` (server infra) | hanya untuk yang meng-host Langfuse |
| `AQSHA_OBSERVABILITY=off` | exporter Mastra agent | Infisical `/app`/dev | kill-switch storage + Langfuse (BUKAN Sentry) |
| `LOG_LEVEL` | Pino stdout | Infisical `/app`/dev | default `info` (prod), `debug` (dev) |

> **Sudah dihapus** (jangan diisi lagi): `COMPOSE_PROFILES=observability`, seluruh `GRAFANA_CLOUD_*`,
> `AQSHA_OTLP_TRACES_ENDPOINT`. Grafana Alloy + Uptime Kuma tidak lagi bagian arsitektur.

---

## 5. Rollback & manajemen kuota

- **Image rollback**: set `IMAGE_TAG=sha-<short>` (prod) / `sha-<short>-staging` (staging) di Dokploy
  Environment lalu redeploy.
- **Kuota logs Sentry mendekati 70%**: kurangi `info` `notable`, lalu sampling access-log (kalau kelak
  di-bridge), lalu `warn` non-actionable — **jangan** korbankan error event terminal. Bila perlu
  cepat, matikan bridge log dengan mengosongkan `SENTRY_DSN_API` sementara (error tracking web/agent
  tetap jalan lewat DSN-nya masing-masing) atau turunkan severity di call-site.
- **Langfuse bermasalah**: kosongkan `LANGFUSE_*` (tracing mati, app jalan) atau
  `AQSHA_OBSERVABILITY=off` **hanya sebagai emergency** — switch itu juga mematikan storage exporter
  Mastra.
- **Sentry error tracking** tak boleh dimatikan oleh masalah kuota logs; keduanya independen di dalam
  satu DSN, tetapi menghilangkan DSN mematikan keduanya untuk runtime itu.

---

## 6. Troubleshooting

| Gejala | Sebab & solusi |
| --- | --- |
| Dokploy gagal pull image (`unauthorized`) | PAT `read:packages` belum/salah di Dokploy → Settings → Registry (§1a). |
| Deploy sukses tapi VPS pakai kode lama | Cek `IMAGE_TAG` (harus `latest`/`staging` atau sha baru); `pull_policy: always` di compose sudah memaksa pull. |
| Migration belum jalan (error kolom) | `docker compose --profile migrate run --rm migrate` (§1c). |
| Sentry: error tak muncul | DSN kosong/salah; atau error itu `AppError` 4xx (di-skip `beforeSend`). |
| Sentry web: error klien tak muncul / stack tak ter-symbolicate | `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG/PROJECT_WEB` + `SENTRY_AUTH_TOKEN` belum di-set **saat build** (Infisical `/build`) — ubah lalu push (rebuild). |
| Sentry: tak ada log | DSN kosong (logs ikut DSN); atau baris itu memang tak lolos policy (`debug`/access-log/`info` tanpa `notable`). |
| Sentry: log memuat data sensitif | Seharusnya tak mungkin (allowlist + redaksi) — laporkan; periksa call-site menaruh field mentah di key yang di-allowlist. |
| Uptime false-positive / tak alert | Monitor menunjuk `/ping` (tak cek dependency) — ganti ke `/health/ready`; cek notification channel. |
| Cron `feed-hydration-cycle` "missed" | Worker tak jalan / Redis down / repeatable tak ter-register (`cron_feed_hydration_register_failed` di log). |
| Langfuse: tak ada trace | (a) key belum terbaca agent — dev cek **symlink** `.env`; (b) `LANGFUSE_BASE_URL` salah/tak terjangkau; (c) `AQSHA_OBSERVABILITY=off`. |
| Langfuse: cost $0 | Harga model belum didaftarkan (§3d). |
| Langfuse: `langfuse-web` tak "Ready" | Tunggu ClickHouse; cek `docker compose logs langfuse-clickhouse langfuse-worker`. |

---

## 7. Enhancement opsional (nanti)

- **Sentry tracing** web/API: naikkan `SENTRY_TRACES_SAMPLE_RATE` dari 0 **hanya** setelah error/log
  stabil + ada use case nyata + kuota diukur.
- **Sentry Logs** access-log: bila kelak dibutuhkan di Sentry, kirim hanya request lambat/5xx/sampel
  kecil (bukan semua) — tambahkan `notable`/sampling di `observability` plugin.
- **Langfuse**: score/eval manual untuk `/deep` (citation coverage, plan-gate outcome); dashboard
  "cost per Deep Research run" + alert ambang.
- **Host/container forensics**: bila incident menuntutnya sering, evaluasi ulang metrics store
  berdasarkan data — bukan mengaktifkan Grafana permanen hanya karena pernah dikonfigurasi.
