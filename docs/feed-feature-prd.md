# PRD — Fitur "Feed" Aqsha

> Dokumen produk + rencana teknis. Riset & rasional: `docs/feed-feature-research.md`. Mockup visual: `docs/mockups/feed-mockup.html`.
> Status: draft untuk implementasi. Tanggal: 2026-06-06.

## 1. Ringkasan & tujuan

Tambahkan halaman **Feed** (`/app/feed`) sejajar Explore yang mengubah Aqsha dari "alat mengerjakan riset" menjadi juga **"tempat menemukan ide riset"**. Feed memadukan tiga lajur konten dalam satu grid mixed-media, dengan satu CTA inti: **"Teliti ini"** yang men-seed thread riset.

**Tujuan utama (job-to-be-done):** membawa user dari *"belum tahu mau meneliti apa"* → pertanyaan/thread riset konkret.

**Metrik sukses (usulan):**
- Primer: **% item feed yang dikonversi jadi thread riset** ("Teliti ini" / idea-generator) per pengguna aktif.
- Sekunder: item disimpan/koleksi per user; retensi mingguan; rasio "selesai baca (caught-up)" vs scroll tanpa aksi.
- **Bukan** dwell-time / panjang sesi (sengaja, agar tidak mengarah ke doomscroll — lihat riset §9).

## 2. Audiens & prinsip non-negosiabel

- **Audiens:** Indonesia-first (berita & cek-fakta lokal), paper akademik tetap global.
- **P1 — Jangan auto-melabeli "hoax".** Verdict badge hanya dari pemeriksa fakta manusia (ClaimReview/Mafindo) atau setelah HITL. Klaim hasil AI default ke `needs_context`/`unverified`.
- **P2 — Bukti dulu, bukan label telanjang.** Setiap verdict tampilkan kalimat bukti + sumber + penjelasan + tanggal + provenance.
- **P3 — Desain tenang & berbatas.** Optimalkan konversi inspirasi→riset, bukan dwell-time. Ada penanda "Kamu sudah update", tanpa infinite scroll murni.
  > **Revisi (2026-06-17, Explore revamp D1 — `docs/explore-revamp-plan.md` Isu 5):** keputusan owner **membalik** "tanpa infinite scroll murni" → feed Jelajahi kini memakai **infinite scroll otomatis** (IntersectionObserver). Penanda "Kamu sudah update" + empty-state dipertahankan sebagai batas; tombol "Tampilkan lebih" dihapus.
- **P4 — Reuse, jangan duplikasi.** Bangun di atas `explore`, `citationChecks` (taksonomi), provider+cache eksternal, runtime agent, dan flow `startThread` yang sudah ada.

## 3. Cakupan MVP

**In:**
- Halaman `/app/feed` + nav sidebar, grid bento mixed-media.
- Lajur A: trending paper (OpenAlex) + berita sains (Exa news).
- Lajur B: klaim viral **sains + kesehatan saja**, badge fakta/hoax **agregasi verdict manusia** (Google Fact Check API `languageCode=id`).
- Lajur C: topik naik daun (GDELT) + **generator pertanyaan riset (RAG + HITL)** — *masuk MVP*.
- Aksi per item: **Teliti ini**, **simpan/koleksi**, **lihat bukti & sumber**.
- Onboarding interest ringan + label "kenapa ini muncul".

**Out (v2+):** scam/penipuan & program pemerintah di lajur B; verdict AI-assisted untuk klaim tanpa ClaimReview; grounding GARUDA/SINTA; mini-graph paper terkait penuh (peta sitasi visual); berbagi/diskusi tim; lapor-klaim WhatsApp; ingestion langsung Mafindo via Yudistira API.

### 3b. Fitur v1 terkunci (hasil brainstorm berbasis riset — lihat `docs/feed-feature-catalog.md`)

Di atas inti, **semua** ini masuk v1 (dipilih karena bukti terkuat & paling melayani tujuan "menemukan ide"). Setiap fitur + pendekatan reuse:

| Fitur | Pendekatan / reuse |
|---|---|
| **"Kenapa relevan untukmu"** (konteks LLM per-item) | `astraLite.generateObject` digrounding ke `userFeedInterests` + item; cache per-user. Pembeda triase teratas (PaperWeaver). |
| **Gap-finder + FINER** | Perluas `feed/ideaGenerator.ts`: ekstrak "future research/limitations" review/meta + tandai jenis gap (geografis/temporal/populasi/metodologis/integrasi/**context gap**) → cek FINER. Reuse `searchWeb`/`lookupDoi`. |
| **Flag retraksi / disputed + tally supporting/contrasting** | Field baru `retractionStatus`+`stanceTally` di `feedItems`/`feedItemClaims`. v1: badge scite embed (gratis, by DOI) + Crossref `update-to` untuk retraksi; classifier sendiri ditunda. |
| **Lajur serendipity (toggle)** | `getFeed` sisakan N slot item topik bersebelahan (overlap minat rendah, jarak topik tinggi). v1 sederhana: ambil dari topik adjacent minat user. Toggle di toolbar. |
| **Verdict berjenjang + "perlu konteks" + provenance** | Sudah di model verdict; tampilkan `verdictSource`/`publisher`/`reviewedAt` → **menyambung `hitlProvenance.ts`**. |
| **Consensus meter (Ya/Tidak/Mungkin)** | Subtipe klaim "pertanyaan ya/tidak"; agregasi stance paper (reuse pola `citationChecks`); **selalu tampilkan paper di bawah meter** (klasifikasi stance rawan → jangan meter telanjang). |
| **Skim aids: TL;DR 1-kalimat + warna relevansi** | `tldr` di `feedItems` (LLM, cache); `relevanceScore` per-user → encoding warna header (Scholar Inbox). Murah, berdampak. |
| **Lapisan Bahasa Indonesia** | Field bilingual (`tldrId`, judul/abstrak ringkas ID) + glosarium istilah (tooltip LLM) + toggle. Reuse `astraLite`. Pembeda pasar terkuat. |

**Urutan build dalam v1 (gelombang, tiap gelombang bisa dikirim):**
1. **Loop inti** — feed page + lajur paper (OpenAlex) + Teliti ini + simpan + "kenapa ini muncul" + **TL;DR & warna relevansi** + evidence drawer.
2. **Kepercayaan** — lajur klaim + **verdict berjenjang/perlu-konteks/provenance** (`hitlProvenance`) + **flag retraksi/disputed**.
3. **Ideasi** — generator pertanyaan + **gap-finder + FINER** + **"kenapa relevan untukmu" (LLM)**.
4. **Kedalaman & lokal** — **consensus meter** + **lajur serendipity** + **lapisan Bahasa Indonesia**.

## 4. User stories utama

1. *Sebagai mahasiswa yang buntu ide*, aku buka Feed, melihat klaim viral kesehatan ber-badge "Perlu konteks", klik **Teliti ini**, dan langsung dapat thread riset yang sudah ter-seed.
2. *Sebagai pengguna kritis*, aku klik **Lihat bukti** pada sebuah klaim dan melihat kalimat bukti, level verdict, sumber pemeriksa, dan paper pendukung global.
3. *Sebagai peneliti awal*, aku menyimpan beberapa item ke koleksi "ide skripsi" dan feed-ku makin relevan.
4. *Sebagai pencari arah*, dari sebuah item aku minta **generator pertanyaan**, memilih/menyunting 1 dari 3 pertanyaan ber-skor novelty/feasibility, lalu mulai riset.

## 5. Model verdict & taksonomi badge (lajur B)

Reuse **semantik** tabel `citationChecks` (`supported / partially_supported / contradicted`), tambah dua state. Verdict utama = agregasi manusia (mapping dari `textualRating` ClaimReview).

| Badge (UI) | `feedVerdict` | Warna | Sumber |
|---|---|---|---|
| Terbukti | `supported` | hijau/mint | ClaimReview/konsensus |
| Sebagian benar | `partially_supported` | kuning/lemon | ClaimReview |
| Perlu konteks | `needs_context` (baru) | amber/coral | ClaimReview "Lacks context/Misleading" |
| Belum terverifikasi | `unverified` (baru) | abu netral | tidak ada verdict manusia |
| Keliru / Hoaks | `contradicted` (+`severity`) | oranye→merah | ClaimReview "False/Hoaks" |

Selalu simpan `verdictLabelRaw` (mis. "Hoaks"), `verdictSource`, `verdictBy:"human"`, `publisher`, `reviewUrl`, `claimReviewJson`, dan `supportingPaperKeys` (rujuk cache `explorePapers`). Detail penyajian (meter bukti + drawer) lihat mockup.

## 6. Arsitektur teknis (tertambat ke kode)

### 6.1 Temuan grounding penting
- **Belum ada cron** sama sekali (`convex.config.ts` hanya daftarkan agent/rag/rateLimiter/workflow/polar). Penjadwalan saat ini hanya `ctx.scheduler.runAfter`. Cron = mekanisme baru.
- **Fetch+cache eksternal terpusat** di `agent/externalProviders.ts` (Exa via `exa-js`, Crossref, arXiv, Jina) + `agent/openalexProvider.ts`, semua via `externalLookupCache` (`getCache`/`putCache`, TTL 24 jam) + rate limit `limitExternal`/`limitOpenAlex`.
- **"Teliti ini" sudah ada jalurnya:** `api.agent.messages.startThread({ content, agentKind:"pro", commandId:"deep-research", workspaceId })` (`agent/messages.ts:533`) → `promptExecutionKindForCommand("deep-research")==="deep_research"` → `internal.agent.deepResearch.startForMessage` (workflow durable). **Tanpa kode agent/workflow baru.**
- **Verdict engine** = `citationChecks` (`schema.ts:660`) — reuse taksonomi saja (terikat `artifactId`/`runId`, jadi feed butuh tabel klaim sendiri).
- **Konvensi frontend:** route = server component cek `isAuthenticated()` → render `features/<x>/pages/*` dibungkus `WorkspaceShell`; data via `useConvexQueryData`/`useConvexActionState`/`useConvexMutationFn` (`lib/convex-query.ts`); error via `readableConvexErrorMessage`; ikon hanya `@aqsha/ui/icons`; `PrimaryNavLink` di `components/app-sidebar.tsx:209`.

### 6.2 Skema baru (gaya `schema.ts`)
File baru `feedValidators.ts` (mirror `exploreValidators.ts`) + tabel di `schema.ts`:
- `feedItems` — { kind(paper/news/claim/topic/idea), title, summary, url, imageUrl?, provider, sourceLabel, paperKey?(→explorePapers), doi?, topics[], trendScore, publishedAt?, dedupeKey, lastSeenAt, createdAt }. Index: `by_dedupe`, `by_kind_trend`, `by_kind_published`.
- `feedItemClaims` — { feedItemId, claim, verdict, verdictSource, verdictBy, verdictLabelRaw, publisher?, reviewUrl?, reviewedAt?, evidence?, confidence?, severity?, claimReviewJson?, supportingPaperKeys? }. Index `by_feed_item`.
- `feedSources` — { provider, label, enabled, cadenceMinutes, queryParamsJson?, lastRunAt?, lastStatus?, lastFailureReason? } (cadensi tunable tanpa redeploy).
- `feedCollections`, `savedFeedItems`, `userFeedInterests`, `feedInteractions(kind: save/hide/research/open_evidence)`.

**Reuse (tanpa duplikasi):** `externalLookupCache` (tambah literal provider `google_factcheck`, `gdelt` di `schema.ts:766` **dan** `agent/externalProviders.ts:30,78`), `explorePapers` (paper feed pakai pipeline OpenAlex→`candidatesToExplorePapers`→`upsertPaperCache`; `paperKey` menyambung ke `/app/explore/[paperRef]`), `citationChecks` (template taksonomi), `researchSources` (ditulis oleh deep-research run di hilir, bukan oleh feed).

### 6.3 Cron
File baru `convex/crons.ts` (auto-discovered, bukan komponen → tak perlu ubah `convex.config.ts`):
- `feed:trending-papers` tiap 8 jam → `internal.feed.refreshTrendingPapers` (OpenAlex murah).
- `feed:science-news` tiap 12 jam → `refreshScienceNews` (Exa mahal → cadensi rendah + cap hasil).
- `feed:gdelt-topics` harian → `refreshTrendingTopicsGdelt` (gratis, window 3 bulan).
- `feed:factcheck-claims` harian → `refreshFactCheckClaims` (`maxAgeDays` cukup harian).

Tiap handler = `internalAction` di `feed.ts` yang baca config `feedSources`, fetch via provider ter-cache, tulis `feedItems` via `internalMutation` (mirror `explore.searchPapers`→`upsert`).

### 6.4 Client eksternal baru
| Client | File | Mirror/reuse |
|---|---|---|
| OpenAlex trending | reuse `openalexProvider.ts` | `searchOpenAlexWorks` + `from_publication_date`(rolling ~90 hari) + `sort=cited_by_count:desc` |
| Exa news | reuse `externalProviders.ts` | `searchExaCandidates({category:"news", startPublishedDate})` |
| **Google Fact Check** (baru) | `agent/factCheckProvider.ts` | mirror `lookupDoiProvider`; `GET claims.search?languageCode=id&maxAgeDays=&key=GOOGLE_FACTCHECK_API_KEY`; map `textualRating`→`feedVerdict` |
| **GDELT DOC 2.0** (baru) | `agent/gdeltProvider.ts` | mirror `searchArxivProvider` (fetch+cache, no SDK); `mode=timelinevol&sourcecountry=ID&sourcelang=ind`; gratis |

Genuinely baru: **hanya Google Fact Check & GDELT.** Keduanya daftar bucket rate-limit baru di `limits.ts` (pola `openAlexSearchGlobal`).

### 6.5 "Teliti ini" & generator ide
- **`startResearchFromItem({ feedItemId })`** (mutation `feed.ts`): `requireCurrentUser` → susun seed `"{title}\n\n{summary}\n\nSumber:{url}"` (+abstrak jika `paperKey`) → reuse internal `startThread` (`createThread` + `savePromptAndScheduleRun`, `agentKind:"pro"`, `commandId:"deep-research"`) → catat `feedInteractions(kind:"research")` → return `{threadId}` → frontend `router.push('/app/threads/${threadId}')`. (Alternatif paling ringkas: frontend panggil `api.agent.messages.startThread` langsung; tetap disarankan mutation khusus agar logging+seed di server.)
- **Idea generator** (`feed/ideaGenerator.ts`, internalAction): grounding via `searchWebProvider`/`searchArxivProvider`/`lookupDoiProvider` → `astraPro` `generateObject` (zod: `{questions:[{question,methodology,rationale,noveltyScore,feasibilityScore,supportingSourceKeys}]}`), dedupe, **jangan biarkan model me-ranking dirinya**. HITL pilih/sunting via `askUser` + `needsApproval` (`hitlTools.ts`) → pertanyaan terpilih masuk jalur `startResearchFromItem`. Error via `throwAppError` (`lib/appError.ts`).

### 6.6 Frontend
- `apps/web/app/app/feed/page.tsx` (server, cek auth) → `features/feed/pages/feed-page.tsx` (client, `WorkspaceShell`).
- `features/feed/` mirror `features/explore/`: `components/` (kartu varian: paper, news, claim+badge, topic, idea; evidence drawer; save dialog reuse `WorkspacePickerDialog`), `api/use-feed-data.ts`.
- Sidebar: `PrimaryNavLink` baru setelah "Jelajahi" (`app-sidebar.tsx:209`), ikon dari `@aqsha/ui/icons`.
- Data via `useConvexQueryData(api.feed.getFeed,...)`, aksi via `useConvexMutationFn`/`useConvexActionState`. Layout bento (lihat mockup) + state "Kamu sudah update".

## 7. Rollout bertahap (tracer-bullet, tiap slice end-to-end)

- **Fase 0 — Enabler:** `crons.ts` (kosong/uji deploy) + `feedValidators.ts` + tabel schema + literal provider + export `@aqsha/convex/feed`.
- **Fase 1 — Lajur A paper:** `refreshTrendingPapers` + `getFeed` + halaman feed + nav. **Gate:** `/app/feed` menampilkan paper trending dalam kartu bento.
- **Fase 2 — "Teliti ini":** `startResearchFromItem` + tombol → thread + deep research jalan. **Gate: loop inti selesai.**
- **Fase 3 — Berita (Exa) + topik (GDELT):** `refreshScienceNews`, `refreshTrendingTopicsGdelt` + varian kartu.
- **Fase 4 — Lajur B cek fakta:** client Google Fact Check + `refreshFactCheckClaims` + kartu klaim + evidence drawer.
- **Fase 5 — Simpan/koleksi + interest + interaksi:** ranking `getFeed` faktorkan interest+interaksi; UI bookmark + onboarding + "kenapa ini muncul".
- **Fase 6 — Idea generator (RAG+HITL):** `ideaGenerator.ts` + aksi di drawer + question-picker → `startResearchFromItem`.

## 8. Env vars & dependensi baru
- `GOOGLE_FACTCHECK_API_KEY` (Google Cloud, gratis low-QPS). GDELT & OpenAlex tanpa key (set `OPENALEX_MAILTO` untuk polite pool jika belum). Tinjau cadensi Exa karena biaya.

## 9. Risiko & keputusan terbuka
1. **Mafindo/TurnBackHoax tanpa REST API publik** → MVP via Google Fact Check (`languageCode=id` menarik verdict Mafindo/CekFakta/Tempo); ajukan key Yudistira paralel untuk v2 (`verdictSource` siap).
2. **Biaya Exa** (Monitors $15/1k) → cadensi 12 jam, cap `numResults`, andalkan GDELT gratis untuk tren ID.
3. **Union `externalLookupCache.provider` dipakai bersama agent** → tambah literal di `schema.ts` **dan** `agent/externalProviders.ts` bersamaan (kalau tidak, codegen/typecheck pecah).
4. **Verdict AI = jangan jadi label keras di MVP** → `verdictBy:"human"` untuk badge tampil; klaim `aqsha_ai` default `needs_context`/`unverified` + wajib HITL.
5. **Rate-limit/billing pada fetch cron** → `limitExternal`/`limitOpenAlex` memotong kredit per-user; cron tak punya user → butuh service ownerUserId atau jalur cron yang skip `consumeCredits` tapi tetap pakai bucket global. **Putuskan sebelum Fase 1 backend.**
6. **Ranking/serendipity** → MVP cukup `trendScore`+recency+interest; model serendipity penuh ke v2.
7. **Doomscroll/biaya render bento** → feed berbatas ("Kamu sudah update" + "Tampilkan lebih"), bukan infinite scroll. _(Revisi 2026-06-17, Explore revamp D1: kini **infinite scroll otomatis** dengan batas "Kamu sudah update"/empty-state; tombol "Tampilkan lebih" dihapus.)_

## 10. Lampiran — file kunci
`packages/convex/convex/schema.ts` · `agent/externalProviders.ts` · `agent/openalexProvider.ts` · `agent/messages.ts` · `agent/researchTools.ts` · `agent/hitlTools.ts` · `agent/runtime.ts` · `explore.ts`/`exploreModel.ts`/`exploreValidators.ts` · `lib/appError.ts` · `apps/web/features/explore/` · `apps/web/components/app-sidebar.tsx` · `apps/web/lib/convex-query.ts`
