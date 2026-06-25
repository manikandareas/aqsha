# Setup Mayar (sandbox) — Billing Aqsha V2

Runbook konfigurasi Mayar untuk subscription. Pembuatan produk **hanya bisa via
dashboard** (Mayar API/CLI tak punya create-product). Backend memetakan
`productId` → plan/interval lewat 6 env var, jadi tiap produk harus **productId
unik** (1 produk = 1 plan × 1 interval).

Host: sandbox = `https://web.mayar.club` (dashboard) + `https://api.mayar.club` (API).

---

## 1. Akun + API key sandbox

1. Daftar/masuk di **https://web.mayar.club** (akun sandbox, terpisah dari production).
2. **Integration → API Key** → salin key (format JWT `eyJ…`).

## 2. Buat 6 produk recurring (engine: membership-tier)

> **Tipe produk:** backend mendengarkan event **`membership.*`**, jadi pilih tipe
> produk yang halaman detail-nya menyediakan **"Tier / Level / Paket Membership"**
> (di sandbox bisa berlabel _Subscription_). Hindari produk satu-kali. Verifikasi
> di langkah 3: produk harus muncul di `GET …/product/type/membership` (`type:"membership"`).

**Alur pembuatan = 2 langkah** (form pertama belum ada harga/durasi):

1. **Buat shell produk** — form pertama hanya **title + description** (+ opsional). Save.
2. **Di halaman detail produk** → tombol **Tambah Tier / Level / Paket Membership** →
   isi **harga** + **durasi (Payment Duration)** sesuai tabel. Aktifkan **satu durasi
   saja** per produk.

Buat **6 produk**, masing-masing **1 tier, 1 durasi** (supaya `productId` unik per
plan×interval — backend memetakan `productId` → env):

| Produk (saran nama)      | Harga (tier) | Durasi   | → env var                          |
| ------------------------ | ------------ | -------- | ---------------------------------- |
| Aqsha Starter — Bulanan  | Rp49.000     | 1 bulan  | `MAYAR_STARTER_MONTHLY_PRODUCT_ID` |
| Aqsha Starter — Tahunan  | Rp490.000    | 12 bulan | `MAYAR_STARTER_YEARLY_PRODUCT_ID`  |
| Aqsha Plus — Bulanan     | Rp99.000     | 1 bulan  | `MAYAR_PLUS_MONTHLY_PRODUCT_ID`    |
| Aqsha Plus — Tahunan     | Rp990.000    | 12 bulan | `MAYAR_PLUS_YEARLY_PRODUCT_ID`     |
| Aqsha Ultra — Bulanan    | Rp349.000    | 1 bulan  | `MAYAR_ULTRA_MONTHLY_PRODUCT_ID`   |
| Aqsha Ultra — Tahunan    | Rp3.490.000  | 12 bulan | `MAYAR_ULTRA_YEARLY_PRODUCT_ID`    |

> **Jangan** taruh durasi bulanan + tahunan dalam **satu** produk — `productId`-nya
> sama → backend tak bisa bedakan interval. Pisah jadi produk berbeda (= 6 produk).
> Set **Redirect URL** tiap produk ke `https://<app-host>/app/settings/usage-billing`.
> Harga = SSOT di `packages/services/src/plan.ts` (`PRODUCT_CATALOG`); kalau diubah,
> ubah di dua tempat (dashboard + plan.ts).

## 3. Ambil product ID

Dashboard tiap produk menampilkan ID, atau via API:

```bash
curl -s 'https://api.mayar.club/hl/v1/product/type/membership?page=1&pageSize=100' \
  -H "Authorization: Bearer <SANDBOX_API_KEY>" | jq '.data[] | {id, name, amount, linkPayment}'
```

## 4. Isi env `apps/api-v2/.env.local`

```bash
MAYAR_SERVER=sandbox
MAYAR_API_KEY=<sandbox JWT>
MAYAR_WEBHOOK_SECRET=<random, mis. `openssl rand -hex 16`>
MAYAR_STARTER_MONTHLY_PRODUCT_ID=<id>
MAYAR_STARTER_YEARLY_PRODUCT_ID=<id>
MAYAR_PLUS_MONTHLY_PRODUCT_ID=<id>
MAYAR_PLUS_YEARLY_PRODUCT_ID=<id>
MAYAR_ULTRA_MONTHLY_PRODUCT_ID=<id>
MAYAR_ULTRA_YEARLY_PRODUCT_ID=<id>
```

Placeholder sudah disiapkan di **`apps/api-v2/.env.local`** (Bun memuatnya menambah
`.env`) — tinggal isi nilainya. **Hanya api-v2** yang butuh `MAYAR_*`; `agent-v2`
cuma pakai `consumeCredits`/`requireEntitlement` (baca DB + PLAN_CATALOG), tak perlu.

## 5. Migrasi DB (0012)

```bash
bun run --filter '@aqsha/db' migrate   # rename polar_*→provider_*, billing_pending_webhooks, plan-check ultra
```

## 6. Daftarkan webhook

Mayar (cloud) harus bisa menjangkau endpoint **publik** api-v2. URL = path-secret:

```
https://<api-v2-public-host>/webhooks/mayar/<MAYAR_WEBHOOK_SECRET>
```

- Dashboard: **Integration → Webhook** → isi URL di atas → Save → **Test URL**.
- Sandbox lokal: expose api-v2 via tunnel (ngrok/cloudflared) lalu pakai URL tunnel.
- Event yang dipakai backend: `membership.newMemberRegistered`,
  `membership.changeTierMemberRegistered`, `payment.received`,
  `membership.memberUnsubscribed`, `membership.memberExpired` (lainnya di-ignore).

## 7. Redeploy + E2E

1. Redeploy **api-v2** + **agent-v2** (baca env baru).
2. Buka `/app/settings/usage-billing` → pilih produk → redirect ke payment link Mayar.
3. Bayar di sandbox → Mayar kirim webhook → `GET /billing/current` harus `active` +
   plan benar + period-end +1 bulan/tahun.
4. "Kelola tagihan" → cek email (magic-link portal). "Ganti paket" → redirect checkout tier baru.

> **WAJIB konfirmasi event (sekali):** setelah test bayar pertama, cek event yang
> dikirim Mayar — dashboard **Integration → Webhook → History**, atau:
> `curl -s 'https://api.mayar.club/hl/v1/webhook/history' -H "Authorization: Bearer <KEY>" | jq '.data[].type'`.
> Harus `membership.newMemberRegistered` (atau `payment.received`). Kalau event-nya
> beda (mis. tipe SaaS/license), **lapor** — handler `statusForMayarEvent`
> (`packages/services/src/clients/mayar.ts`) tinggal ditambah nama event-nya.

### Catatan atribusi (penting)
Mayar webhook tak bawa userId — owner dicocokkan **by email** (`customerEmail` ==
email Clerk). Pastikan saat bayar, email yang dipakai = email akun. Email tak cocok
→ tersimpan di tabel `billing_pending_webhooks` untuk rekonsiliasi manual (tidak error).

### Verifikasi cepat (CLI — hanya kalau key = environment yang sama)
```bash
npx -y mayar@latest whoami --json                 # cek key valid
npx -y mayar@latest product type membership --json # list produk + id
npx -y mayar@latest webhook history --json         # lihat payload webhook nyata
```
> CLI `mayar` jalan di **production** (`api.mayar.id`); untuk sandbox pakai `curl`
> ke `api.mayar.club` (lihat langkah 3).
