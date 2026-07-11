# Plan: CI/CD (build off-VPS) + Observability stack production

> Disusun 2026-07-11. Cakupan: **web** (Next.js), **api** (Elysia/Bun), **worker** (BullMQ, reuse
> image api), **agent** (Mastra/Node) + infra pendukung di VPS Dokploy.
>
> **Status implementasi (update 2026-07-11):**
> - ✅ **Bagian 1 — CI/CD**: SELESAI (kode). Branch `infrastructure` (worktree `aqsha-infrastructure`).
> - ✅ **Bagian 2 Fase 1 — Sentry**: SELESAI (kode, env-gated no-op tanpa DSN).
> - ⬜ **Fase 2 (Alloy→Loki)**, ⬜ **Fase 3 (traces agent→Tempo + metrics host)**, ⬜ **Fase 4 (Uptime Kuma)**: BELUM.
>
> Verifikasi lokal yang sudah lolos: `bun run typecheck` + `lint` + full `test` (81 itest api hijau) +
> `docker compose config` (compose.yaml & +compose.build.yaml). **Build image Docker BELUM diverifikasi**
> (tak ada daemon lokal — pertama kali jalan di CI). Belum di-commit; perubahan ada di working tree
> worktree untuk review. Owner prereqs (akun/secret/DNS) masih pending — lihat checklist di tiap bagian.

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

### ✅ IMPLEMENTED (2026-07-11)

File berubah/baru:

- **`compose.yaml`**: web/api/agent → `image: ghcr.io/manikandareas/aqsha-{web,api,agent}:${IMAGE_TAG:-latest}`
  (semua blok `build:` dicabut dari file base). `worker` + service baru `migrate` me-reuse ref image api.
- **`compose.build.yaml`** (baru): overlay build lokal darurat (`-f compose.yaml -f compose.build.yaml build`).
- **`.github/workflows/ci.yml`** (baru): gate PR + **reusable** (`workflow_call`) → typecheck + lint +
  full test di service container Postgres(pgvector)+Redis; ekstensi via `psql infra/init-extensions.sql`
  lalu `bun run db:migrate`.
- **`.github/workflows/deploy.yml`** (baru): push `main` → `check` (reuse ci.yml, `secrets: inherit`) →
  `build` (buildx matrix 3 image, cache `type=gha` per-scope, tag `sha-<short>` + `latest`) →
  `deploy` (`curl POST $DOKPLOY_URL/api/compose.deploy`, header `x-api-key`, body `{composeId}`).
- **Dockerfile** (web/api/agent): manifest-first (copy 8 `package.json` + `bun.lock` → `bun install` →
  `COPY . .`) + `ARG GIT_COMMIT` → `ENV GIT_COMMIT`/`SENTRY_RELEASE`.
- **Service `migrate`** (profile `migrate`): jalankan `docker compose --profile migrate run --rm migrate`.

Deviasi/keputusan dari rencana awal:

- **ci.yml jadi reusable** (bukan check ganda) — deploy.yml memanggilnya via `workflow_call`, satu SSOT
  "hijau". `cancel-in-progress` hanya untuk event `pull_request` supaya gate deploy tak terpotong.
- **Release tag = `GIT_COMMIT` di-BAKE via Dockerfile ARG**, BUKAN env compose — nilai compose kosong
  akan meng-clobber tag commit. Dipakai Sentry `release` **dan** Langfuse.
- **`repository_owner`** GitHub = `manikandareas` (hard-coded `ghcr.io/manikandareas/...` di compose;
  workflow pakai `${{ github.repository_owner }}` → konsisten).
- Deploy pakai `:latest` (default `IMAGE_TAG`); Dokploy `compose.deploy` menarik ulang. Pin/rollback =
  set `IMAGE_TAG=sha-<short>` di Environment tab.

### Alternatif yang dipertimbangkan (dan kenapa tidak)

