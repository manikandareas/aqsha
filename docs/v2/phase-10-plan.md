# Fase 10 — Aggressive Cutover (runbook eksekusi)

Runbook operasional untuk flip produksi V2 dan decommission V1 Convex. Spec asal ada di
`06-implementation-phases.md:259–327`; dokumen ini adalah **checklist yang dijalankan** plus
koreksi terhadap drift kode sejak spec ditulis.

## Koreksi vs spec 06 (penting)

Spec 06 ditulis sebelum beberapa keputusan Fase 6–9. Realita kode + keputusan owner saat cutover:

- **Tidak ada Aqsha MCP server / `POST /mcp`.** Fase 6 memilih eve tools **in-process**
  (`defineTool`), bukan MCP bridge. api-v2 hanya melayani REST + `/webhooks/*` + bull-board.
  Abaikan semua penyebutan "Aqsha MCP server" dan "surface auth ke-4" di spec 06.
- **Storage = MinIO** (S3-compatible self-host di compose), bukan R2 cloud. Env pakai prefix
  `S3_*` generik. Kolom DB masih bernama `*_r2_key` (kosmetik, jangan diutak-atik).
- **Decommission = stop-only (keputusan owner).** Stop proses V1 + cancel plan Convex +
  repoint webhook. **JANGAN** hapus `apps/web`, `apps/agents`, `packages/convex`,
  `packages/agent-contracts` dari repo atau dari root `package.json`. Kode V1 tetap terparkir,
  reversible. (Spec 06 langkah 5 "Repo cleanup" → di-skip.)
- **Semua proses di VPS via systemd** (web-v2 bukan Vercel) — eve in-process butuh
  `.workflow-data` file-backed di volume persisten.

## Topologi prod (di-deploy)

| Proses | Runtime | systemd unit | Port | Reverse proxy |
|---|---|---|---|---|
| api-v2 | Bun | `aqsha-api-v2.service` | 3001 | `api.aqsha.app` |
| worker | Bun | `aqsha-worker.service` | — | (tanpa port; BullMQ) |
| web-v2 + eve | Node ≥24 | `aqsha-web-v2.service` | 3000 | `app.aqsha.app` |

eve = **child process** yang di-spawn `withEve` di dalam web-v2 → **satu replica** (D1).
Artefak deploy: `infra/nginx/aqsha.conf`, `infra/systemd/aqsha-*.service`.

---

## 1. Pre-flight (VPS)

1. Checkout repo di `/srv/aqsha`, install: `bun install`.
2. Datastore: `docker compose -f infra/compose.yaml up -d` (postgres + redis + minio + minio-init).
   Isi `infra/.env` dari `infra/.env.example` (`BIND_HOST` = IP Tailscale, password kuat, `MINIO_BUCKET`).
