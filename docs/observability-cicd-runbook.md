# Runbook: CI/CD + Observability Go-Live

Panduan **menyalakan** CI/CD (build off-VPS) dan seluruh stack observability produksi Aqsha:
**Sentry** (error tracking), **Grafana Cloud** via Alloy (logs · metrics · traces), **Uptime Kuma**
(uptime), dan **Langfuse** (LLM cost/trace). Kode sudah **ter-merge** (bukan lagi draft di branch
`infrastructure`) — dokumen ini hanya langkah **aktivasi + verifikasi** yang dikerjakan owner.

> Desain & alasan tiap keputusan: `docs/observability-cicd-plan.md`. Runbook deploy umum:
> `DEPLOYMENT.md`. SSOT env prod: root `.env.example`.
>
> Pilar **runtime** (Sentry, Langfuse, OTLP→Alloy) **env-gated & opt-in**: dengan env kosong mereka
> **diam (no-op, tak crash)**, jadi bisa dinyalakan **bertahap**. **CI/CD** dipicu event GitHub (push
> `main` / tag), bukan env-gated — jalan begitu workflow + secret tersedia. **Uptime Kuma** di-deploy
> sebagai service Dokploy **terpisah** (bukan bagian stack app). Semua mulai **Rp 0** (free tier).

## Peta pilar

| Pilar | Sinyal | Di mana jalan | Kuota free |
| --- | --- | --- | --- |
| **CI/CD** | build & deploy | GitHub Actions → GHCR → Dokploy | 2.000 mnt/bln (repo privat) |
| **Sentry** | error (web/api/worker/agent) | SDK di tiap runtime → Sentry SaaS | 5k error/bln |
| **Grafana Cloud** | logs + metrics + traces | service `alloy` (profile `observability`) → Grafana Cloud | 50GB log + 50GB trace + 10k series, 14 hari |
| **Uptime Kuma** | uptime + status page | Compose Dokploy **terpisah** | self-host (RAM ~100MB) |
| **Langfuse** | LLM cost/trace per run | self-host infra + agent kirim trace | self-host |

**Urutan aktivasi disarankan:** CI/CD → Sentry → Grafana Cloud → Uptime Kuma. **Langfuse** dan
**Uptime Kuma** sebenarnya independen (bisa kapan saja). Master kill-switch semua exporter tracing
agent: `AQSHA_OBSERVABILITY=off`.

> **Dev vs prod:** semua env di bawah (selain Langfuse) untuk **produksi (Dokploy)**. Di dev lokal
> observability cukup **Langfuse** via `bun run infra:obs`; var Grafana/Sentry/OTLP dibiarkan kosong
> (Alloy tak ada di `infra/compose.dev.yaml`). Detail: §5.

---

## 1. CI/CD — build off-VPS (GitHub Actions → GHCR → Dokploy)

VPS **tidak** mem-build lagi: GitHub Actions membangun 3 image (web/api/agent), push ke GHCR, lalu
memicu Dokploy untuk **pull + restart** (hitungan detik, nyaris nol CPU). CI juga jadi gate
(typecheck + lint + test) sebelum image dibuat.

### 1a. Prasyarat owner (sekali)

1. **GHCR**: di repo GitHub aktifkan **Packages**. Buat **PAT classic** scope `read:packages` →
   masukkan di Dokploy → **Settings → Registry** (`ghcr.io`, username GitHub, PAT) supaya Dokploy
   bisa pull image **privat**.
2. **GitHub → Settings → Secrets and variables → Actions** — CI menarik folder `/build` + `/deploy`
   dari Infisical (identity `gh-actions`), jadi GitHub hanya menyimpan bootstrap-nya:
   - **Secrets**: `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET` (identity `gh-actions`).
   - **Variables**: `INFISICAL_PROJECT_SLUG` (mis. `aqsha-piov`).
   - `DOKPLOY_URL`/`DOKPLOY_API_KEY`/`DOKPLOY_COMPOSE_ID` + `SENTRY_AUTH_TOKEN` kini di Infisical
     `/deploy`; `NEXT_PUBLIC_*` + `SENTRY_ORG` + `SENTRY_PROJECT_WEB` di Infisical `/build`. Peta
     lengkap: `docs/infisical-secrets-strategy.md`.