| Opsi | Kenapa tidak |
| --- | --- |
| Tetap build di Dokploy/VPS | Justru masalah yang mau dihilangkan |
| Depot.dev / build server terpisah | Bayar/ops ekstra; GHA gratis sudah cukup di skala ini |
| Self-hosted GH runner | Kotak baru yang harus dirawat |
| Watchtower auto-pull | Kurang kontrol; Dokploy API trigger lebih eksplisit + terlihat di dashboard |

### Prasyarat owner (Bagian 1) — kode siap, tinggal isi akun/secret

- [ ] Aktifkan GHCR di repo (Packages), buat PAT `read:packages` → Dokploy → Settings → Registry.
- [ ] GH Secrets: `DOKPLOY_URL`, `DOKPLOY_API_KEY`, **`DOKPLOY_COMPOSE_ID`** (id service Compose),
      `SENTRY_AUTH_TOKEN` (Bagian 2, source maps web).
- [ ] GH Variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
      `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB` (samakan dgn Environment tab Dokploy).
- [ ] Push/rebuild image ke GHCR SEKALI sebelum Deploy pertama (CI push, atau `compose.build.yaml` lalu
      `docker push`) — compose base tak bisa build, jadi image harus sudah ada.

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

#### ✅ IMPLEMENTED (2026-07-11)

Semua `@sentry/*` di-pin `^10.65.0`. File:

- **web** (`@sentry/nextjs`): `instrumentation.ts` (`register` + `onRequestError`),
  `instrumentation-client.ts` (+ `onRouterTransitionStart`), `sentry.server.config.ts`,
  `sentry.edge.config.ts`, capture di `app/global-error.tsx`, wrap `next.config.ts`.
- **api + worker** (`@sentry/bun`): `apps/api/src/lib/sentry.ts` (`initSentry` + `captureException`);
  init di `server.ts` & `workers/index.ts`; capture di `lib/errors.ts` (hanya 5xx/unknown, tag
  `requestId`) & hook `failed` BullMQ (`{queue, jobId, attemptsMade}`); tag `process` via `AQSHA_PROCESS`.
- **agent** (`@sentry/node`): init di puncak `src/mastra/index.ts` + capture di boot-sweep `/deep`.

Deviasi/keputusan penting:

- **agent `@sentry/node` = ERROR-only** dgn `skipOpenTelemetrySetup:true` + `registerEsmLoaderHooks:false`
  + `defaultIntegrations:false` (hanya uncaught/unhandled/dedupe/linkedErrors). Alasan: Mastra yang
  memegang pipeline OTel (`MastraStorageExporter` + `LangfuseExporter`) — Sentry TAK boleh set global
  TracerProvider sendiri (bentrok + risiko bundle `mastra build`). `tracesSampleRate:0`.
- **`withSentryConfig` cuma membungkus saat Sentry configured** (`NEXT_PUBLIC_SENTRY_DSN` atau
  `SENTRY_AUTH_TOKEN` ada saat build) → jalur build web default (tanpa Sentry) byte-identik, aman Turbopack
  sampai owner opt-in.
- **Source-map auth token via BuildKit secret mount** (`--mount=type=secret,id=sentry_auth_token`),
  BUKAN build ARG → tak masuk layer image. Tanpa token = upload di-skip, build tetap sukses.
- Release Sentry = `SENTRY_RELEASE ?? GIT_COMMIT` (di-bake image). Env baru compose:
  `SENTRY_DSN_WEB/API/AGENT`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`.
- **Blocker "branch Langfuse" LENYAP**: branch `infrastructure` sudah punya Langfuse → Fase 3 nanti
  cukup menambah exporter OTLP ke array `exporters` yang sudah ada.

### Fase 2 — Logs ke Grafana Cloud (Loki) via Alloy — ⬜ BELUM

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

### Fase 3 — Traces agent + metrics host — ⬜ BELUM

1. **Agent traces**: di config `Observability` yang sudah ada (`apps/agent/src/mastra/index.ts`),
   tambah exporter OTLP (`@mastra/otel-exporter` / exporter OTel bawaan Mastra) menunjuk ke
   Alloy (`http://alloy:4318`) → Alloy `otelcol.receiver.otlp` → forward ke Grafana Tempo.
   Berdampingan dengan `MastraStorageExporter` + `LangfuseExporter` yang **sudah ada di branch
   `infrastructure`** (array `exporters` di `Observability` config) → tinggal tambah exporter ke-3.
   CATATAN: Sentry agent (Fase 1) sengaja `skipOpenTelemetrySetup` supaya OTel tetap dimiliki Mastra,
   jadi exporter OTLP ini aman ditambah. Hasil: trace per deepRun/chat-turn di Tempo, korelasi via traceId.
