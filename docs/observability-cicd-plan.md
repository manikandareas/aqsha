# Plan: CI/CD (build off-VPS) + Observability stack production

> Status: PLAN — belum diimplementasikan. Disusun 2026-07-11.
> Cakupan: **web** (Next.js), **api** (Elysia/Bun), **worker** (BullMQ, reuse image api), **agent** (Mastra/Node) + infra pendukung di VPS Dokploy.

## Bagian 1 — CI/CD: VPS hanya deploy, bukan build

### Masalah saat ini

Dokploy meng-clone repo dan mem-build 3 image (web/api/agent) **di VPS yang sama** dengan
production (Postgres, Redis, MinIO, apps). `bun install --frozen-lockfile` + `next build` +
`mastra build` per deploy = spike CPU/RAM yang bisa mengganggu traffic live, dan build
lambat karena resource terbatas. Tidak ada CI: typecheck/test tidak dijalankan sebelum deploy.

### Arsitektur target (rekomendasi)

**GitHub Actions build → push ke GHCR → Dokploy pull image jadi → restart stack.**

```
push ke main
   │
   ▼
GitHub Actions (runner gratis 2.000 menit/bln private repo)
   ├─ Job "check":  typecheck + test + lint          ← gate sebelum build
   ├─ Job "build":  docker buildx 3 image paralel
   │     tag: ghcr.io/<owner>/aqsha-{web,api,agent}:sha-<short> + :latest
   │     cache: type=gha (layer cache antar-run)
   │     web: NEXT_PUBLIC_* dari GitHub repo Variables (baked at build)
   │     web: upload source maps ke Sentry (SENTRY_AUTH_TOKEN)   ← sinergi Bagian 2
   │
   ▼
GHCR (registry, gratis untuk private image dalam batas wajar)
   │
   ▼
Dokploy: trigger redeploy via API/webhook dari step terakhir workflow
   └─ compose.yaml: services pakai `image: ghcr.io/...` (tanpa `build:`)
      → VPS cuma `docker pull` + `up -d` (hitungan detik, nyaris nol CPU)
```

### Perubahan konkret

1. **`compose.yaml`**: ganti blok `build:` → `image: ghcr.io/<owner>/aqsha-web:${IMAGE_TAG:-latest}`
   (dst. untuk api/agent; `worker` sudah `image: aqsha-api` → ganti ke ref GHCR yang sama).
   Build args `NEXT_PUBLIC_*` pindah ke workflow CI. Untuk build lokal darurat, simpan
   override `compose.build.yaml` (docker compose -f compose.yaml -f compose.build.yaml build).
2. **`.github/workflows/deploy.yml`** (push ke `main`):
   - `check`: `bun install` → `bun run typecheck` → `bun run test` (Postgres service container
     untuk itests bila perlu, atau subset unit-only dulu) → `bun run lint`.
   - `build`: matrix 3 image, `docker/build-push-action` + `cache-from/to: type=gha`.
   - `deploy`: `curl -X POST` ke endpoint redeploy Dokploy (API key di GH Secrets).
3. **`.github/workflows/ci.yml`** (PR): check saja, tanpa build/deploy.
4. **Dockerfile hygiene** (opsional tapi murah): copy `package.json` semua workspace + `bun.lock`
   dulu → `bun install` → baru `COPY . .` — layer install tidak bust tiap perubahan source.
5. **Registry auth di Dokploy**: tambah GHCR credentials (PAT `read:packages`) di Settings →
   Registry, karena image private.
6. **Migrasi DB tetap manual** (sesuai runbook DEPLOYMENT.md Step 5) — atau tambah service
   one-shot `migrate` (profile `migrate`, image api, command `bun run db:migrate`) yang
   dijalankan sadar-diri dari terminal Dokploy. JANGAN auto-migrate on boot (risiko race
   saat beberapa container start).

### Alternatif yang dipertimbangkan (dan kenapa tidak)

| Opsi | Kenapa tidak |
| --- | --- |
| Tetap build di Dokploy/VPS | Justru masalah yang mau dihilangkan |
| Depot.dev / build server terpisah | Bayar/ops ekstra; GHA gratis sudah cukup di skala ini |
| Self-hosted GH runner | Kotak baru yang harus dirawat |
| Watchtower auto-pull | Kurang kontrol; Dokploy API trigger lebih eksplisit + terlihat di dashboard |