3. `GITHUB_TOKEN` (otomatis) sudah cukup untuk push ke GHCR via `packages: write` — tak perlu secret
   tambahan.

### 1b. Cara kerja (tak ada langkah manual setelah setup)

- **PR → `main`**: `.github/workflows/ci.yml` — `bun install --frozen-lockfile` → `typecheck` →
  `lint` → `test` (Postgres+Redis service container). Gate "hijau".
- **push → `main`**: `.github/workflows/deploy.yml` — jalankan gate yang sama → `docker buildx`
  3 image paralel (cache `type=gha` per-service) → push
  `ghcr.io/manikandareas/aqsha-{web,api,agent}` tag `:sha-<short>` **dan** `:latest` → `curl -X POST`
  ke `POST /api/compose.deploy` Dokploy → VPS pull `:latest` + restart.
- `GIT_COMMIT` di-bake ke tiap image (Dockerfile ARG) → jadi Sentry `release` + tag Langfuse, jadi
  error/trace terikat commit. `NEXT_PUBLIC_*` di-bake **saat build di CI** dari Infisical **`/build`**
  (via `Infisical/secrets-action`).

### 1c. Migrasi DB (tetap manual, tak auto-on-boot)

Setelah deploy yang membawa migration baru, jalankan dari terminal Dokploy / host:

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
- [ ] Merge ke `main` → workflow **Deploy** sukses → image `:sha-<short>` + `:latest` muncul di
  GHCR (repo → Packages) → Dokploy otomatis redeploy.
- [ ] Rollback = set `IMAGE_TAG=sha-<short>` di Dokploy Environment lalu redeploy.

---

## 2. Sentry — error tracking (semua runtime)

Satu org Sentry, **3 project**: `aqsha-web`, `aqsha-api` (dipakai **api + worker**, dibedakan tag
`process`), `aqsha-agent`. Empty DSN = SDK **no-op** → aman ship duluan, nyalakan belakangan.

### 2a. Prasyarat owner

- Akun Sentry (free) → buat 3 project di atas → salin **3 DSN** + **auth token** (untuk source map,
  = `SENTRY_AUTH_TOKEN` di §1a).

### 2b. Aktivasi — Infisical `/app` (runtime, disuntik entrypoint — bukan Dokploy)

```dotenv
SENTRY_DSN_WEB=https://xxx@oXXX.ingest.sentry.io/1
SENTRY_DSN_API=https://xxx@oXXX.ingest.sentry.io/2      # api + worker (dibedakan tag process)
SENTRY_DSN_AGENT=https://xxx@oXXX.ingest.sentry.io/3
SENTRY_ENVIRONMENT=production
# SENTRY_TRACES_SAMPLE_RATE=0     # 0 = error-only (hemat kuota 5k/bln); 0.05 dst utk mini-tracing
```

Error klien web butuh DSN **di-bake saat build**: `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` +
`SENTRY_PROJECT_WEB` + `SENTRY_AUTH_TOKEN` (upload source map) — semua di Infisical **`/build`**,
ditarik CI saat build (lihat §1a). Session Replay off; tracing default 0 (jaga kuota).

### 2c. Verifikasi

- [ ] Lempar test error di tiap runtime (dev dulu, lalu staging/prod) → muncul di **project yang
  benar**, stack **ter-symbolicate**, ber-tag `release` = commit SHA.
- [ ] Error api vs worker terpisah lewat tag `process`.

---

## 3. Grafana Cloud — logs + metrics + traces (via Alloy)

Satu service **`alloy`** (`grafana/alloy`) di `compose.yaml`, opt-in di belakang profile
**`observability`**, memanen semua sinyal lewat `infra/alloy/config.alloy`:

- **Logs** — stdout/stderr tiap container stack → **Loki**, label `service` + `compose_project`,
  `level` pino jadi label (requestId tetap field, anti high-cardinality). Hanya container `aqsha`
  yang dikirim (stack Dokploy lain di VPS difilter).
- **Metrics** — host CPU/RAM/disk (`node`) + per-container (`cAdvisor`) → **Prometheus/Mimir**,
  scrape 60s.
- **Traces** — agent push OTLP (Mastra AI tracing, 1 trace / `/deep` run · chat turn) ke
  `http://alloy:4318/v1/traces` → Alloy teruskan ke **Tempo** (terkorelasi ke logs via traceId).

