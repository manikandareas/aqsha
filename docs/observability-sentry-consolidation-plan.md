# Plan Konsolidasi Observability: Sentry-first + Langfuse On-demand

> Status: repo-side implemented (2026-07-13) — Fase 1 (hardening + Sentry Logs + cron) & Fase 4A–4C
> (legacy removal: OTLP code/deps, Alloy service, `infra/alloy/`, `infra/compose.uptime.yaml`, env
> template) & Fase 5 (docs) SELESAI di branch `development`. Yang MASIH owner/ops (tak bisa lewat
> code): Fase 0 baseline, Fase 2 setup Sentry Uptime dashboard, Fase 3 cutover env Infisical/Dokploy +
> soak, Fase 4D teardown Grafana/Kuma eksternal. Lihat "Sisa aksi owner" di akhir dokumen.
>
> Disusun: 13 Juli 2026
>
> Cakupan: production dan staging Aqsha (`web`, `api`, `worker`, `agent`, Postgres, Redis, MinIO),
> konfigurasi CI/Dokploy/Infisical, penghapusan Grafana Alloy + Uptime Kuma, serta pembersihan env dan
> dependency yang tidak lagi dipakai.
>
> Dokumen ini adalah plan implementasi. Belum ada perubahan runtime production yang dilakukan oleh
> dokumen ini.

## 1. Keputusan

Aqsha akan memakai model operasional berikut:

1. **Sentry menjadi console observability harian** untuk error tracking seluruh runtime, release dan
   source map, structured application logs yang dipilih, alert, serta uptime endpoint publik.
2. **Langfuse tetap dipertahankan sebagai tool spesialis** untuk trace, token, cost, dan evaluasi
   Astra/`/deep`. Langfuse bukan inbox incident harian dan tidak menggandakan alert aplikasi.
3. **MastraStorageExporter tetap dipertahankan** sebagai trace internal Mastra yang tersimpan di
   Postgres dan berguna untuk inspeksi lokal/Studio.
4. **Grafana Cloud, Grafana Alloy, Loki, Mimir, dan Tempo dikeluarkan dari arsitektur Aqsha** setelah
   Sentry lolos soak period. Seluruh code, dependency, Compose service, volume, env, secret, token,
   dan dokumentasi spesifik Grafana/OTLP akan dihapus.
5. **Uptime Kuma dikeluarkan dari arsitektur Aqsha** setelah Sentry Uptime aktif dan tervalidasi.
   Service Dokploy, volume, domain, notification integration, file Compose, dan dokumentasinya turut
   dibersihkan.
6. **PostHog tidak ditambahkan dalam migrasi ini.** Menambahkan platform baru hanya memindahkan
   kompleksitas dan membuang wiring Sentry yang sudah aktif. PostHog baru dievaluasi lagi jika Aqsha
   benar-benar membutuhkan product analytics, feature flags, funnel, atau session replay sebagai
   kebutuhan produk tersendiri.

Target operasionalnya bukan memaksa semua telemetry masuk satu vendor dengan fidelity yang sama.
Targetnya adalah **satu tempat yang perlu dibuka untuk incident sehari-hari: Sentry**, dengan
Langfuse hanya dibuka saat menganalisis perilaku atau biaya agent.

## 2. Alasan dan trade-off yang diterima

Sentry saat ini sudah mempunyai error monitoring, structured logs, tracing, application metrics,
uptime monitoring, cron monitoring, release tracking, dan source-map symbolication. Referensi resmi:

- <https://docs.sentry.io/product/explore/logs/>
- <https://docs.sentry.io/product/uptime-monitoring/>
- <https://sentry.io/pricing/>

Konsolidasi ini menerima trade-off berikut:

- Riwayat CPU/RAM/disk dan per-container metrics dari node exporter/cAdvisor tidak lagi disimpan di
  Grafana Cloud.
- Raw stdout seluruh stock container (Postgres, Redis, MinIO) tidak dikirim ke Sentry. Log tersebut
  tetap dapat dibaca sementara melalui `docker logs`/Dokploy ketika diperlukan.
