# Audit External API — Halaman Explore ("Jelajahi")

> Status: audit kode per 2026-06-16. Sumber: `packages/convex/convex/feed/**`,
> `explore.ts`, `crons.ts`, `limits.ts`, `agent/providers/**`, dan frontend
> `apps/web/features/discovery|explore/**`.
> Diverifikasi silang secara adversarial (12 sub-agen) — temuan di bawah sudah
> dikonfirmasi terhadap kode, bukan asumsi.

## 1. Temuan utama

**Frontend Explore tidak memanggil API eksternal sama sekali.** Halaman
(`features/discovery/pages/discovery-page.tsx`) hanya membaca satu query Convex,
`api.feed.getFeed`, yang membaca tabel `feedItems` yang **sudah terisi lebih
dulu oleh cron jobs**. Semua pemanggilan API eksternal terjadi **di dalam Convex
action** (backend), tidak pernah dari browser.

Konsekuensinya:

- **Feed utama** (paper / berita / klaim cek-fakta / topik / ide) → diisi
  **cron** di background, lalu dibaca dari DB saat page-load. **Bukan** fetch
  live per page-load.
- **Sebagian fitur interaktif** (cari paper, meter konsensus, generate ide,
  "kenapa relevan", glossary) → fetch **on-demand** saat user menekan tombol,
  hasilnya di-cache.

Pola umum semua lane feed:

```
Cron (interval tetap)
  → internal action (jalur "service", tanpa kredit user)
      → API eksternal  → cek/tulis cache (externalLookupCache)
      → upsert ke tabel feedItems
                          │
Page-load /app/explore ───┘
  → DiscoveryPage → useConvexQueryData(api.feed.getFeed)
       → BACA tabel feedItems (TIDAK ada fetch eksternal saat baca)
```

## 2. Lane yang diisi CRON (background → tabel `feedItems`)

| # | External API | Endpoint | Untuk | Auth (env) | Biaya | Cron job | Cadence | Cache server |
|---|---|---|---|---|---|---|---|---|
| 1 | **OpenAlex** | `api.openalex.org/works` | Paper trending (`sort=cited_by_count:desc`, `from_publication_date:2021`) | `OPENALEX_API_KEY` | Gratis | `feed:trending-papers` | **8 jam** | 24 jam (bucket per-tanggal) |
| 2 | **Exa** | `api.exa.ai/search` (SDK `exa-js`, `category:"news"`) | Berita sains/kesehatan ID | `EXA_API_KEY` | **Berbayar** | `feed:science-news` | **12 jam** | 24 jam (`ready`) |
| 3 | **GDELT DOC 2.0** | `api.gdeltproject.org/api/v2/doc/doc` (`mode=timelinevol`) | Topik naik daun (`sourcelang:indonesian`, window 3 bulan) | — (keyless) | Gratis | `feed:gdelt-topics` | **24 jam** | 24 jam (hanya hasil non-kosong) |
| 4 | **Google Fact Check Tools** | `factchecktools.googleapis.com/v1alpha1/claims:search` | Klaim cek-fakta (Mafindo/Cek Fakta/Tempo/Liputan6), `languageCode=id`, sains+kesehatan saja, `maxAgeDays=30` | `GOOGLE_FACTCHECK_API_KEY` | Gratis | `feed:factcheck-claims` | **24 jam** | 24 jam (`ready`) / 90 mnt (`empty`) / 12 mnt (`failed`) |
| 5 | **LLM** (OpenAI-compatible gateway) | `AQSHA_CHAT_BASE_URL` (override) / OpenAI; model default `gpt-5.4-mini` | Backfill terjemahan Bahasa Indonesia (judul + TL;DR) | `AQSHA_CHAT_API_KEY` / `OPENAI_API_KEY` | **Berbayar** | `feed:backfill-id` | **6 jam** | persist per item |
| 6 | **Scrape halaman publisher** | HTTP `fetch` langsung (`fetchArticlePreview`, readability lokal — **bukan** API) | Ambil `og:image` + body artikel untuk kartu berita/klaim | — | Gratis | sub-langkah dari #2 & #4 | ikut 12j / 24j | tidak di-cache |