### 3a. Prasyarat owner

- Akun **Grafana Cloud** (free). Dari **Connections** salin: **Loki** push URL + user, **Prometheus**
  remote-write URL + user, **OTLP** endpoint + user. Buat **satu Cloud Access Policy token** dengan
  scope `logs:write` + `metrics:write` + `traces:write`.

### 3b. Aktivasi — Dokploy **Environment** tab

```dotenv
# Nyalakan collector Alloy:
COMPOSE_PROFILES=observability            # gabung koma bila juga pakai profile lain

# Satu token utk 3 sinyal + endpoint/user per sinyal:
GRAFANA_CLOUD_API_TOKEN=glc_...
GRAFANA_CLOUD_LOKI_URL=https://logs-prod-012.grafana.net/loki/api/v1/push
GRAFANA_CLOUD_LOKI_USER=123456
GRAFANA_CLOUD_PROM_URL=https://prometheus-prod-012.grafana.net/api/prom/push
GRAFANA_CLOUD_PROM_USER=123456
GRAFANA_CLOUD_TEMPO_URL=https://otlp-gateway-prod-012.grafana.net/otlp   # base OTLP-HTTP (tanpa /v1/traces)
GRAFANA_CLOUD_TEMPO_USER=123456

# Suruh agent kirim trace ke Alloy (kosong = off). Set HANYA saat profile ON:
AQSHA_OTLP_TRACES_ENDPOINT=http://alloy:4318/v1/traces
```

Lalu redeploy (agent memuat `AQSHA_OTLP_TRACES_ENDPOINT`, stack menjalankan service `alloy`).

> ⚠️ **All-or-nothing**: profile ON mengharuskan **ketiga** endpoint terisi (satu akun Grafana Cloud
> memberi semuanya) — endpoint exporter kosong bisa bikin Alloy **crash-loop**. Isi ketiganya
> sekaligus. Profile OFF = nol overhead. **`AQSHA_OTLP_TRACES_ENDPOINT` jangan diisi bila profile
> OFF**, atau agent men-dial collector yang belum ada.
>
> **cAdvisor**: service `alloy` jalan `privileged: true` + mount host (`/rootfs`, `/var/lib/docker`,
> `/sys`, `/dev/disk`, `/var/run`) sesuai recipe Grafana — standar untuk collector di VPS satu-owner.
> Kalau hanya mau logs + traces (tanpa metric per-container), boleh hapus `privileged` + exporter
> cadvisor di `config.alloy`.

### 3c. Verifikasi

- [ ] `docker compose --profile observability ps` → service `alloy` **up**.
- [ ] Grafana Cloud → **Logs** ada stream `service=api|web|agent|worker|postgres|…`, filter
  `level=error` jalan.
- [ ] Grafana Cloud → **Metrics** ada seri host + per-container.
- [ ] Jalankan **`/deep`** 1x → muncul **trace** di **Tempo**.

### 3d. Dashboard & alert (di Grafana Cloud UI)

- Panel awal: **error-rate per service** (`level=error`), **log stream per requestId**.
- **Alert rule**: error spike (mis. > 20 error / 5 mnt) → email/Telegram.
- Awasi budget **10k series** (cAdvisor kontributor terbesar) — trim collector bila mendekati cap.

---

## 4. Uptime Kuma — uptime + status page

Jalan sebagai **Compose Dokploy TERPISAH** (`infra/compose.uptime.yaml`, project `aqsha-uptime`),
**bukan** bagian stack app — supaya redeploy app tak mematikan monitor/history. Join network
`aqsha_default` supaya bisa cek service internal (agent tak punya domain).

### 4a. Deploy

1. Dokploy → **Create Service → Compose** → `infra/compose.uptime.yaml`.
2. **Domains** tab: `status.<domain>` (atau `uptime.<domain>`) → container port **3001** (HTTPS + LE).
3. Boot pertama: buka UI, buat user admin, tambah **notification** (Telegram/Discord).

### 4b. Monitor yang disarankan

- `https://<domain>` (web) + **keyword check** landing
- `https://api.<domain>/ping` (api)
- `https://assets.<domain>/minio/health/live` (MinIO)
- `http://agent:4317/` (agent — internal, jalan via network join)
- URL `LANGFUSE_BASE_URL` (bila Langfuse hidup)