- Sentry hanya menerima application logs bernilai diagnostik; access log volume tinggi tidak boleh
  dikirim tanpa sampling.
- Trace LLM tidak dipindah ke Sentry. Mastra tetap menjadi pemilik pipeline observability agent,
  dengan `MastraStorageExporter` dan `LangfuseExporter`.
- Health host dasar tetap harus ditutup oleh alert bawaan VPS provider/Dokploy bila tersedia,
  khususnya disk, RAM, dan container restart. Alert tersebut tidak dianggap dashboard kedua dan
  harus diarahkan ke notification channel yang sama.

Jika kebutuhan host/container forensics menjadi sering, atau raw log terpusat terbukti dibutuhkan,
Grafana boleh dievaluasi kembali berdasarkan data incident; bukan diaktifkan terus hanya karena
sudah pernah dikonfigurasi.

## 3. Audit kondisi saat ini

### 3.1 Sentry yang dipertahankan

- `apps/web` memakai `@sentry/nextjs`, client/server/edge instrumentation, `global-error.tsx`, tunnel,
  dan upload source map saat build CI.
- `apps/api` dan `worker` memakai bootstrap bersama `apps/api/src/lib/sentry.ts` dengan
  `@sentry/bun`; `process=api|worker` membedakan dua proses dalam satu project.
- Worker hanya membuat incident untuk failure terminal setelah retry habis.
- `apps/agent` memakai `@sentry/node` untuk uncaught/unhandled dan explicit capture, tetapi sengaja
  tidak mengambil alih global OpenTelemetry milik Mastra.
- `GIT_COMMIT`/`SENTRY_RELEASE` sudah dibake ke image sehingga event terikat ke release.

### 3.2 Langfuse dan Mastra storage yang dipertahankan

- `@mastra/langfuse` dan `LangfuseExporter` tetap ada.
- Profile self-hosted Langfuse di `infra/compose.dev.yaml` tetap ada.
- Seluruh `LANGFUSE_*` di `.env.example`, `apps/agent/.env.example`, `infra/.env.example`, Infisical,
  dan dokumentasi tetap ada selama masih relevan.
- `AQSHA_OBSERVABILITY` tetap ada karena masih menjadi kill-switch Mastra storage + Langfuse.

### 3.3 Legacy Grafana/OTLP yang akan dihapus

- `infra/alloy/config.alloy`.
- Service `alloy`, privileged mode, host mounts, port `4318`, dan volume `alloy_data` di
  `compose.yaml`.
- `OtelExporter` dan branch `AQSHA_OTLP_TRACES_ENDPOINT` di
  `apps/agent/src/mastra/index.ts`.
- Dependency `@mastra/otel-exporter` dan `@opentelemetry/exporter-trace-otlp-proto` di
  `apps/agent/package.json`, beserta entry transitive yang tidak lagi direferensikan di `bun.lock`.
- `COMPOSE_PROFILES=observability`, seluruh `GRAFANA_CLOUD_*`, dan
  `AQSHA_OTLP_TRACES_ENDPOINT` dari template env, Dokploy, Infisical, dan docs.
- Dashboard, alert rule, access-policy token, Loki/Tempo/Mimir stack, dan credential Grafana Cloud.

### 3.4 Legacy Uptime Kuma yang akan dihapus

- `infra/compose.uptime.yaml`.
- Service Dokploy `aqsha-uptime`/Uptime Kuma.
- Volume `uptime_kuma_data` setelah cooldown dan backup terakhir.
- Domain `status.<domain>`/`uptime.<domain>`, route Dokploy, DNS record, dan TLS configuration bila
  memang pernah dibuat.
- Notification integration dan credential/token khusus Kuma yang tidak dipakai di tempat lain.
- Seluruh instruksi Uptime Kuma di `DEPLOYMENT.md` dan docs observability.

## 4. Target architecture