2. **Host + container metrics**: aktifkan di Alloy `prometheus.exporter.unix` (CPU/RAM/disk VPS)
   + `prometheus.exporter.cadvisor` (per-container) → `prometheus.remote_write` ke Mimir.
   Perhatikan budget 10k series free tier — cukup untuk 1 VPS + ~10 container.
3. **API traces**: DITUNDA — OTel SDK di Bun belum first-class; logs + Sentry (yang punya
   mini-tracing sendiri) sudah menutup kebutuhan debugging api. Re-evaluasi saat Bun OTel matang.

### Fase 4 — Uptime Kuma + status page — ⬜ BELUM

1. Service Dokploy terpisah (bukan di stack aqsha, supaya redeploy app tidak mematikan
   monitor): image `louislam/uptime-kuma:1`, volume data sendiri, join network stack aqsha
   (external network) supaya bisa cek `agent:4317` internal.
2. Monitor: `https://<domain>` (web), `https://api.<domain>/ping`, `https://assets.<domain>`
   (MinIO health), `http://agent:4317/...` (internal), URL Langfuse, + keyword check landing.
3. Notifikasi Telegram/Discord; opsional domain `status.<domain>` untuk status page publik.

### Urutan eksekusi & dependensi

```
✅ Bagian 1 CI/CD  ──── prasyarat source-maps & deploy cepat ────┐
                                                                ▼
✅ Fase 1 Sentry (web→api→worker→agent) → ⬜ Fase 2 Loki logs → ⬜ Fase 3 traces+metrics → ⬜ Fase 4 Kuma
```

Fase 4 (Kuma) sebenarnya independen — bisa dikerjakan kapan saja, paling cepat nilai/effort.

### Risiko & catatan

- **RAM VPS**: tambahan hanya Alloy (~150–300 MB) + Kuma (~100 MB). Tidak ada ClickHouse
  kedua — itu alasan menolak SigNoz/HyperDX self-host untuk sekarang.
- **Kuota Sentry 5k errors/bln**: pasang `sampleRate`/dedup bila ada error storm; alert
  kuota di Sentry.
- **NEXT_PUBLIC_* drift**: setelah pindah build ke CI, source of truth build args = GH
  Variables, runtime env tetap Dokploy. Dokumentasikan di DEPLOYMENT.md saat implementasi.
- **Branch Langfuse**: ✅ TERSELESAIKAN — exporter Langfuse SUDAH ada di branch `infrastructure`
  (HEAD `feat(observability): integrate Langfuse tracing`). Fase 3 cukup menambah exporter OTLP ke
  array `exporters` yang sama.
- **Redaction**: pino sudah redact token/password; pastikan Alloy tidak menambah label dari
  isi log (hanya metadata container).

### Prasyarat owner (Bagian 2)

- [ ] **Fase 1 (kode siap)**: buat akun Sentry (free) + 3 project (`aqsha-web`/`api`/`agent`) → isi
      `SENTRY_DSN_WEB/API/AGENT` di Dokploy + `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_ORG`/`SENTRY_PROJECT_WEB`
      (GH Variables) + `SENTRY_AUTH_TOKEN` (GH Secret). Lalu uji lempar error per runtime.
- [ ] Fase 2/3: buat akun Grafana Cloud (free) → salin Loki/Tempo/Prometheus endpoint + API token.
- [ ] Fase 4: putuskan domain `status.<domain>` (opsional).