Catatan: cron `feed:factcheck-claims` juga memanggil **OpenAlex** sebagai
sub-langkah (mencari paper pendukung tiap klaim: 12 klaim pertama × 4 paper).

`agent:watchdog` (tiap 5 menit) ada di `crons.ts` tapi **bukan** bagian feed —
itu watchdog runtime agen, di luar lingkup Explore.

## 3. Pemanggilan ON-DEMAND (dipicu aksi user, bukan cron)

| Fitur | Fungsi Convex | External API | Trigger | Cache |
|---|---|---|---|---|
| **Cari paper** (tab Papers) | `explore.searchPapers` | Cascade fallback: **OpenAlex → arXiv → Exa → Jina → Crossref** (berhenti saat hasil cukup) | User submit query / buka tab | `staleTime: Infinity` (frontend) + cache `explore` di DB |
| **Detail paper cold deep-link** | `explore.getOrFetchPaper` | Crossref (DOI) → OpenAlex → arXiv | Buka paper yang belum ter-cache | tabel `explorePapers` |
| **Meter konsensus ilmuwan** | `feed.consensus.getConsensus` | OpenAlex (10 paper) + LLM (klasifikasi stance) | Klik tombol konsensus | **30 hari** (`feedConsensus`) |
| **Generate ide riset** | `feed.ideas.generateIdeas` | OpenAlex (RAG grounding) + LLM | Klik dari item feed | — (kena billing) |
| **"Kenapa relevan untukmu"** | `feed.ai.explainRelevance` | LLM | Klik | — |
| **Glossary istilah** | `feed.ai.explainTerm` | LLM | Klik | — |

Fitur on-demand yang memakai LLM/OpenAlex mengonsumsi **kredit billing per-user**
(`consumeCreditsInternal`), sedangkan jalur cron memakai jalur "service" tanpa
kredit user — hanya dibatasi rate-bucket global.

## 4. Rate-limit di aplikasi (`limits.ts`)

Bucket global jalur cron/service (`@convex-dev/rate-limiter`):

| Bucket | Rate | Provider |
|---|---|---|
| `openAlexSearchGlobal` | 30 / menit | OpenAlex |
| `googleFactCheckGlobal` | 30 / menit | Google Fact Check |
| `crossrefLookupGlobal` | 30 / menit | Crossref |
| `gdeltGlobal` | 12 / menit (+ jeda manual 5,2 dtk antar seed) | GDELT |
| `exaSearchGlobal` | **6 / menit** | Exa (cron) |
| `arxivSearchGlobal` | **1 / 3 detik** (fixed window) | arXiv |

Bucket per-user (jalur on-demand): `exaSearchPerUser` 10/mnt,
`jinaSearchPerUser` 8/mnt, `jinaReadPerUser` 12/mnt, `externalSearchPerUser`
20/mnt.

## 5. Klasifikasi: berbayar (butuh billing terpisah) vs gratis

### 🔴 Berbayar — butuh akun + billing tersendiri

| API | Env key | Catatan biaya | Limit di app |
|---|---|---|---|
| **Exa** | `EXA_API_KEY` | Berbayar per-pencarian (kode eksplisit menandai "Exa is paid"). Tanpa key → `getExaClient()` return `null` dan lane berita kosong (degrade halus). | Sengaja dibatasi kecil: **6/menit** (cron) & cadence rendah (12 jam) + cap 12 item, untuk menekan biaya. |
| **LLM gateway** (OpenAI-compatible, default `gpt-5.4-mini`) | `AQSHA_CHAT_API_KEY` / `OPENAI_API_KEY` | Berbayar per-token. Dipakai backfill terjemahan (cron) + konsensus/ide/relevansi/glossary (on-demand, kena kredit user). | Dijaga `globalTokenUsage` 100k token/menit; kuota nyata = kredit plan per-user. |
| **Jina — rerank** *(catatan: bukan jalur Explore)* | `JINA_API_KEY` (`Authorization: Bearer`) | Endpoint `api.jina.ai/v1/rerank` berbayar & wajib key. **Tidak** dipanggil dari Explore — hanya dipakai pipeline pencarian agen. | `jinaRerankPerUser` 12/mnt |

