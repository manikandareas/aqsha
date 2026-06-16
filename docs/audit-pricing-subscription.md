# Audit Pricing & Subscription — Aqsha

> Tanggal audit: 2026-06-16
> Cakupan: skema langganan, harga, pembagian & pembatasan fitur, limit per plan dan per fitur, serta mekanisme penegakannya (enforcement).
> Sumber kebenaran utama: `packages/convex/convex/billing/catalog.ts` (definisi plan, harga, kredit, limit) dan `packages/convex/convex/billing/entitlements.ts` (enforcement).

---

## 1. Ringkasan Eksekutif

- **Model bisnis**: freemium berbasis **kredit bulanan** + beberapa **limit kuantitatif** (workspace, library item) + **gating fitur per tier**.
- **Mata uang**: IDR (Rupiah). Provider pembayaran: **Polar** (`@convex-dev/polar`), bukan Stripe.
- **Tier publik**: `free`, `starter`, `plus`. Plus ada tier internal `admin` (unlimited, tidak dijual).
- **Interval billing**: bulanan (`month`) dan tahunan (`year`). Harga tahunan = 10× harga bulanan (≈ 2 bulan gratis).
- **Konsep kredit**: satu saldo "credits" tunggal per user yang dikonsumsi dengan tarif berbeda per fitur. Multiplier sengaja disembunyikan dari user (`catalog.ts:212`).
- **Tiga lapis pembatasan** yang berdiri sendiri:
  1. **Plan gating** — fitur tertentu butuh tier minimum (`pro_chat`, `sandbox_compute`, deep research Pro).
  2. **Kuota bulanan** — saldo kredit + jumlah run deep research, reset tiap awal bulan (UTC).
  3. **Rate limit runtime** — token-bucket per-user/global per menit (proteksi throughput & biaya provider), **independen** dari kuota bulanan.

---

## 2. Definisi Plan (Tier)

Sumber: `packages/convex/convex/billing/catalog.ts:38-125` (`PLAN_CATALOG`), urutan tier di `PLAN_ORDER` (`catalog.ts:31`).

| Atribut | Free (tier 0) | Starter (tier 1) | Plus (tier 2) | Admin (tier 3, internal) |
|---|---|---|---|---|
| Label | Free | Starter | Plus | Admin |
| Harga / bulan | IDR 0 | **IDR 49.000** | **IDR 99.000** | IDR 0 |
| Harga / tahun | IDR 0 | **IDR 490.000** | **IDR 990.000** | IDR 0 |
| Kredit / bulan | **50** | **500** | **1.500** | Unlimited¹ |
| Deep Research run / bulan | **2** (Lite) | **3** (Pro) | **12** (Pro) | Unlimited¹ |
| Limit workspace | **1** | **5** | **20** | Unlimited¹ |
| Limit library item | **25** | **250** | **1.000** | Unlimited¹ |
| Provider spend ceiling | **0 sen** ($0,00) | **125 sen** ($1,25) | **400 sen** ($4,00) | Unlimited¹ |
| Akses model agen | Astra Lite | Astra Lite + Astra Pro | Astra Lite + Astra Pro | Semua |

¹ `Number.MAX_SAFE_INTEGER` (`catalog.ts:112-116`). Untuk admin, usage **tetap dicatat** di ledger dan **global/provider rate limit tetap aktif** (`catalog.ts:117-123`).

> Catatan **provider spend ceiling**: nilai dalam sen USD, disimpan di `billingCreditPeriods.spendCeilingCents` dan diisi dari plan saat periode dibuat/diperbarui (`entitlements.ts:528, 562, 579`). **Penting:** dari pembacaan kode, ceiling ini saat ini *dicatat* per periode tetapi **belum ada cabang penegakan yang memblokir usage saat `estimatedCostCents` melewati `spendCeilingCents`** — `requireEntitlement` hanya mengecek plan, status billing, kuota deep research, dan saldo kredit (`entitlements.ts:215-234`). Lihat Temuan T-1.

---

## 3. Katalog Produk (SKU Polar)

Sumber: `catalog.ts:127-160` (`PRODUCT_CATALOG`).