3. Migrasi schema: `bun run db:migrate` (semua migrasi 0001–0009).
4. Isi env per-service di host (bukan di repo):
   - `/etc/aqsha/api-v2.env` ← dari `apps/api-v2/.env.example`: `DATABASE_URL`, `REDIS_URL`,
     `CLERK_SECRET_KEY`, **`CLERK_WEBHOOK_SIGNING_SECRET` (secret webhook V2 BARU)**, `S3_*` (MinIO),
     embedding (`AQSHA_EMBEDDING_*`, `AQSHA_RAG_*`), enrichment (`OPENALEX_API_KEY`, dst),
     Polar prod (`POLAR_SERVER=production`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`,
     4× `POLAR_*_PRODUCT_ID`), admin allowlist (`AQSHA_ADMIN_*`), `PORT=3001`.
   - `/etc/aqsha/web-v2.env` ← dari `apps/web-v2/.env.example`: `NEXT_PUBLIC_API_URL=https://api.aqsha.app`,
     Clerk publishable+secret, `DATABASE_URL` (sama Postgres), `OPENAI_API_KEY`, `AQSHA_LITE_MODEL`.
   - worker pakai `api-v2.env` (DB/Redis/keys sama).
5. Persistensi eve: `mkdir -p /var/lib/aqsha/workflow-data` lalu
   `ln -s /var/lib/aqsha/workflow-data /srv/aqsha/apps/web-v2/.workflow-data`
   (agar state durable selamat dari redeploy; backup manual — tidak otomatis).

## 2. Build + start

1. `bun run build:web-v2` (= `build:v2-dist` → `eve build` → `next build`). **Harus hijau** sebelum start.
2. Pasang artefak:
   - `cp infra/systemd/aqsha-*.service /etc/systemd/system/` (sesuaikan path Bun/Node + `User=`).
   - `cp infra/nginx/aqsha.conf /etc/nginx/sites-available/aqsha` + symlink ke `sites-enabled`.
   - TLS: `certbot --nginx -d api.aqsha.app -d app.aqsha.app`.
3. `systemctl daemon-reload && systemctl enable --now aqsha-api-v2 aqsha-worker aqsha-web-v2`.
4. `nginx -t && systemctl reload nginx`.
5. Cron feed-hydration 3h: di-register oleh worker saat start (BullMQ repeatable). Verifikasi di bull-board.

## 3. Smoke parity (manual, sebelum flip)

Validasi tiap fungsi `consumedByWeb:true` (~67 surface) lewat **satu loop visible** di domain prod.
Checklist per-domain ada di `06-implementation-phases.md:283–294` (Auth/User, Onboarding, Workspaces,
Artifacts, Feed/Explore, Agent, Billing). Jalan tembus:

1. **Sign up** baru → webhook Clerk buat row `users` → **wizard onboarding** 3 langkah.
2. **Feed** `/app/explore`: For You/Top/Topics render, search, save/hide, buka 3 reader.
3. **Workspace**: create/rename/emoji/archive + folder; **upload artifact** (PDF) → reader + metadata.
4. **Chat Astra**: kirim pesan → streaming token → tool call + HITL approve → artifact card → save-to-workspace.
5. **`/deep`**: plan-gate muncul → approve → subagent activity → sources → verification report.
6. **Billing**: lihat usage/plan → checkout (Polar sandbox/prod) → portal → cancel.

> ponytail: smoke manual, bukan harness parity otomatis — cutover sekali jalan. Tambah otomasi hanya kalau cutover berulang.

Probe infra: `curl https://api.aqsha.app/healthz` (db+redis true), `/health/ready` (+S3 HeadBucket),
`curl -N` endpoint stream eve → NDJSON mengalir bertahap (bukti `proxy_buffering off`).

## 4. Flip

1. **DNS / reverse-proxy**: arahkan domain utama dari apps/web (V1) → web-v2. (Kalau V1 di host lain,
   cukup ganti A/CNAME; kalau seproxy, aktifkan blok `app.aqsha.app`.)
2. **Webhook Clerk**: dashboard Clerk → ganti endpoint ke `https://api.aqsha.app/webhooks/clerk`,
   pakai signing secret V2 yang sudah di `api-v2.env`.
3. **Webhook Polar**: dashboard Polar → endpoint `https://api.aqsha.app/webhooks/polar`.
   Idempotency (Redis SETNX: svix-id untuk Clerk, `type:id:periodEnd:status` untuk Polar) menutup
   window overlap singkat — double-deliver aman.

## 5. Seed konten

`POST https://api.aqsha.app/admin/feed/hydrate` sekali (fan-out 5 lane). Tunggu lane selesai di
bull-board agar `/app/explore` ada isi saat launch.

## 6. Decommission V1 (owner-gated, stop-only)

Hanya setelah smoke loop (§3) hijau di prod:

1. Stop proses V1: hentikan `apps/web` (Next V1) + `apps/agents` (Claude SDK service).
2. Stop Convex: `convex dev` mati; hapus/​disable deployment Convex; **cancel plan Convex**
   (menghentikan biaya DB-bandwidth pemicu migrasi ini).
3. `git tag pre-v2-cutover` — penanda arsip. **Semua file V1 tetap di repo** (keputusan owner).
4. **TIDAK** menghapus workspace/script V1 dari root `package.json`. Tetap terparkir.

## 7. Post-cutover watch (1 siklus billing)

Pantau bull-board (lane hydration + enrichment + account-deletion), `/health/ready`, dan delivery
webhook Clerk+Polar. Jangan jalankan V1 & V2 di prod bersamaan di luar window flip.

---

## Owner-only (tak bisa otomatis dari repo)

Provision VPS + TLS · isi nilai secret di `/etc/aqsha/*.env` · DNS flip · ganti URL+secret webhook
di dashboard Clerk & Polar · hapus deployment + cancel plan Convex.

## Deliverable repo (Fase 10)

- `infra/nginx/aqsha.conf` · `infra/systemd/aqsha-{api-v2,worker,web-v2}.service`
- root `package.json`: `build:web-v2`, `start:api`, `start:worker`, `start:web-v2` (aditif).
- Dokumen ini.