### 🟡 Gratis tetapi limit sangat kecil — perlu hati-hati saat scaling

| API | Env key | Limit asli provider | Bagaimana app menanganinya |
|---|---|---|---|
| **GDELT DOC 2.0** | — (keyless) | **~1 request / 5 detik per IP**. Saat dilampaui, GDELT membalas teks peringatan (bukan JSON). | Cron harian, seed dibatasi 8 topik, jeda manual **5,2 dtk** antar request, hasil kosong tidak di-cache (retry run berikutnya). |
| **arXiv** | — (keyless) | Disarankan **1 request / 3 detik**. | Bucket `arxivSearchGlobal` fixed window **1/3 dtk**. Hanya dipakai sebagai *fallback* di `searchPapers` (on-demand). |

### 🟢 Gratis & limit nyaman

| API | Env key | Catatan |
|---|---|---|
| **OpenAlex** | `OPENALEX_API_KEY` | API gratis; key dipakai untuk authenticated/polite pool (limit sangat besar, ~100k req/hari). Throttle app 30/menit. |
| **Google Fact Check Tools** | `GOOGLE_FACTCHECK_API_KEY` | API key Google **gratis** (bukan billing terpisah). Kuota harian gratis cukup untuk cadence 24 jam + 24h cache. |
| **Crossref** | `CROSSREF_MAILTO` (opsional, polite pool) | Gratis, keyless. Hanya fallback DOI. |
| **Scrape halaman publisher** | — | HTTP `fetch` langsung ke situs berita/cek-fakta untuk og:image + body. Gratis; timeout 7 dtk, best-effort. |

### Ringkasan satu kalimat

- **Wajib billing terpisah:** **Exa** (berbayar, limit ketat) dan **LLM gateway**
  (berbayar per-token). Keduanya yang paling sensitif biaya.
- **Gratis tapi limit sangat kecil (rawan throttle):** **GDELT** (~1/5 dtk) dan
  **arXiv** (1/3 dtk) — sudah ditangani lewat jeda + cadence rendah + cache.
- **Gratis dan aman:** **OpenAlex**, **Google Fact Check**, **Crossref**, serta
  scrape halaman publisher.

## 6. Tabel cadence cron (jawaban "tiap berapa lama")

| Cron job | Provider | Interval |
|---|---|---|
| `feed:trending-papers` | OpenAlex | tiap **8 jam** |
| `feed:science-news` | Exa (+ scrape) | tiap **12 jam** |
| `feed:gdelt-topics` | GDELT | tiap **24 jam** |
| `feed:factcheck-claims` | Google Fact Check (+ OpenAlex + scrape) | tiap **24 jam** |
| `feed:backfill-id` | LLM (terjemahan) | tiap **6 jam** |

## 7. Catatan minor (bukan bug fungsional)

- Komentar di `feed.ts:847` menulis "no more than 2 of the same kind
  consecutively", padahal implementasi `deClump()` melarang **dua** item kind
  yang sama berurutan (alternasi ketat, maksimal 1 berturut). Layak dirapikan
  agar komentar sesuai perilaku.
- Halaman detail (`reader-actions.tsx`) memakai mutation legacy
  `api.feed.saveItem`, sedangkan feed Discovery memakai
  `api.feed.saveDiscoveryItem` (unified). Tidak salah, hanya dua jalur simpan.
- `fetchArticlePreview` bukan panggilan ke API content-extraction pihak ketiga
  (mis. Jina) — ia `fetch` langsung halaman publisher lalu parse HTML lokal.
</content>
</invoke>