```text
Browser / Next.js ───────────────┐
API Elysia / BullMQ worker ──────┼── errors + selected logs + low-rate traces ──► Sentry
Mastra agent runtime errors ─────┘                                           │
                                                                            ├─ alerts
Public web + API readiness ─────────────── uptime checks ────────────────────┘

Mastra spans ──┬──► MastraStorageExporter ──► Postgres / Mastra Studio
               └──► LangfuseExporter ───────► Langfuse: token, cost, trace, eval

Container stdout ──► Docker/Dokploy logs only (short-lived operational fallback)
Host disk/RAM ─────► VPS provider/Dokploy threshold alert, bila tersedia
```

### 4.1 Ownership per signal

| Sinyal | Owner setelah migrasi | Catatan |
| --- | --- | --- |
| Browser/Next error | Sentry | Source map wajib berhasil di CI |
| API 5xx/unhandled | Sentry | `requestId`, route, release, environment |
| BullMQ terminal failure | Sentry | Queue, job ID, attempts; bukan setiap retry |
| Agent uncaught/explicit error | Sentry | Tetap error-only agar tidak berebut OTel Mastra |
| Application logs | Sentry | Selected logs; stdout tetap ada |
| Web/API uptime | Sentry Uptime | Monitor production dan staging dipisahkan environment/name |
| Scheduled feed hydration | Sentry Cron/check-in atau explicit failure event | Implement hanya bila cron monitor benar-benar diperlukan |
| LLM spans/token/cost/eval | Langfuse | Tidak diduplikasi ke Sentry tracing |
| Mastra internal trace | Mastra storage | Tetap aktif kecuali kill-switch off |
| Host/container resource | Provider/Dokploy alert | Tidak ada dashboard time-series setelah Grafana dihapus |

## 5. Policy telemetry dan data

### 5.1 Structured logs ke Sentry

Jangan langsung mengirim seluruh stdout ke Sentry. Implementasi mengikuti policy berikut:

- `error`: selalu kirim, tetapi hindari membuat log dan exception event identik dua kali tanpa nilai
  tambah. Exception tetap menjadi primitive incident utama.
- `warn`: kirim untuk keadaan actionable seperti provider degradation, retry mendekati habis,
  billing inconsistency, dan dependency health failure.
- `info`: allowlist event lifecycle bernilai tinggi saja, misalnya `api_started`, `workers_started`,
  `deep_run_started/completed`, dan perubahan status billing penting.
- Access log per-request `{method,path,status,ms}` tetap stdout pada tahap awal. Jika kelak diperlukan
  di Sentry, hanya request lambat, 5xx, atau sampel kecil yang dikirim.
- `debug`: tidak pernah dikirim di production.
- Browser `console.*` tidak diforward massal ke Sentry.

Semua log Sentry wajib memakai field low-cardinality dan redaction yang sama dengan Pino:

- boleh: `service`, `process`, `environment`, `release`, `requestId`, `queue`, `jobId`, `status`,
  `durationMs`, `deepRunId`, `threadId` bila memang diperlukan untuk korelasi;
- dilarang: authorization header, cookie, Clerk token, API key, password, full prompt/output, body
  request mentah, email, isi dokumen, dan signed URL;
- `requestId`, `jobId`, `threadId`, dan `deepRunId` jangan dijadikan metric dimension ber-cardinality
  tinggi; gunakan sebagai searchable attributes/log context.

### 5.2 Sampling dan budget

- Web browser tracing mulai dari `0`; aktifkan hanya setelah error/log stabil dan ada use case nyata.
- Server tracing mulai dari nilai rendah, maksimum awal `0.01` atau tetap `0` bila belum dibutuhkan.
- Agent Sentry tetap `tracesSampleRate: 0`; trace agent dimiliki Langfuse/Mastra.
- Pasang spend/quota notification di Sentry sebelum structured logs diaktifkan production.
- Ukur ingest staging selama minimal 24 jam dan proyeksikan ke volume production sebelum menaikkan
  coverage log.
- Bila quota log mendekati 70%, kurangi `info`, sampling access log, lalu `warn` non-actionable;
  jangan mengorbankan error event terminal.

## 6. Rencana implementasi bertahap

### Fase 0 — Baseline dan bukti live

Tujuan: tidak mematikan telemetry lama sebelum penggantinya terbukti.