| Product key | Plan | Interval | Harga tampil | Env var product ID |
|---|---|---|---|---|
| `starterMonthly` | starter | month | IDR 49.000 | `POLAR_STARTER_MONTHLY_PRODUCT_ID` |
| `starterYearly` | starter | year | IDR 490.000 | `POLAR_STARTER_YEARLY_PRODUCT_ID` |
| `plusMonthly` | plus | month | IDR 99.000 | `POLAR_PLUS_MONTHLY_PRODUCT_ID` |
| `plusYearly` | plus | year | IDR 990.000 | `POLAR_PLUS_YEARLY_PRODUCT_ID` |

Env var pattern `POLAR_<PRODUCT_KEY>_PRODUCT_ID` didefinisikan di `billing/polar.ts:9-11`. Plan publik yang dipasarkan: `PUBLIC_PLAN_KEYS = ["free", "starter", "plus"]` (`catalog.ts:163`).

---

## 4. Fitur & Tarif Kredit

Fitur yang dapat dikenai kredit (`CreditFeature`, `catalog.ts:22-29`) dan tarif konversinya (`estimateCredits`, `catalog.ts:212-255`).

| Fitur (`feature`) | Tarif kredit | Plan minimum | Keterangan |
|---|---|---|---|
| `normal_chat` (Astra Lite) | 1 kredit / **1.500 token** (dibulatkan ke atas, min 1) | free | Chat dasar |
| `pro_chat` (Astra Pro) | 1 kredit / **250 token** (≈6× lebih mahal dari normal) | **starter** | Model GPT-5.5 Pro |
| `deep_research` — varian **Lite** | **60 kredit / run** (flat) | free | Deep Research Lite (Free boleh, dibatasi kuota run) |
| `deep_research` — varian **Pro** | **120 kredit / run** (flat) | **starter** | Deep Research Pro |
| `sandbox_compute` | **10 kredit / run** (flat) | **starter** | Verification engine (Daytona, billing per detik) |
| `external_search` | **2 kredit / call** (flat) | free | Pencarian eksternal (Exa/Jina) |
| `cited_answer` | mengikuti tarif chat | free | Jawaban dengan sitasi |
| `citation_verify` | **0 kredit** (dicatat, tidak ditagih) | free | Verifikasi integritas sitasi 4-langkah |

Konstanta tarif: `NORMAL_CHAT_TOKENS_PER_CREDIT = 1_500`, `PRO_CHAT_TOKENS_PER_CREDIT = 250`, `DEEP_PRO_CREDITS = 120`, `DEEP_LITE_CREDITS = 60`, `SANDBOX_COMPUTE_CREDITS = 10` (`catalog.ts:214-222`).

### Pemetaan plan minimum per fitur

`requiredPlanForFeature` (`catalog.ts:183-197`) — default statis; jalur kirim pesan menimpa dengan `requiredPlan` yang sadar-agen:

- `pro_chat` → **starter**
- `sandbox_compute` → **starter**
- `deep_research` → default **starter**, tetapi **Lite-deep memakai `free`** sehingga user Free bisa pakai kuota run-nya, **Pro-deep memakai `starter`** (`agent/sendQuota.ts:45-51`).
- `cited_answer`, `external_search`, `normal_chat`, `citation_verify` → **free**.

---

## 5. Estimasi Biaya Provider (untuk akuntansi, bukan saldo user)

`estimateProviderCostCents` (`catalog.ts:274-296`) menghitung biaya riil provider dalam sen, dicatat di `providerUsageLedger.estimatedCostCents` dan diakumulasi ke `billingCreditPeriods.estimatedCostCents`.

| Sumber biaya | Tarif |
|---|---|
| `external_search` — provider `exa` | 3 sen / call |
| `external_search` — provider `jina_read` | 2 sen / call |
| `external_search` — `jina_search` / `jina_rerank` | 1 sen / call |
| LLM input — model `gpt-5.5` non-mini | 125 sen / 1 juta token |
| LLM output — model `gpt-5.5` non-mini | 1.000 sen / 1 juta token |
| LLM input — model lain | 15 sen / 1 juta token |
| LLM output — model lain | 60 sen / 1 juta token |

---

## 6. Limit Kuantitatif (non-kredit) per Plan