### 4c. Catatan

- Bila Dokploy menamai project bukan `aqsha`, ubah network eksternal di file (`aqsha_default` →
  `<project>_default`; cek `docker network ls`).
- Kuma 1.x **tak deklaratif** — monitor dikonfig di UI (disimpan di volume `uptime_kuma_data`, ikut
  di-backup).

---

## 5. Langfuse — LLM cost/trace per run (self-host)

Trace token & biaya per run Astra + `/deep` untuk validasi unit-economics (mis. asumsi ~$1,05/run
Deep Pro) dengan data nyata. **Independen** dari pilar lain; satu-satunya pilar yang juga dipakai
**dev lokal**.

### 5a. Arsitektur

- **Langfuse jalan SATU kali** di server infra sebagai profile `langfuse` di `infra/compose.dev.yaml`
  (stack v3: `langfuse-web` + `langfuse-worker` + Postgres + ClickHouse + Redis milik Langfuse
  sendiri). Blob event/media **numpang MinIO app** (bucket `langfuse`).
- **Agent (dev & prod) hanya MENGIRIM trace** ke instance itu. Aktif bila `LANGFUSE_PUBLIC_KEY` +
  `LANGFUSE_SECRET_KEY` (+ `LANGFUSE_BASE_URL` untuk self-host) diisi. Kosong = tracing mati.
- Trace dev vs prod dipisah tag `environment` (`development` / `production`).

```text
apps/agent (dev, laptop)  ─┐
apps/agent (prod, Dokploy) ─┼──►  langfuse-web:3000  ──►  ClickHouse (traces) + Postgres + MinIO
                            │        (infra server)
UI browser (kamu)  ─────────┘
```

### 5b. Prasyarat

- Docker + Compose di server infra; akses `infra/.env` (turunan `infra/.env.example`); `openssl`.
- Akses UI dari luar: IP Tailscale (`BIND_HOST`) atau subdomain via Traefik.

### 5c. Generate & isi secret (`infra/.env`)

```bash
echo "LANGFUSE_ENCRYPTION_KEY=$(openssl rand -hex 32)"      # WAJIB tepat 64 hex char
echo "LANGFUSE_SALT=$(openssl rand -base64 32)"
echo "LANGFUSE_NEXTAUTH_SECRET=$(openssl rand -base64 32)"
```

Lalu isi `infra/.env` (daftar lengkap: `infra/.env.example`):

```dotenv
# Datastore Langfuse (internal-only, tetap pakai password kuat di server bersama)
LANGFUSE_POSTGRES_PASSWORD=<random-kuat>
LANGFUSE_CLICKHOUSE_PASSWORD=<random-kuat>
LANGFUSE_REDIS_PASSWORD=<random-kuat>

# Secret aplikasi (dari openssl di atas)
LANGFUSE_ENCRYPTION_KEY=<64-hex>
LANGFUSE_SALT=<base64>
LANGFUSE_NEXTAUTH_SECRET=<base64>

# URL publik langfuse-web (dipakai NextAuth). Default localhost hanya cukup bila UI diakses dari
# mesin yang sama. Untuk tailnet/subdomain, WAJIB diisi:
LANGFUSE_NEXTAUTH_URL=http://<BIND_HOST>:3000        # atau https://langfuse.<domain>

# Login UI (owner) — dibuat otomatis saat boot pertama
LANGFUSE_INIT_USER_EMAIL=you@example.com
LANGFUSE_INIT_USER_NAME=Owner
LANGFUSE_INIT_USER_PASSWORD=<min-8-char>

# API keys project — DIPAKAI agent. Di-seed ke project saat boot; bebas string rahasia unik.
LANGFUSE_PUBLIC_KEY=pk-lf-<random>
LANGFUSE_SECRET_KEY=sk-lf-<random>
```

> ⚠️ **Jangan biarkan default dev** (`changeme-*`, `pk-lf-local-dev`, `0000…`) di server yang bisa
> diakses orang lain. Default itu hanya agar `docker compose up` biasa (tanpa profile) tak error.

### 5d. Nyalakan stack Langfuse

```bash
bun run infra:obs      # = docker compose -f infra/compose.dev.yaml --profile langfuse up -d
```

Tunggu ~2–3 menit (ClickHouse + migrasi). Cek:

```bash
docker compose -f infra/compose.dev.yaml --profile langfuse ps
docker compose -f infra/compose.dev.yaml logs -f langfuse-web   # tunggu "Ready"
```

Buka `http://<BIND_HOST>:3000` → login `LANGFUSE_INIT_USER_EMAIL` / `PASSWORD`. Project **Aqsha
Agent** sudah ada dengan API keys yang kamu set. (Infra biasa tanpa tracing tetap `bun run infra:up`.)

### 5e. Arahkan agent ke Langfuse

**Dev (lokal)** — ⚠️ `apps/agent/.env` di mesin ini **SYMLINK** ke project lain (`ls -la
apps/agent/.env`). Tambahkan ke file yang **benar-benar dibaca** `mastra dev`:

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-<sama-dengan-infra>
LANGFUSE_SECRET_KEY=sk-lf-<sama-dengan-infra>
LANGFUSE_BASE_URL=http://<BIND_HOST>:3000       # WAJIB self-host (default SDK = cloud.langfuse.com)
```

Restart `bun run dev:agent`.

**Prod (Dokploy Environment)**:

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-<sama-dengan-infra>
LANGFUSE_SECRET_KEY=sk-lf-<sama-dengan-infra>
LANGFUSE_BASE_URL=https://langfuse.<domain>     # atau http://<TAILSCALE_IP>:3000 — harus terjangkau dari container agent
```

Redeploy `agent`. Prod otomatis ber-tag `environment=production` (`NODE_ENV` di `compose.yaml`).

> **Cross-stack networking:** stack prod (`compose.yaml`) & Langfuse (profile compose.dev) beda
> Compose project → agent menjangkau Langfuse via URL routable (subdomain/Tailscale), **bukan** DNS
> internal `langfuse-web:3000`.

### 5f. Daftarkan harga model (WAJIB untuk kolom cost)

Langfuse belum kenal `gpt-5.1` & `gpt-5.4-mini` → cost tampil **$0** sampai didaftarkan. UI Langfuse
→ **Settings → Models → + New model**:

| Model match | Input (/1M) | Output (/1M) |
| --- | --- | --- |
| `gpt-5.1` | $1.25 | $10.00 |
| `gpt-5.4-mini` | $0.75 | $4.50 |

(Opsional: cached-input = 10% dari input untuk presisi lebih.)

### 5g. Verifikasi

- [ ] **Chat Pro** 1x → trace dengan token in/out + **cost > $0**.
- [ ] **`/deep`** 1x → trace ber-hierarki (plan → subagents → synthesis), filter per `deepRunId` →
  jumlah cost = biaya riil per run → bandingkan asumsi ~$1,05 (Pro) / ~$0,45 (Lite).
- [ ] Tag `environment` memisah `development` vs `production`.

---

## 6. Referensi env — apa diisi di mana

| Env | Pilar | Diisi di | Catatan |
| --- | --- | --- | --- |
| `DOKPLOY_URL` / `DOKPLOY_API_KEY` / `DOKPLOY_COMPOSE_ID` | CI/CD | GH **Secrets** | trigger deploy |
| `SENTRY_AUTH_TOKEN` | CI/CD+Sentry | GH **Secrets** | upload source map web |
| `NEXT_PUBLIC_*`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB` | CI/CD+Sentry | GH **Variables** | di-bake saat build; mirror ke Dokploy |
| `SENTRY_DSN_WEB/API/AGENT`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | Sentry | **Dokploy** | kosong = no-op |
| `COMPOSE_PROFILES=observability` | Grafana | **Dokploy** | menyalakan service `alloy` |
| `GRAFANA_CLOUD_API_TOKEN` | Grafana | **Dokploy** | 1 token utk log/metric/trace |
| `GRAFANA_CLOUD_{LOKI,PROM,TEMPO}_{URL,USER}` | Grafana | **Dokploy** | isi ketiganya sekaligus |
| `AQSHA_OTLP_TRACES_ENDPOINT` | Grafana | **Dokploy** | `http://alloy:4318/v1/traces`; kosong bila profile off |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` | Langfuse | **Dokploy** (prod) + `apps/agent/.env` (dev) | kosong = tracing off |
| `LANGFUSE_*` (datastore/secret) | Langfuse | `infra/.env` (server infra) | hanya untuk yang meng-host Langfuse |
| `AQSHA_OBSERVABILITY=off` | semua trace agent | **Dokploy**/dev | kill-switch total exporter agent |