1. Catat baseline 7 hari terakhir bila datanya tersedia:
   - jumlah error Sentry per project/environment;
   - volume log Grafana dan alert yang pernah benar-benar firing;
   - dashboard/metric Grafana yang benar-benar pernah dipakai;
   - monitor Kuma yang aktif dan notification channel-nya;
   - jumlah trace/cost Langfuse.
2. Verifikasi tiga project Sentry (`web`, `api`, `agent`) menerima event production dengan
   `environment=production` dan release commit yang benar.
3. Verifikasi source map production symbolicate stack web.
4. Verifikasi API dan worker terpisah oleh tag `process`.
5. Export/screenshot konfigurasi Grafana dashboard/alert dan backup volume Kuma sebelum shutdown.
6. Catat image tag production terakhir sebelum migrasi untuk rollback.

Gate fase:

- jangan lanjut bila salah satu runtime belum mengirim error ke Sentry;
- jangan lanjut bila source map web belum benar;
- jangan hapus token/volume eksternal pada fase ini.

### Fase 1 — Hardening Sentry sebagai primary console

#### 1A. Normalisasi bootstrap

1. Buat helper parsing sample rate yang sama untuk web server/edge, API/worker, dan agent agar nilai
   invalid, `NaN`, negatif, atau `>1` tidak lolos.
2. Pertahankan no-op saat DSN kosong untuk local development dan test.
3. Pastikan `environment`, `release`, dan tag `service/process` konsisten.
4. Pertahankan filter `AppError` 4xx agar expected product behavior tidak menjadi incident.
5. Tambahkan unit test untuk gating DSN, sample rate, expected error filtering, dan context redaction.

#### 1B. Structured application logs

1. Aktifkan Sentry Logs hanya pada runtime yang DSN-nya tersedia.
2. Untuk API/worker, pertahankan `apps/api/src/lib/log.ts` sebagai facade tunggal dan stdout Pino
   sebagai sink utama. Tambahkan sink/bridge Sentry di balik facade tersebut atau gunakan integrasi
   resmi Pino bila terverifikasi kompatibel dengan `@sentry/bun` versi repo.
3. Jangan memperkenalkan Pino transport worker-thread yang tidak teruji di Bun.
4. Untuk agent, jangan mengaktifkan default Sentry OTel/ESM loader. Kirim selected operational logs
   melalui helper eksplisit di catch/lifecycle penting; trace tetap di Langfuse/Mastra.
5. Untuk web, pertahankan capture error client/server/edge; jangan mengaktifkan bulk console capture.
6. Tambahkan test bahwa secret dan PII tidak masuk payload log.

Artefak yang kemungkinan disentuh:

- `apps/api/src/lib/sentry.ts`
- `apps/api/src/lib/log.ts`
- `apps/api/src/plugins/observability.ts`
- `apps/api/src/workers/index.ts`
- `apps/web/instrumentation-client.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`
- `apps/agent/src/mastra/index.ts`
- test baru di package runtime terkait

#### 1C. Alert dan dashboard minimum

Buat hanya alert yang actionable:

- new regression/unhandled error production;
- error spike per project;
- BullMQ terminal failures;
- readiness endpoint down;
- quota/spend mencapai 70% dan 90%.

Dashboard Sentry minimum:

- errors per service/process;
- top regression per release;
- terminal worker failures per queue;
- selected warning/error logs;
- uptime production.

Semua alert masuk satu notification channel. Hindari membuat rule identik di Langfuse.

### Fase 2 — Migrasi uptime dari Kuma ke Sentry

1. Gunakan endpoint yang sudah ada:
   - `https://aqshara.com` untuk web availability;
   - `https://api.aqshara.com/health/ready` untuk API + Postgres + Redis + object storage.
2. Jangan memakai `/ping` sebagai readiness utama karena endpoint itu sengaja tidak mengecek
   dependency.
3. Mulai dengan dua monitor production. Jika hanya satu monitor yang tersedia dalam plan Sentry,
   prioritaskan `/health/ready` dan buat keputusan budget eksplisit untuk monitor web tambahan.