| Limit | Free | Starter | Plus | Admin | Lokasi enforcement |
|---|---|---|---|---|---|
| Workspace | 1 | 5 | 20 | ∞ | `workspaces.ts` → `assertWorkspaceCapacity` (limit dari `PLAN_CATALOG.*.workspaceLimit`) |
| Library item (artifact) | 25 | 250 | 1.000 | ∞ | `artifacts.ts` → `assertLibraryCapacityForOwner` |
| Deep Research run / bulan | 2 | 3 | 12 | ∞ | `entitlements.ts:412-432` `deepResearchRunsLimitReached` |
| Kredit / bulan | 50 | 500 | 1.500 | ∞ | `entitlements.ts:232` (`remaining < credits`) |

- **Workspace** → error terstruktur `workspace_limit_reached` (severity `warning`).
- **Library item** → error `library_item_limit_reached` (severity `warning`).
- **Deep research run** → dihitung dari jumlah baris `providerUsageLedger` dengan `feature="deep_research"` dalam jendela periode bulan berjalan (`entitlements.ts:421-431`), menghasilkan `EntitlementResult.reason = "quota_exceeded"`.
- **Kredit** → `EntitlementResult.reason = "quota_exceeded"`.

---

## 7. Rate Limit Runtime (per menit, independen dari kuota bulanan)

Sumber: `packages/convex/convex/limits.ts:8-144` (`@convex-dev/rate-limiter`). Ini **bukan** limit billing — ini katup pengaman throughput & biaya provider. Berlaku sama untuk semua tier (termasuk admin).

| Bucket | Tipe | Rate | Periode | Kapasitas | Scope |
|---|---|---|---|---|---|
| `sendMessage` | fixed window | 1 | 5 dtk | 2 | per-user |
| `globalSendMessage` | token bucket | 1.000 | 1 mnt | 1.000 | global |
| `globalTokenUsage` | token bucket | 100.000 token | 1 mnt | 100.000 | global (safety valve) |
| `externalSearchPerUser` | token bucket | 20 | 1 mnt | 20 | per-user |
| `exaSearchPerUser` | token bucket | 10 | 1 mnt | 10 | per-user |
| `jinaSearchPerUser` | token bucket | 8 | 1 mnt | 8 | per-user |
| `jinaReadPerUser` | token bucket | 12 | 1 mnt | 12 | per-user |
| `jinaRerankPerUser` | token bucket | 12 | 1 mnt | 12 | per-user |
| `crossrefLookupGlobal` | token bucket | 30 | 1 mnt | 30 | global |
| `arxivSearchGlobal` | fixed window | 1 | 3 dtk | 1 | global |
| `openAlexSearchGlobal` | token bucket | 30 | 1 mnt | 30 | global |
| `exaSearchGlobal` | token bucket | 6 | 1 mnt | 6 | global (feed) |
| `googleFactCheckGlobal` | token bucket | 30 | 1 mnt | 30 | global |
| `gdeltGlobal` | token bucket | 12 | 1 mnt | 12 | global |
| `paperIngestPerUser` | token bucket | 12 | 1 mnt | 12 | per-user |
| `paperPdfDownloadPerUser` | token bucket | 12 | 1 mnt | 12 | per-user |
| `unpaywallGlobal` | token bucket | 60 | 1 mnt | 60 | global |
| `semanticScholarGlobal` | fixed window | 1 | 1 dtk | 1 | global |
| `sandboxComputePerUser` | token bucket | 5 | 1 mnt | 5 | per-user |
| `citationVerifyPerUser` | token bucket | 10 | 1 mnt | 10 | per-user |

**Catatan:** Semua rate limit di atas seragam lintas tier — **tidak ada diferensiasi rate limit berdasarkan plan**. Free dan Plus sama-sama dibatasi 1 pesan / 5 detik dan 20 external search / menit. Lihat Temuan T-2.

---

## 8. Mekanisme Penegakan (Enforcement Flow)

### Jalur kirim pesan (`agent/sendQuota.ts:20-88`)
1. Estimasi token (`content.length / 4`).
2. Tentukan `feature` & `requiredPlan` dari `agentKind` (lite/pro) dan `isDeep`.
3. `consumeCredits` → `requireEntitlement`:
   - **Admin** → selalu lolos (usage tetap dicatat).
   - Cek **plan minimum** (`isPlanAtLeast`) → gagal: `subscription_required`.
   - Cek **status billing** (`billingStatusAllowsUsage`) → gagal: `billing_inactive`.
   - Jika deep research → cek **kuota run bulanan** → gagal: `quota_exceeded`.
   - Cek **saldo kredit** (`remaining < credits`) → gagal: `quota_exceeded`.