### Prasyarat owner (Bagian 1)

- [ ] Aktifkan GHCR di repo (Packages), buat PAT `read:packages` untuk Dokploy.
- [ ] GH Secrets: `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `SENTRY_AUTH_TOKEN` (Bagian 2).
- [ ] GH Variables: semua `NEXT_PUBLIC_*` (nilai sama dengan Environment tab Dokploy sekarang).

---

## Bagian 2 — Observability: Sentry + Grafana Cloud + Uptime Kuma (+ Langfuse eksisting)

Prinsip: **error tracking = Sentry** (semua runtime), **logs/traces/metrics = Grafana Cloud
free tier** via satu kolektor (Grafana Alloy) di VPS, **uptime = Uptime Kuma** self-host,
**LLM observability = Langfuse** (sudah ada, tidak disentuh). Semua mulai Rp 0.

### Matriks cakupan per service

| Sinyal | web (Next.js) | api (Elysia/Bun) | worker (BullMQ/Bun) | agent (Mastra/Node) |
| --- | --- | --- | --- | --- |
| Error | `@sentry/nextjs` client+server+edge | `@sentry/bun` + Elysia `onError` | `@sentry/bun` (bootstrap sama dgn api) + hook `failed` per queue | `@sentry/node` di entry Mastra |
| Logs | stdout → Alloy → Loki | pino NDJSON → Alloy → Loki | pino NDJSON → Alloy → Loki | PinoLogger Mastra → Alloy → Loki |
| Traces | (opsional, sample kecil via Sentry) | fase lanjut (OTel di Bun masih parsial) | — | Mastra Observability → exporter OTLP → Tempo |
| Metrics | — | — | queue depth (fase lanjut) | — |
| Host/container metrics | Alloy (node + docker) → Mimir | ← sama | ← sama | ← sama |
| Uptime | Uptime Kuma: `/` | `/ping` | (via log alert) | HTTP internal `agent:4317` |

### Fase 1 — Sentry (nilai terbesar, kerjaan tersedikit)

Satu org Sentry, **3 project**: `aqsha-web`, `aqsha-api` (dipakai api+worker, dibedakan tag
`process=api|worker`), `aqsha-agent`. Free tier: 5k errors/bln total, cukup.

1. **web**: `@sentry/nextjs` — `instrumentation.ts` (`onRequestError`), `instrumentation-client.ts`,
   `global-error.tsx`, `withSentryConfig` di `next.config.ts` (upload source maps saat build CI;
   di build lokal/VPS fallback tanpa upload). `tracesSampleRate` kecil (0.05) atau 0 dulu;
   Session Replay OFF (hemat kuota).
2. **api + worker**: modul bootstrap bersama `apps/api/src/lib/sentry.ts` — `Sentry.init` (`@sentry/bun`),
   `environment` dari env, `beforeSend` men-skip `AppError` 4xx yang expected. Wiring:
   - api: di plugin error handling Elysia yang ada → `Sentry.captureException` untuk 5xx/unknown,
     tag `requestId` (sudah ada di pino context) supaya bisa lompat error ↔ log.
   - worker: wrap handler BullMQ / event `failed` → capture dengan context `{queue, jobId, attemptsMade}`.
3. **agent**: `Sentry.init` (`@sentry/node`) di paling atas `src/mastra/index.ts` (ikut ter-bundle
   `mastra build`). Capture error unhandled + error step workflow /deep yang berujung failed-run.
4. **Release + source maps**: CI men-set `SENTRY_RELEASE=sha` di ketiga image → error terikat commit.

Env baru (Dokploy): `SENTRY_DSN_WEB`, `SENTRY_DSN_API`, `SENTRY_DSN_AGENT`,
`SENTRY_ENVIRONMENT=production`, `NEXT_PUBLIC_SENTRY_DSN` (build arg web, client-side).

Verifikasi: endpoint/route uji lempar error di tiap runtime (dev dulu, lalu staging deploy)
→ muncul di project yang benar dengan stack ter-symbolicate.

### Fase 2 — Logs ke Grafana Cloud (Loki) via Alloy

Free tier Grafana Cloud: 50 GB logs + 50 GB traces + 10k metric series, retensi 14 hari, 3 user.

1. Tambah service **`alloy`** di `compose.yaml` (image `grafana/alloy`), mount
   `/var/run/docker.sock` read-only + config `infra/alloy/config.alloy`:
   - `discovery.docker` + `loki.source.docker` → semua container stack, label
     `service` (web/api/worker/agent/postgres/redis/minio), `compose_project=aqsha`.
   - pipeline: parse NDJSON pino (level, requestId) → label `level` saja (hindari
     high-cardinality label; requestId cukup sebagai field terindeks-log).
   - `loki.write` → endpoint Grafana Cloud (basic auth: instance id + API token).
2. pino api/worker **tidak berubah** — sudah NDJSON ke stdout, tinggal dipanen.
3. Dashboard awal di Grafana Cloud: error-rate per service (`level=error`), log stream per
   requestId, alert rule: error spike (mis. >20 error/5 mnt) → email/Telegram.

Env baru: `GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`, `GRAFANA_CLOUD_API_TOKEN`.

### Fase 3 — Traces agent + metrics host

1. **Agent traces**: di config `Observability` yang sudah ada (`apps/agent/src/mastra/index.ts`),
   tambah exporter OTLP (`@mastra/otel-exporter` / exporter OTel bawaan Mastra) menunjuk ke
   Alloy (`http://alloy:4318`) → Alloy `otelcol.receiver.otlp` → forward ke Grafana Tempo.
   Berdampingan dengan `MastraStorageExporter` + `LangfuseExporter` (branch Langfuse yang
   sudah diimplement — merge dulu, lalu ketiganya co-exist di array `exporters`).
   Hasil: trace per deepRun/chat-turn di Tempo, terkorelasi dengan logs via traceId.