4. Staging memakai monitor terpisah dengan notification severity lebih rendah agar tidak mengganggu
   on-call production.
5. Agent internal tidak perlu diekspos hanya demi uptime check. Deteksi dilakukan melalui:
   - restart policy/container state di Dokploy;
   - error dari proxy web ke agent;
   - boot/unhandled error Sentry;
   - absence of expected LLM traces ditinjau di Langfuse bila ada laporan produk.
6. Jika feed hydration harus dipantau berdasarkan jadwal, tambahkan Sentry Cron/check-in pada job
   repeatable `feed-hydration-cycle`; failure terminal tetap menghasilkan exception biasa.
7. Jalankan Sentry Uptime paralel dengan Kuma minimal 7 hari. Bandingkan false positive, latency,
   dan notification delivery.

Gate fase:

- Sentry mendeteksi controlled outage staging dan recovery;
- `/health/ready` benar-benar gagal saat DB/Redis/MinIO staging tidak siap;
- notification sampai ke channel tujuan;
- tidak ada kebutuhan Kuma-only yang belum mempunyai pengganti.

### Fase 3 — Cutover dan soak period

Urutan perubahan external state:

1. Hentikan pengiriman trace agent ke Alloy dengan menghapus
   `AQSHA_OTLP_TRACES_ENDPOINT` dari Infisical `/app` pada `staging`, lalu restart agent staging.
2. Hapus `COMPOSE_PROFILES=observability` dari Dokploy staging dan redeploy; pastikan Alloy berhenti
   tetapi app tetap sehat.
3. Setelah staging stabil, ulangi urutan yang sama di production.
4. Stop service Uptime Kuma, tetapi jangan delete service/volume dahulu.
5. Jalankan soak period production 7–14 hari dengan Sentry sebagai primary console.
6. Selama soak, Grafana token, dashboard, dan Kuma volume tetap ada hanya untuk rollback; tidak ada
   perubahan baru yang dibuat di platform legacy.

Gate fase:

- web, API, worker, agent sehat setelah Alloy tidak berjalan;
- tidak ada `ECONNREFUSED alloy:4318` di agent;
- Sentry error, selected logs, alert, dan uptime berfungsi;
- Langfuse masih menerima trace/cost;
- `docker compose ps` tidak menampilkan Alloy dan tidak ada container crash-loop.

### Fase 4 — Hapus legacy code, dependency, Compose, dan env

Fase ini wajib dilakukan; mematikan profile saja tidak cukup.

#### 4A. Code dan dependency

1. Hapus import `OtelExporter`, `otlpTracesEndpoint`, branch exporter OTLP, serta komentar
   Loki/Tempo/Alloy dari `apps/agent/src/mastra/index.ts`.
2. Hapus dependency berikut dari `apps/agent/package.json`:
   - `@mastra/otel-exporter`;
   - `@opentelemetry/exporter-trace-otlp-proto`.
3. Jalankan `bun install` agar `bun.lock` membuang dependency transitive yang sudah orphan.
4. Pastikan exporter agent tersisa tepat:
   - `MastraStorageExporter` selalu saat observability aktif;
   - `LangfuseExporter` hanya saat key lengkap tersedia.

#### 4B. Compose dan file infra

1. Hapus seluruh service `alloy` dari `compose.yaml`.
2. Hapus volume `alloy_data` dari `compose.yaml`.
3. Perbarui komentar Compose yang masih menyebut stock image Alloy, Grafana env, atau
   `AQSHA_OTLP_TRACES_ENDPOINT`.
4. Delete `infra/alloy/config.alloy` dan direktori `infra/alloy/` bila kosong.
5. Delete `infra/compose.uptime.yaml`.
6. Validasi base Compose dan profile migration tetap benar setelah profile observability hilang.

#### 4C. Env dan secret cleanup

Hapus dari root `.env.example`:

- `COMPOSE_PROFILES=observability`;
- `GRAFANA_CLOUD_API_TOKEN`;
- `GRAFANA_CLOUD_LOKI_URL`;
- `GRAFANA_CLOUD_LOKI_USER`;
- `GRAFANA_CLOUD_PROM_URL`;
- `GRAFANA_CLOUD_PROM_USER`;
- `GRAFANA_CLOUD_TEMPO_URL`;
- `GRAFANA_CLOUD_TEMPO_USER`;
- `AQSHA_OTLP_TRACES_ENDPOINT`.