4. Jika entitlement OK, debit kredit + catat ledger + bump rollup harian (satu transaksi).
5. Cek **rate limit** (`sendMessage`, `globalSendMessage`, `globalTokenUsage`) → jika blok, kembalikan `retryAt`.

### Status billing yang mengizinkan usage (`catalog.ts:314-331`)
- `admin` / plan `admin` → selalu boleh.
- Plan `free` → selalu boleh.
- Status `active` / `trialing` → boleh.
- Status `canceled` → **boleh sampai `currentPeriodEnd`** (grace period).
- Lainnya (`past_due`, `unpaid`, `incomplete`, `paused`) → diblokir.

### Reset kuota (`catalog.ts:199-210`, `entitlements.ts:507-594`)
- Periode = **bulan kalender UTC**; `periodKey` format `YYYY-MM`.
- Reset pada tanggal 1 bulan berikutnya pukul 00:00 UTC.
- `ensureCreditPeriod` membuat/menyinkronkan baris `billingCreditPeriods`; jika plan berubah di tengah periode, `creditsLimit` & `spendCeilingCents` diperbarui mengikuti plan baru.

---

## 9. Penentuan Admin (override unlimited)

Sumber: `billing/admin.ts` (via env, case-insensitive). Admin = plan `admin`, kredit unlimited, tidak bisa change/cancel subscription, portal tersedia jika ada subscription termirror.

| Env var | Isi |
|---|---|
| `AQSHA_ADMIN_EMAILS` | daftar email dipisah koma |
| `AQSHA_ADMIN_OWNER_USER_IDS` | owner user ID |
| `AQSHA_ADMIN_CLERK_USER_IDS` | Clerk user ID |
| `AQSHA_ADMIN_USER_IDS` / `AQSHA_ADMIN_CONVEX_USER_IDS` | Convex document ID |

Override juga bisa lewat tabel `adminEntitlements` (`schema.ts`).

---

## 10. Skema Data Billing

Sumber: `packages/convex/convex/schema.ts`.

| Tabel | Fungsi | Index utama |
|---|---|---|
| `billingSubscriptions` | mirror langganan Polar (plan, status, periode) | `by_owner_updated`, `by_subscription` |
| `billingCreditPeriods` | ringkasan kredit per (user, bulan): `creditsLimit`, `creditsUsed`, `estimatedCostCents`, `spendCeilingCents` | `by_owner_period` |
| `providerUsageLedger` | catatan atomik tiap konsumsi fitur (token, kredit, biaya) | `by_owner_created`, `by_owner_feature_created` |
| `usageDailyRollup` | agregat harian per (user, tanggal UTC) + `featureCounts` | `by_owner_date` |
| `billingEvents` | dedup event webhook Polar | `by_event_key` |
| `adminEntitlements` | override admin manual | `by_owner`, `by_email` |

---

## 11. Permukaan API & Frontend

**Convex publik** (`billing/*`):
- Query: `billing.current.get`, `billing.usage.getCurrentPeriod`, `billing.usage.activity` (30/90/365 hari), `billing.products.list`.
- Mutation/Action: `billing.checkout.create`, `billing.subscription.change`, `billing.subscription.cancel`, `billing.portal.create`, `billing.products.sync`.

**Convex internal**:
- `internal.billing.entitlements.consumeCreditsInternal` — debit kredit (dipanggil agent service).
- `internal.billing.entitlements.syncSubscriptionFromPolar` — proses webhook Polar (idempoten via `billingEvents`).

**Frontend** (`apps/web`):
- Hook agregat: `features/settings/api/use-settings-usage-billing-data.ts`.
- Halaman: `app/app/settings/usage-billing/page.tsx`, kontrol plan `features/settings/components/billing-plan-controls.tsx`.
- Marketing pricing: `features/marketing/components/pricing-section.tsx` (link `/sign-up?plan=starter|plus`).

**Validasi checkout** (`billing/checkout.ts:14-60`): wajib email terverifikasi; menolak domain `@localhost`, `*.local`, `*.test`, `*.example`, `*.invalid`. Metadata Polar: `{ userId, productKey, planKey, interval }`.

---

## 12. Temuan & Rekomendasi

