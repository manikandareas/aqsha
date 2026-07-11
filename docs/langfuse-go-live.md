# Langfuse Go-Live Runbook

Panduan mengaktifkan observability **Langfuse** (self-host) untuk `apps/agent` — trace token &
biaya per run Astra + `/deep`. Tujuan utama: memvalidasi unit-economics (mis. asumsi ~$1,05/run
Deep Pro) dengan data nyata, bukan tebakan.

> Integrasi sudah ada di kode (uncommitted). Dokumen ini hanya langkah **menyalakannya**.
> Referensi singkat: `AGENTS.md` (dev) & `DEPLOYMENT.md` (prod).

---

## 0. Arsitektur singkat

- **Langfuse jalan SATU kali**, di server infra, sebagai profile `langfuse` di
  `infra/compose.dev.yaml` (stack v3: `langfuse-web` + `langfuse-worker` + Postgres + ClickHouse +
  Redis milik Langfuse sendiri). Blob event/media **numpang MinIO app** (bucket `langfuse`).
- **Agent (dev & prod) hanya MENGIRIM trace** ke instance itu. Aktif bila `LANGFUSE_PUBLIC_KEY` +
  `LANGFUSE_SECRET_KEY` (+ `LANGFUSE_BASE_URL` untuk self-host) diisi. Kosong = tracing mati (tak
  crash). Master kill-switch semua exporter: `AQSHA_OBSERVABILITY=off`.
- Trace dev vs prod dipisah tag `environment` (`development` / `production`).

```
apps/agent (dev, laptop)  ─┐
apps/agent (prod, Dokploy) ─┼──►  langfuse-web:3000  ──►  ClickHouse (traces) + Postgres + MinIO
                            │        (infra server)
UI browser (kamu)  ─────────┘
```

---

## 1. Prasyarat

- Docker + Docker Compose di server infra.
- Akses `infra/.env` di server (turunan dari `infra/.env.example`).
- `openssl` untuk generate secret.
- Untuk akses UI dari luar server: IP Tailscale (`BIND_HOST`) atau subdomain via Traefik.

---

## 2. Generate & isi secret (`infra/.env`)

Jalankan di server infra:

```bash
echo "LANGFUSE_ENCRYPTION_KEY=$(openssl rand -hex 32)"      # WAJIB tepat 64 hex char
echo "LANGFUSE_SALT=$(openssl rand -base64 32)"
echo "LANGFUSE_NEXTAUTH_SECRET=$(openssl rand -base64 32)"
```

Lalu isi `infra/.env` (lihat `infra/.env.example` untuk daftar lengkap):

```dotenv
# Datastore Langfuse (internal-only, tapi tetap pakai password kuat di server bersama)
LANGFUSE_POSTGRES_PASSWORD=<random-kuat>
LANGFUSE_CLICKHOUSE_PASSWORD=<random-kuat>
LANGFUSE_REDIS_PASSWORD=<random-kuat>

# Secret aplikasi (dari perintah openssl di atas)
LANGFUSE_ENCRYPTION_KEY=<64-hex>
LANGFUSE_SALT=<base64>
LANGFUSE_NEXTAUTH_SECRET=<base64>

# URL publik langfuse-web (dipakai NextAuth). Default localhost hanya cukup bila UI diakses
# dari mesin yang sama. Untuk tailnet/subdomain, WAJIB diisi:
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
> diakses orang lain. Default itu hanya agar `docker compose up` biasa (tanpa profile) tidak error;
> di server bersama semua nilai di atas WAJIB di-override.

---

## 3. Nyalakan stack Langfuse

```bash
bun run infra:obs
# = docker compose -f infra/compose.dev.yaml --profile langfuse up -d
```

Tunggu ~2–3 menit (ClickHouse + migrasi). Cek kesiapan:

```bash
docker compose -f infra/compose.dev.yaml --profile langfuse ps
docker compose -f infra/compose.dev.yaml logs -f langfuse-web   # tunggu baris "Ready"
```

Buka UI: `http://<BIND_HOST>:3000` → login pakai `LANGFUSE_INIT_USER_EMAIL` / `PASSWORD`.
Project **Aqsha Agent** sudah otomatis ada dengan API keys yang kamu set.

> Infra biasa (tanpa tracing) tetap: `bun run infra:up` (hanya postgres/redis/minio, tak berubah).

---

## 4. Arahkan agent ke Langfuse

Agent mengaktifkan exporter hanya bila 3 var ini terisi.

### 4a. Dev (lokal)

⚠️ **`apps/agent/.env` di mesin ini adalah SYMLINK** ke project lain. Cek dulu:

```bash
ls -la apps/agent/.env
```

Tambahkan ke file yang **benar-benar dibaca** `mastra dev` (target symlink tersebut, bukan hanya
`.env.example`):

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-<sama-dengan-infra>
LANGFUSE_SECRET_KEY=sk-lf-<sama-dengan-infra>
LANGFUSE_BASE_URL=http://<BIND_HOST>:3000       # WAJIB untuk self-host (default SDK = cloud.langfuse.com)
```

Restart agent: `bun run dev:agent`.

### 4b. Prod (Dokploy)

Di **Environment tab** service (root `.env.example` = SSOT), isi:

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-<sama-dengan-infra>
LANGFUSE_SECRET_KEY=sk-lf-<sama-dengan-infra>
LANGFUSE_BASE_URL=https://langfuse.<domain>     # atau http://<TAILSCALE_IP>:3000 — harus terjangkau dari container agent
```

Redeploy service `agent`. Prod otomatis ber-tag `environment=production` (`NODE_ENV` di-set di
`compose.yaml`).

> **Cross-stack networking:** stack prod (`compose.yaml`) dan Langfuse (profile compose.dev) beda
> Compose project → agent menjangkau Langfuse via URL routable (subdomain/Tailscale), BUKAN DNS
> internal `langfuse-web:3000`.

---

## 5. Daftarkan harga model (WAJIB untuk kolom cost)

Langfuse belum kenal `gpt-5.1` & `gpt-5.4-mini`, jadi cost akan tampil **$0** sampai harga
didaftarkan. Di UI Langfuse → **Settings → Models → + New model**:

| Model match | Input (/1M) | Output (/1M) |
| --- | --- | --- |
| `gpt-5.1` | $1.25 | $10.00 |
| `gpt-5.4-mini` | $0.75 | $4.50 |

(Opsional: set cached-input = 10% dari input bila ingin presisi lebih.)

---

## 6. Verifikasi end-to-end

1. **Chat Pro** 1x di app → di Langfuse muncul trace dengan token in/out + cost > $0.
2. **`/deep`** 1x → muncul trace ber-hierarki (plan → subagents → synthesis).
3. Filter trace berdasar metadata **`deepRunId`** → jumlahkan cost seluruh span 1 run =
   **biaya riil per Deep Research run** → bandingkan asumsi ~$1,05 (Pro) / ~$0,45 (Lite).
4. Cek tag `environment` memisah `development` vs `production`.

Checklist lulus:

- [ ] Trace chat Pro tampil dengan cost akurat (bukan $0)
- [ ] Trace `/deep` lengkap dan bisa difilter per `deepRunId`
- [ ] Biaya per deep-run tercatat → asumsi unit-economics tervalidasi/terkoreksi

---

## 7. Troubleshooting

| Gejala | Sebab & solusi |
| --- | --- |
| `bun run infra:up` error `LANGFUSE_* is missing` | Seharusnya tak terjadi (default `:-`). Jika muncul, ada var Langfuse yang masih `:?` — pastikan pakai versi compose terbaru. |
| Tak ada trace masuk sama sekali | (a) `LANGFUSE_PUBLIC_KEY`/`SECRET_KEY` belum terbaca agent — untuk dev cek **symlink** `.env`; (b) `LANGFUSE_BASE_URL` salah/tak terjangkau dari agent; (c) `AQSHA_OBSERVABILITY=off`. |
| Cost tampil $0 | Harga model belum didaftarkan (Langkah 5). |
| `langfuse-web` tak kunjung "Ready" | Tunggu ClickHouse; cek `docker compose logs langfuse-clickhouse` & `langfuse-worker`. |
| Login UI gagal | `LANGFUSE_NEXTAUTH_URL` harus = URL yang kamu pakai di browser; `NEXTAUTH_SECRET` konsisten. |
| Media/atачment di trace tak load | `LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT` internal (`minio:9000`) tak terjangkau browser — abaikan untuk kebutuhan cost, atau arahkan ke URL MinIO publik. |

---

## 8. Enhancement opsional (nanti)

- **Tag `release`**: set build-arg `GIT_COMMIT` di `apps/agent/Dockerfile` → trace terkelompok
  per-deploy.
- **Kredit Firecrawl**: Langfuse hanya auto-capture token LLM. Tambah span/score manual untuk
  konsumsi Firecrawl per run agar biaya total (LLM + scrape) lengkap.
- **Dashboard & alert**: buat dashboard "cost per Deep Research run" + alert bila melewati ambang.
- **Pin image ClickHouse** ke tag spesifik (saat ini mengikuti compose resmi Langfuse, unpinned)
  untuk reproducibility prod.
