# Next steps — staging & konsolidasi observability

> Disusun: 13 Juli 2026. Checklist operasional lanjutan setelah staging live (commit `06b4f8a`)
> dan konsolidasi Sentry-first ter-commit di `development` (commit `99e98b8`).
> Detail teknis: `DEPLOYMENT.md` → Staging, `docs/observability-sentry-consolidation-plan.md`.

## Konteks

- Alur branch: `feat-*` → `development` (integrasi + test lokal, **tanpa deploy**) → `staging`
  (auto-deploy staging.aqshara.com) → `main` (auto-deploy aqshara.com).
- Stack staging sudah live: pipeline hijau, DB ter-migrate, CORS MinIO terverifikasi,
  user `vitoandareas15@gmail.com` = admin (baris `users` + `user_onboarding` di-copy dari DB dev).
- Konsolidasi observability (Sentry-first, hapus Alloy/Grafana/Kuma) baru ada di `development` —
  belum ter-deploy ke staging/prod.

## A. Finalisasi staging (sekarang)

- [ ] Webhook Clerk **development instance** → `https://api.staging.aqshara.com/webhooks/clerk`;
      signing secret masuk Infisical `/app` staging (`CLERK_WEBHOOK_SIGNING_SECRET`) → restart api.
- [ ] Webhook Mayar **sandbox** → `https://api.staging.aqshara.com/webhooks/mayar/<MAYAR_WEBHOOK_SECRET>`.
- [ ] Smoke test E2E: sign-in → chat Astra (streaming) → upload file (presigned `assets.staging`).

> Catatan: user yang SUDAH ada di Clerk dev instance tidak memicu `user.created` di staging →
> profil kosong + stuck onboarding. Fix: copy baris `users` + `user_onboarding` dari DB dev
> (Clerk instance-nya sama). User baru (sign-up langsung di staging) normal.

## B. Promote observability ke staging + soak

- [ ] Merge `development` → `staging`, push → staging dapat image Sentry log bridge, tanpa OTLP.
- [ ] Smoke test observability di staging (plan §8.3):
  - [ ] Error frontend terkontrol → stack symbolicated di Sentry.
  - [ ] API 5xx terkontrol → korelasi `requestId` di Sentry Logs.
  - [ ] Failure BullMQ terminal → tepat satu incident.
  - [ ] Chat + `/deep` → error ke Sentry, trace/token/cost ke Langfuse, TANPA trace Tempo.
  - [ ] Tidak ada outbound request ke endpoint Grafana/Alloy.
- [ ] **Fase 2 — Sentry Uptime**: monitor `https://aqshara.com`, `https://api.aqshara.com/ping`,
      `https://assets.aqshara.com/minio/health/live` (+ staging bila mau) + notification channel.
      Validasi: matikan satu service staging → alert fire + recovery.

## C. Cutover prod (SETELAH staging soak lolos)

- [ ] Merge `staging` → `main`, push → prod deploy.
- [ ] **Dokploy env tab prod — hapus**: `COMPOSE_PROFILES=observability` + 7 var `GRAFANA_CLOUD_*`
      (`API_TOKEN`, `LOKI_URL/USER`, `PROM_URL/USER`, `TEMPO_URL/USER`).
- [ ] **Infisical `/app` prod — hapus**: `AQSHA_OTLP_TRACES_ENDPOINT`.
      **Jangan sentuh**: `SENTRY_DSN_*`, `SENTRY_ENVIRONMENT`, `LANGFUSE_*`, `AQSHA_OBSERVABILITY`.
- [ ] ⚠️ Setelah redeploy, container `alloy` lama tersisa sebagai **orphan** (compose `up -d`
      tidak menghapus service yang hilang dari file). Di host:
      `docker rm -f aqsha-alloy-1` (atau sekali jalan `docker compose up -d --remove-orphans`).
- [ ] Soak period prod: pantau Sentry beberapa hari; **jangan** revoke token Grafana /
      hapus volume Kuma dulu (satu-satunya jalur rollback — plan §9).

## D. Teardown eksternal (destructive — paling akhir, setelah soak window selesai)

- [ ] Dokploy: delete service `aqsha-uptime` (Kuma) + volume `uptime_kuma_data` + domain/DNS `status.*`.
- [ ] Grafana Cloud: revoke access-policy token, hapus/arsipkan stack 1720126.
- [ ] Host: hapus volume `aqsha_alloy_data`.
- [ ] Acceptance akhir per plan §8.4 (event Sentry per runtime dengan environment benar,
      selected logs searchable, alert + uptime + recovery jalan, tidak ada env/token legacy orphan).

## Urutan penting

**B dulu → soak → C → D.** Fase D destructive; selama soak, infra legacy adalah rollback plan.