Hapus dari Infisical `/app` untuk `prod`, `staging`, dan `dev` bila ada:

- `AQSHA_OTLP_TRACES_ENDPOINT`.

Hapus dari Dokploy Environment untuk stack prod dan staging:

- `COMPOSE_PROFILES` bila nilainya hanya `observability`;
- seluruh `GRAFANA_CLOUD_*` di atas.

Jika `COMPOSE_PROFILES` juga memuat profile lain, hapus hanya token `observability`; jangan menghapus
profile lain secara membabi buta. Profile migration tetap dijalankan eksplisit dengan
`docker compose --profile migrate ...` dan tidak membutuhkan env permanen.

Env berikut **wajib dipertahankan**:

- build Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`,
  `SENTRY_AUTH_TOKEN` di Infisical `/build`;
- runtime Sentry: `SENTRY_DSN_WEB`, `SENTRY_DSN_API`, `SENTRY_DSN_AGENT`,
  `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` di Infisical `/app`;
- release: `GIT_COMMIT` dan `SENTRY_RELEASE` yang dibake Dockerfile;
- Langfuse: seluruh `LANGFUSE_*` yang masih digunakan;
- `AQSHA_OBSERVABILITY`, karena masih mengontrol Mastra storage + Langfuse;
- `LOG_LEVEL`, karena masih mengontrol stdout Pino.

Tidak ada GitHub Actions secret lama yang perlu dihapus untuk Grafana/Kuma. Jangan menghapus
Sentry build vars dari Infisical `/build`; workflow CI masih memerlukannya untuk client DSN dan
source-map upload.

#### 4D. External platform teardown

Setelah soak period selesai:

1. Revoke Grafana Cloud Access Policy token terlebih dahulu.
2. Hapus dashboard/alert/stack Grafana atau tutup akun bila tidak dipakai project lain.
3. Delete service Uptime Kuma dari Dokploy.
4. Backup terakhir lalu delete `uptime_kuma_data` hanya setelah rollback window berakhir.
5. Hapus domain, DNS record, dan TLS route Kuma bila pernah dibuat.
6. Hapus notification webhook/token Kuma hanya bila tidak dipakai service lain.
7. Hapus volume Alloy lokal setelah memastikan tidak ada kebutuhan queue/buffer rollback.

### Fase 5 — Dokumentasi dan runbook cleanup

1. Rewrite `docs/observability-cicd-runbook.md` agar hanya memuat:
   - CI/CD;
   - Sentry activation, logs, alerts, uptime, dan troubleshooting;
   - Langfuse on-demand;
   - rollback dan quota management.
2. Tandai `docs/observability-cicd-plan.md` sebagai superseded oleh dokumen ini, atau delete setelah
   seluruh keputusan historis yang masih berguna dipindahkan. Jangan membiarkan instruksi Alloy/Kuma
   terlihat sebagai target aktif.
3. Update `DEPLOYMENT.md`: hapus Grafana Cloud dan Uptime Kuma; ganti bagian uptime dengan Sentry.
4. Update `docs/infisical-secrets-strategy.md`: Dokploy tidak lagi membutuhkan
   `COMPOSE_PROFILES/GRAFANA_CLOUD_*`; perbaiki estimasi jumlah env.
5. Update `.env.example` header: stock images hanya Postgres/Redis/MinIO, bukan Alloy.
6. Update `AGENTS.md` hanya jika policy Sentry logs atau Langfuse berubah. Instruksi Langfuse yang
   tetap benar jangan dihapus.
7. Jalankan pencarian repo untuk memastikan tidak ada referensi aktif yang tertinggal.

## 7. Matriks perubahan file

| File/path | Aksi | Hasil akhir |
| --- | --- | --- |
| `apps/agent/src/mastra/index.ts` | edit | Tidak ada OTLP/Alloy; Sentry error-only + Mastra storage + Langfuse |
| `apps/agent/package.json` | edit | Hapus dua dependency OTLP |
| `bun.lock` | regenerate | Tidak ada dependency OTLP orphan |
| `apps/api/src/lib/sentry.ts` | edit | Sentry logging/sample-rate hardening |
| `apps/api/src/lib/log.ts` | edit | Pino stdout + selected Sentry log bridge |
| `apps/web/instrumentation-client.ts` | edit seperlunya | Error capture tetap; tidak bulk-log console |
| `apps/web/sentry.server.config.ts` | edit seperlunya | Config konsisten dan bounded |
| `apps/web/sentry.edge.config.ts` | edit seperlunya | Config konsisten dan bounded |
| `compose.yaml` | edit | Hapus Alloy service, mounts, port, volume, komentar |
| `infra/alloy/config.alloy` | delete | Tidak ada collector Grafana |
| `infra/compose.uptime.yaml` | delete | Tidak ada Compose Kuma |
| `.env.example` | edit | Hapus Grafana/profile/OTLP env; pertahankan Sentry/Langfuse |
| `apps/agent/.env.example` | review | Pertahankan Langfuse; pastikan tidak ada OTLP legacy |
| `infra/.env.example` | review | Pertahankan self-host Langfuse |
| `.github/workflows/deploy.yml` | review | Sentry build/source-map config tetap |
| `DEPLOYMENT.md` | rewrite bagian observability | Sentry-first + Langfuse on-demand |
| `docs/observability-cicd-runbook.md` | rewrite | Runbook baru tanpa Grafana/Kuma |
| `docs/observability-cicd-plan.md` | supersede/delete | Tidak menjadi instruksi aktif |
| `docs/infisical-secrets-strategy.md` | edit | Hapus env Grafana/observability profile |

## 8. Verifikasi teknis

### 8.1 Static verification

Setelah implementasi, seluruh command berikut harus tidak menghasilkan reference aktif:

```bash
rg -n "GRAFANA_CLOUD|AQSHA_OTLP_TRACES_ENDPOINT|grafana/alloy|infra/alloy|OtelExporter" .
rg -n "compose\.uptime|uptime_kuma|Uptime Kuma" .
rg -n '"@mastra/otel-exporter"|"@opentelemetry/exporter-trace-otlp-proto"' apps/agent/package.json bun.lock
```

Pengecualian hanya boleh berupa catatan historis eksplisit yang diberi label `superseded`; target
akhir yang lebih bersih adalah nol hasil di dokumentasi aktif.

Pastikan reference yang harus tetap ada masih ditemukan:

```bash
rg -n "SENTRY_|NEXT_PUBLIC_SENTRY|@sentry/" apps .github .env.example compose.yaml
rg -n "LANGFUSE_|@mastra/langfuse|LangfuseExporter|AQSHA_OBSERVABILITY" apps infra .env.example AGENTS.md DEPLOYMENT.md
```

### 8.2 Repository verification

Gunakan Bun yang dipin repo:

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run build
docker compose config
docker compose --profile migrate config
```