2. **Host + container metrics**: aktifkan di Alloy `prometheus.exporter.unix` (CPU/RAM/disk VPS)
   + `prometheus.exporter.cadvisor` (per-container) → `prometheus.remote_write` ke Mimir.
   Perhatikan budget 10k series free tier — cukup untuk 1 VPS + ~10 container.
3. **API traces**: DITUNDA — OTel SDK di Bun belum first-class; logs + Sentry (yang punya
   mini-tracing sendiri) sudah menutup kebutuhan debugging api. Re-evaluasi saat Bun OTel matang.

### Fase 4 — Uptime Kuma + status page

1. Service Dokploy terpisah (bukan di stack aqsha, supaya redeploy app tidak mematikan
   monitor): image `louislam/uptime-kuma:1`, volume data sendiri, join network stack aqsha
   (external network) supaya bisa cek `agent:4317` internal.
2. Monitor: `https://<domain>` (web), `https://api.<domain>/ping`, `https://assets.<domain>`
   (MinIO health), `http://agent:4317/...` (internal), URL Langfuse, + keyword check landing.
3. Notifikasi Telegram/Discord; opsional domain `status.<domain>` untuk status page publik.

### Urutan eksekusi & dependensi

```
Bagian 1 CI/CD  ──── prasyarat source-maps & deploy cepat ────┐
                                                              ▼
Fase 1 Sentry (web→api→worker→agent) → Fase 2 Loki logs → Fase 3 traces+metrics → Fase 4 Kuma
```

Fase 4 (Kuma) sebenarnya independen — bisa dikerjakan kapan saja, paling cepat nilai/effort.

### Risiko & catatan

- **RAM VPS**: tambahan hanya Alloy (~150–300 MB) + Kuma (~100 MB). Tidak ada ClickHouse
  kedua — itu alasan menolak SigNoz/HyperDX self-host untuk sekarang.
- **Kuota Sentry 5k errors/bln**: pasang `sampleRate`/dedup bila ada error storm; alert
  kuota di Sentry.
- **NEXT_PUBLIC_* drift**: setelah pindah build ke CI, source of truth build args = GH
  Variables, runtime env tetap Dokploy. Dokumentasikan di DEPLOYMENT.md saat implementasi.
- **Branch Langfuse**: exporter Langfuse (memori 2026-07-11) belum ada di branch ini —
  koordinasikan merge sebelum Fase 3 supaya array exporters dirakit sekali.
- **Redaction**: pino sudah redact token/password; pastikan Alloy tidak menambah label dari
  isi log (hanya metadata container).

### Prasyarat owner (Bagian 2)

- [ ] Buat akun Sentry (free) + 3 project → salin 3 DSN + auth token (source maps).
- [ ] Buat akun Grafana Cloud (free) → salin Loki/Tempo/Prometheus endpoint + API token.
- [ ] Putuskan domain `status.<domain>` (opsional, Fase 4).