| ID | Severity | Temuan | Rekomendasi |
|---|---|---|---|
| **T-1** | Tinggi | `providerSpendCeilingCents` (Starter 125, Plus 400) disimpan & diakumulasi tapi **tidak ada cek yang memblokir usage** saat biaya provider melewati ceiling. `requireEntitlement` hanya menegakkan plan/status/kuota-deep/saldo-kredit (`entitlements.ts:215-234`). Field ini efektif dekoratif. | Putuskan: (a) implementasikan gate `estimatedCostCents >= spendCeilingCents` → tolak/turunkan, atau (b) hapus field jika memang tak dipakai agar tidak menyesatkan. |
| **T-2** | Sedang | Rate limit runtime (`limits.ts`) **seragam lintas tier** — user Plus (membayar) punya throughput per-menit yang sama dengan Free (`sendMessage` 1/5dtk, search 20/mnt, dst.). | Pertimbangkan rate limit berjenjang per plan jika ingin diferensiasi pengalaman tier berbayar. |
| **T-3** | Sedang | Estimasi token sangat kasar: `content.length / 4` (`sendQuota.ts:16-18`) dan debit kredit terjadi **di muka** berdasar input saja — token output (yang jauh lebih mahal pada `gpt-5.5`) tidak masuk perhitungan kredit di jalur kirim. | Verifikasi apakah ada rekonsiliasi kredit pasca-run berbasis token aktual; jika tidak, `pro_chat` berpotensi under-charge signifikan. |
| **T-4** | Rendah | Harga tahunan = 10× bulanan (≈ 2 bulan gratis) tetapi tidak ada penanda diskon eksplisit di katalog backend. | Pastikan UI marketing mengomunikasikan hemat tahunan; pertimbangkan menyimpan persen diskon di katalog agar konsisten. |
| **T-5** | Rendah | Quota deep research dihitung dengan menghitung baris ledger `feature="deep_research"` per periode (`entitlements.ts:421-431`). Run yang gagal di tengah jalan tetap menambah hitungan jika sudah sempat tercatat di ledger. | Pastikan ledger deep_research hanya dicatat pada run yang benar-benar dimulai/berhasil, atau pisahkan counter run dari ledger konsumsi. |
| **T-6** | Info | Free dapat memakai **Deep Research Lite** (60 kredit/run, kuota 2/bln) — dengan kuota 50 kredit/bln, **1 run deep Lite (60) sudah melebihi total kredit bulanan Free (50)**. Artinya Free praktis tidak bisa menjalankan deep research Lite kecuali ada urutan pengecekan tertentu. | Klarifikasi desain: turunkan biaya Lite-deep untuk Free, naikkan kredit Free, atau hapus kuota "2 run" yang menyesatkan di copy plan Free. |

> **Catatan khusus T-6**: pada `requireEntitlement`, cek kuota deep research run dilakukan **sebelum** cek saldo kredit (`entitlements.ts:221-234`), tetapi karena `remaining (50) < credits (60)` akan tetap memicu `quota_exceeded`. Jadi klaim "2 Deep Research (Lite) per bulan" di fitur plan Free (`catalog.ts:66`) tidak dapat tercapai dengan saldo 50 kredit. Ini inkonsistensi copy vs. ekonomi kredit yang sebaiknya diselaraskan.

---

## 13. Lampiran — Referensi File

- Definisi plan, harga, tarif kredit, biaya provider: `packages/convex/convex/billing/catalog.ts`
- Enforcement entitlement, debit kredit, periode, webhook: `packages/convex/convex/billing/entitlements.ts`
- Gate kirim pesan (kredit + rate limit): `packages/convex/convex/agent/sendQuota.ts`
- Rate limit runtime: `packages/convex/convex/limits.ts`
- Integrasi Polar: `packages/convex/convex/billing/polar.ts`, `billing/checkout.ts`, `billing/subscription.ts`, `billing/portal.ts`, `billing/products.ts`, `billing/current.ts`, `billing/usage.ts`
- Override admin: `packages/convex/convex/billing/admin.ts`
- Limit workspace: `packages/convex/convex/workspaces.ts`
- Limit library item: `packages/convex/convex/artifacts.ts`
- Skema tabel billing: `packages/convex/convex/schema.ts`
- Frontend billing: `apps/web/features/settings/**`, `apps/web/features/marketing/components/pricing-section.tsx`
- Test terkait: `packages/convex/tests/billingCatalog.test.ts`, `agentKindBilling.test.ts`, `usageRollup.test.ts`