Selain itu:

- test no-op tanpa DSN;
- test redaction dan log severity allowlist;
- test worker retry intermediate tidak membuat incident;
- test terminal worker failure membuat satu incident;
- test `/health/ready` sukses dan dependency failure menghasilkan non-2xx;
- test source map upload dari staging build;
- test Langfuse masih menerima satu chat dan satu `/deep` trace setelah OTLP dihapus.

### 8.3 Staging smoke test

1. Trigger controlled frontend error dan pastikan stack symbolicated.
2. Trigger controlled API 5xx dan korelasikan dengan `requestId` log.
3. Trigger terminal BullMQ failure fixture dan pastikan hanya satu incident.
4. Stop Redis/MinIO staging bergantian dan pastikan `/health/ready` + Sentry Uptime gagal lalu recover.
5. Jalankan chat dan `/deep`; verifikasi error masuk Sentry dan trace/cost masuk Langfuse tanpa trace
   Tempo.
6. Pastikan tidak ada outbound request ke endpoint Grafana/Alloy.

### 8.4 Production acceptance

- Semua runtime menghasilkan event Sentry dengan `environment=production` dan release benar.
- Selected logs searchable berdasarkan `service`, `process`, `requestId`, dan queue context.
- Sentry alert dan uptime notification terkirim serta recovery notification bekerja.
- Langfuse cost > 0 untuk model yang harga custom-nya sudah didaftarkan.
- Tidak ada container Alloy/Kuma aktif.
- Tidak ada env Grafana/OTLP tersisa di Dokploy atau Infisical.
- Tidak ada token Grafana/Kuma aktif yang orphan.
- VPS tidak mengalami regresi CPU/RAM setelah removal.