---

## 7. Verifikasi menyeluruh (checklist go-live)

- [ ] **CI/CD**: PR → CI hijau; push `main` → build + push GHCR + Dokploy redeploy otomatis.
- [ ] **Sentry**: test error tiap runtime → project benar, symbolicated, tag `release`.
- [ ] **Grafana logs**: stream per `service`, filter `level=error`.
- [ ] **Grafana metrics**: seri host + per-container.
- [ ] **Grafana traces**: `/deep` → trace di Tempo.
- [ ] **Uptime Kuma**: semua monitor hijau + notifikasi teruji.
- [ ] **Langfuse**: cost chat Pro akurat (bukan $0); `/deep` terfilter per `deepRunId`.

---

## 8. Troubleshooting

| Gejala | Sebab & solusi |
| --- | --- |
| Dokploy gagal pull image (`unauthorized`) | PAT `read:packages` belum/salah di Dokploy → Settings → Registry (§1a). |
| Deploy sukses tapi VPS pakai kode lama | Cek `IMAGE_TAG` di Dokploy (harus `latest` atau sha baru); pastikan step `deploy` men-`curl` compose id yang benar. |
| Migration belum jalan (error kolom) | Jalankan `docker compose --profile migrate run --rm migrate` (§1c). |
| Sentry: error tak muncul | DSN kosong/salah di Dokploy; atau error itu `AppError` 4xx (memang di-skip `beforeSend`). |
| Sentry web: error klien tak muncul / stack tak ter-symbolicate | `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG/PROJECT_WEB` (Variables) + `SENTRY_AUTH_TOKEN` (Secret) belum di-set **saat build** — ubah lalu push (rebuild). |
| Alloy crash-loop | Profile ON tapi salah satu `GRAFANA_CLOUD_*_URL` kosong → isi ketiganya (§3b all-or-nothing); cek `docker compose logs alloy`. |
| Tak ada log di Loki | (a) `GRAFANA_CLOUD_LOKI_*` salah; (b) container bukan project `aqsha` (relabel keep `.*aqsha.*` — sesuaikan bila nama project beda); (c) profile belum ON. |
| Metric per-container kosong | cAdvisor perlu `privileged` + mount host (sudah di compose); di host non-Linux tak jalan. |
| Tak ada trace di Tempo | `AQSHA_OTLP_TRACES_ENDPOINT` kosong / bukan `http://alloy:4318/v1/traces`; atau `GRAFANA_CLOUD_TEMPO_URL` bukan base OTLP (…/otlp); atau `AQSHA_OBSERVABILITY=off`. |
| Uptime Kuma tak bisa cek `agent:4317` | Network eksternal salah nama (`aqsha_default` vs `<project>_default`) — cek `docker network ls`. |
| Langfuse: tak ada trace | (a) key belum terbaca agent — dev cek **symlink** `.env`; (b) `LANGFUSE_BASE_URL` salah/tak terjangkau; (c) `AQSHA_OBSERVABILITY=off`. |
| Langfuse: cost $0 | Harga model belum didaftarkan (§5f). |
| Langfuse: `langfuse-web` tak "Ready" | Tunggu ClickHouse; cek `docker compose logs langfuse-clickhouse langfuse-worker`. |
| Langfuse: login UI gagal | `LANGFUSE_NEXTAUTH_URL` harus = URL yang dipakai di browser; `NEXTAUTH_SECRET` konsisten. |

---

## 9. Enhancement opsional (nanti)

- **Sampling Sentry**: pasang `sampleRate`/dedup + alert kuota bila ada error storm.
- **API traces**: DITUNDA — OTel SDK di Bun belum first-class; logs + Sentry sudah menutup. Re-evaluasi
  saat Bun OTel matang.
- **Queue metrics** (kedalaman antrean worker) → Prometheus, fase lanjut.
- **Langfuse**: span/score manual untuk kredit Firecrawl (biaya total LLM + scrape); dashboard
  "cost per Deep Research run" + alert ambang; pin image ClickHouse untuk reproducibility.
- **Status page publik**: expose `status.<domain>` dari UI Kuma.