## 9. Rollback

Rollback harus mempertahankan urutan dan tidak menghidupkan dua pipeline secara tidak sengaja.

1. Selama soak period, jangan revoke token Grafana dan jangan delete volume Kuma.
2. Jika Sentry logs/uptime gagal memenuhi kebutuhan:
   - rollback ke image tag sebelum konsolidasi;
   - revert commit removal Compose/config;
   - restore `GRAFANA_CLOUD_*`, `COMPOSE_PROFILES=observability`, dan
     `AQSHA_OTLP_TRACES_ENDPOINT` dari secret backup;
   - start kembali Kuma dari volume lama.
3. Jika hanya quota Sentry logs bermasalah, matikan bridge log atau kurangi severity tanpa
   mematikan error tracking.
4. Jika Langfuse bermasalah, kosongkan key atau gunakan `AQSHA_OBSERVABILITY=off` hanya sebagai
   emergency kill-switch; pahami bahwa switch tersebut juga mematikan Mastra storage exporter.
5. Setelah token Grafana direvoke dan volume Kuma dihapus, rollback membutuhkan provisioning ulang;
   karena itu destructive teardown baru dilakukan setelah acceptance dan rollback window selesai.

## 10. Definition of done

Migrasi dianggap selesai hanya bila seluruh kondisi berikut terpenuhi:

- Sentry menjadi satu-satunya console incident/uptime harian.
- Langfuse tetap menerima trace/token/cost tetapi tidak menjadi inbox alert aplikasi.
- Grafana Alloy dan Uptime Kuma tidak berjalan di prod maupun staging.
- File `infra/alloy/config.alloy` dan `infra/compose.uptime.yaml` sudah dihapus.
- Service/volume/config Alloy sudah hilang dari `compose.yaml`.
- Dependency OTLP agent dan entry lockfile-nya sudah hilang.
- Seluruh env Grafana/OTLP/profile observability sudah dibersihkan dari template, Dokploy, dan
  Infisical.
- Sentry dan Langfuse env yang masih diperlukan tetap utuh.
- Dokumen deployment/secret/observability tidak memberikan instruksi legacy.
- Lint, typecheck, tests, build, dan Compose validation hijau.
- Staging soak dan production soak selesai tanpa kehilangan incident penting.
- Token, dashboard, service, domain, DNS, dan volume external legacy sudah ditutup setelah rollback
  window.

## 11. Urutan PR yang disarankan

Untuk menjaga rollback dan review tetap jelas:

1. **PR 1 — Sentry primary readiness**
   - hardening config, selected structured logs, tests, dashboard/alert/uptime runbook;
   - belum menghapus Alloy/Kuma.
2. **PR 2 — staging/prod cutover configuration**
   - perubahan external state bertahap, soak, dan bukti hasil;
   - code legacy masih tersedia untuk rollback cepat.
3. **PR 3 — legacy removal**
   - hapus OTLP code/dependency, Alloy/Kuma files/Compose/env, regenerate lockfile;
   - update seluruh docs dan template.
4. **Ops closeout — destructive cleanup**
   - revoke token Grafana, delete Kuma/Alloy volume, domain/DNS, dan platform legacy setelah rollback
     window berakhir.

Setiap PR harus menyertakan bukti command verifikasi dan daftar external-state action yang sudah atau
belum dilakukan. Jangan mencampur destructive platform teardown ke PR code sebelum soak selesai.
