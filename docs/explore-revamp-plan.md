# Rencana Implementasi: Revamp Fitur Explore (Jelajahi)

> Status: **Fase 0–3 SELESAI & ter-commit** (Fase 0 `6e27a98`, Fase 1 `c9104d4`, Fase 2 `d427871`,
> Fase 3 Slice 5 `1a51d83`, Slice 6+7 backend `334e9dc` + frontend `89fa042`), gate hijau ·
> **hanya Fase 4 (Slice 8 Save-to-Workspace) tersisa**. Disusun 2026-06-16 dari riset codebase + eksternal
> (multi-agent) + review adversarial. Setiap klaim file:line di bawah sudah diverifikasi langsung terhadap
> kode, bukan asumsi.
> **Cakupan: 9 isu** — Bagian I (Isu 1–5: backend/feed — drop Exa, Google News RSS, interests, cron 3 jam,
> infinite scroll) + Bagian II (Isu 6–9: UI/UX — nav For You/Top/Topics, search global, Save-to-Workspace,
> Tanya Astra).

## Status implementasi (progress log)

| Fase | Status | Catatan |
|------|--------|---------|
| **Fase 0** (Slice 9, Tanya Astra) | ✅ **SELESAI** + commit `6e27a98` | Pure frontend. Gate: `typecheck` hijau (5 workspace); lint file tersentuh bersih (1 error sisa = `app-sidebar.tsx` `set-state-in-effect`, **pra-ada & di luar scope**). |
| **Fase 1** (Slice 1 + 2, lepas Exa + Google News) | ✅ **SELESAI** + commit `c9104d4` | Gate hijau: `typecheck` (5 workspace), convex test **159 pass** (4 file tes baru), `lint` (convex + file web tersentuh bersih), `convex dev --once` (schema additive + fungsi + cron tervalidasi). |
| **Fase 2** (Slice 3 + 4, hidrasi 3 jam + interest) | ✅ **SELESAI** + commit `d427871` | `hydrateCycle` orchestrator (5 lane staggered) menyerap `feed:google-news` + `enrichGoogleNewsArticles`; `feed/interestKeywords.ts` SSOT + `searchPapers` interest-seeded (cache-key isolated). Gate hijau: typecheck (5 ws), convex test 174 pass, lint, `convex dev --once`. Adversarial review (14 agen) → 4 temuan minor diperbaiki (read/write interest normalize, `openAlexRecommendationQuery` helper, action-level cache-isolation test). |
| **Fase 3** (Slice 5–7, infinite scroll + nav + search) | ✅ **SELESAI** (Slice 5 `1a51d83`, Slice 6+7 backend `334e9dc` + frontend `89fa042` + review-fix `f008e68`) | **Slice 5** infinite scroll (`orderAt` non-optional + `by_order` + `getFeedPaginated` + auto-scroll); review 8 temuan (guard wedge diperbaiki). **Slice 6** nav For You/Top/Topics + `topicCategories.ts` (5 kategori sains/kesehatan, Keputusan #7). **Slice 7** search global lintas-konten (`searchText`+searchIndex+`searchDiscovery`) + augment `searchPapers` live (Keputusan #8). **Review adversarial Slice 6+7 → 14 temuan (3 major/6 minor/5 nit), semua aksiyonabel diperbaiki `f008e68`** (overlay gating, search mobile, fromYear publishedAt-only, Google News searchText recompute, Topics stranding → tombol manual, defer external papers, strip payload). Gate hijau: typecheck (5 ws), convex test **183 pass**, lint, `convex dev --once`, React Doctor. Sisa owner: verifikasi UI manual + `convex deploy` prod (schema-dulu) + push. |
| **Fase 4** (Slice 8, Save-to-Workspace) | ⬜ belum | — |

### Yang dikerjakan di Fase 0 (2026-06-17)

**Slice 9 — Tanya Astra (Isu 9), pure frontend:**
- **Copy** "Teliti …" → **"Tanya Astra"** di 5 lokasi: `discovery-list-item.tsx` (tombol), `discovery-item-card.tsx`
  (dropdown), `idea-dialog.tsx` (tombol "Teliti pertanyaan ini"), + prop `askLabel` di `fact-detail-page.tsx`
  & `news-detail-page.tsx`.
- **Ikon** `SparklesIcon` → **`MessageSquareIcon`** (`Message01Icon`) **hanya** di action ask-Astra (4 file:
  `discovery-list-item.tsx`, `discovery-item-card.tsx`, `idea-dialog.tsx`, `reader-actions.tsx`).
- **Rename (code-org, Keputusan Terbuka #12 default)**: handler `onTeliti` → `onAskAstra`
  (`DiscoveryCardHandlers` + 4 call-site) dan prop `researchLabel` → `askLabel` (`ReaderActions` + 2 call-site).
  `typecheck` hijau = semua call-site konsisten.
- **Cleanup**: hapus import mati `buildSourceLine` di `discovery-item-card.tsx` (clear 1 warning lint di file
  tersentuh).

**Penyimpangan dari rencana (disengaja):** rencana mendaftar `discovery-page.tsx:499` di daftar ganti-ikon,
tetapi `SparklesIcon` di sana sebenarnya **dekorasi empty-state** ("Belum ada item"), **bukan** action ask-Astra
→ dibiarkan, sesuai prinsip "ganti ikon HANYA di action ask-Astra". Sparkles dekoratif lain juga dibiarkan:
`discovery-aside.tsx` ("Sedang ramai"), `reader-bits.tsx` ("Bacaan terkait"), `onboarding-steps.tsx`.

**Langkah owner tersisa (Fase 0):** verifikasi manual UI (tombol Tanya Astra di kartu feed, dropdown, dialog
ide, reader paper/berita/fakta) + commit (masih di working tree branch `development`).

### Yang dikerjakan di Fase 1 (2026-06-17)

**Slice 1 — Cutover berita Exa→Google News (Isu 1a + Isu 2):**
- BARU `feed/providers/googleNews.ts` (fetch RSS ter-cache + helper murni `parseGoogleNewsRss`/`dedupeGoogleNewsItems`/`buildGoogleNewsFeedItems`) dan `feed/providers/googleNewsDecode.ts` (`resolvePublisherUrl` best-effort + `parseBatchExecuteUrl` murni).
- `feed/sources.ts`: `refreshScienceNews` → `refreshGoogleNews` (seed search + topic SCIENCE/HEALTH, jeda sopan) + `enrichGoogleNewsArticles` (konvergen, lihat catatan review) + `purgeLegacyExaNews` (paginated, dipanggil owner; **tidak** di-cron).
- Validator additive: literal `google_news` di **4 lokasi** (`feedProviderValidator`, `externalLookupCache.provider` inline di schema.ts, `Provider` type + `providerValidator` di providerCache.ts); field optional additive `resolvedUrl` **dan** `enrichAttempts` di `feedItemFields`.
- `feed/providers/news.ts` DIHAPUS; cron `feed:science-news` → `feed:google-news` (3h sementara); `feed/bahasa.ts` perlakukan `google_news` sebagai ID-native; reader (`news-detail-page.tsx`) + dua call-site seed riset lain (`discovery-page.tsx`, `home-explore-bento.tsx`) pakai `resolvedUrl ?? url`.

**Slice 2 — Hapus Exa fallback explore + ingest (Isu 1b + 1c):**
- `explore.ts` rantai jadi OpenAlex→arXiv→Jina→Crossref; `papers/ingest/ingest.ts` crawl Jina-only. Exa tetap agent-only; semua literal `Exa`/`exa`/`exa_news` dipertahankan (additive) + ada test backward-compat `getPaper` baca row `provider:"Exa"`.

**Tes baru:** `googleNewsParse.test.ts`, `googleNewsDecode.test.ts`, `feedGoogleNews.test.ts`, `exploreExaBackcompat.test.ts` (+ fix fixture `exa`→`openalex` di `exploreModel.test.ts`).

### Temuan empiris (gate pra-implementasi) — penting

- **robots.txt**: `news.google.com/robots.txt` `User-agent: *` = `Disallow: /` dengan allow-list yang **tidak** memuat `/rss`; bot AI (`ClaudeBot`, `anthropic-ai`, dst.) `Disallow: /` penuh. Ini area abu-abu ToS yang sudah diterima owner (pilih Google News RSS). Mitigasi terpasang: UA browser, volume rendah (~8×/hari/seed), jeda 1–2 dtk, headline-only.
- **URL decode rapuh (terbukti)**: format `CBMi…` terkini **tidak** 302-redirect ke publisher dan **tidak** mengekspos signature `data-n-a-sg`/`data-n-a-ts` di interstitial → `resolvePublisherUrl` mayoritas mengembalikan `null` sekarang. Lane tetap jalan (nama publisher di kartu + link redirect tetap resolve di browser user); `articleText` terisi hanya saat format mengizinkan. Terkait Keputusan Terbuka #6 (cadence enrichment vs resolve on-detail-open).

### Review adversarial Fase 1 → 6 bug ditemukan + diperbaiki

1. **Enrichment non-konvergen** — predikat `articleText===undefined` membuat baris tak-ter-resolve di-hit ulang ke Google/publisher tiap siklus selamanya → tambah field `enrichAttempts` + `MAX_ENRICH_ATTEMPTS=2`, mutation selalu mencatat percobaan.
2. **`offGoogleUrl`** menerima host google non-news (consent/accounts/sorry) sebagai URL publisher → tolak semua `*.google.*` (`isGoogleHost`).
3. & 4. **Parity seed riset** — `discovery-page.tsx` buildSeed + `home-explore-bento.tsx` onTeliti masih kirim redirect opaque → kini `resolvedUrl ?? url`.
5. **`<title>` numerik** ter-drop (parser jadikan number) → stringify.
6. **Dedup over-merge** baris guid berbeda berjudul sama tanpa domain → secondary key hanya saat domain ada.

### Penyimpangan dari rencana (disengaja)

- **Isu 2e dimajukan**: `google_news` ditambahkan ke `ID_NATIVE_PROVIDERS` (`bahasa.ts`) **sekarang** (rencana menunda sampai lajur translasi dimatikan di Slice 4). Alasan: di Fase 1, cron `feed:backfill-id` **masih aktif**, jadi tanpa ini berita Google (sudah `hl=id`) akan diterjemahkan LLM ID→ID (boros). Aman setelah Slice 4.
- **Enrichment di-self-schedule** dari `refreshGoogleNews` (`runAfter 30s`, batch kecil) supaya Fase 1 mandiri; Slice 4 akan memindahnya ke orchestrator (komentar penanda sudah ada di kode).
- **`summary=""`** awal untuk item Google News (deskripsi RSS = judul+publisher, tak berguna); enrichment mengisi `summary`/`tldr`/`articleText` dari artikel publisher ter-resolve.

### Langkah owner yang tersisa (Fase 1)

1. `convex deploy` **prod** (schema additive + fungsi + cron — aman, additive).
2. Jalankan `internal.feed.sources.purgeLegacyExaNews` **sekali** (paginated, self-continuation) untuk bersihkan row `exa_news` lama.
3. E2E manual: feed Jelajahi (lane berita Google News), buka detail berita, `/deep`/Tanya Astra dari item berita.
4. Belum di-commit — semua perubahan masih di working tree branch `development`.

### Yang dikerjakan di Fase 2 (2026-06-17, commit `d427871`)

**Slice 3 — Interest-aware search + taksonomi SSOT (Isu 3):**
- BARU `feed/interestKeywords.ts` = **single source of truth** taksonomi minat (`INTEREST_FIELD_TOPICS` 15
  field, `normalizeInterestTopic`, `isInterestFieldId`, `topicsForInterestFields`). `onboarding.ts`
  konsumsi SSOT (hapus `INTEREST_FIELDS` dup lokal).
- `explore.searchPapers`: arg opsional `interestSeed` (default true). Recommendations (query kosong)
  meng-seed `providerQuery`/`openAlexQuery` dari `internal.feed.userInterestTopics` (top minat user).
  **Seed dilipat ke explore cache key** (`exploreCacheKey` dapat `seed?`) → feed personal tak bocor
  lintas-user; cold-start (tanpa minat) tetap pakai key generik + OpenAlex trending. Helper murni baru
  di `explore/model.ts`: `recommendationProviderQuery` + `openAlexRecommendationQuery`.
- Normalisasi end-to-end: `userInterestTopics` normalize+dedupe **on read**, `bumpInterests` +
  `seedFeedInterests` lowercase-trim **on write** (cegah varian kapital "Kecerdasan Buatan" bocor ke
  provider berbahasa Inggris).

**Slice 4 — Konsolidasi cron 3 jam (Isu 4):**
- BARU `internal.feed.hydrateCycle` (internalAction): jadwalkan 5 lane via `scheduler.runAfter` staggered
  (papers@0, GDELT@20m, Google News@40m, factcheck@60m, enrich@100m), tanpa `await`, **tanpa**
  `backfillIndonesian`. `crons.ts`: 5 cron feed → satu `feed:hydrate-cycle` @3h; `agent:watchdog` tetap.
- `refreshGoogleNews` tak lagi self-schedule enrichment (orchestrator yang atur cadence).

**Tes baru:** `feedInterest.test.ts`, `feedHydrate.test.ts`, `exploreRecommendations.test.ts` (action-level
cross-user cache isolation), `exploreModel.test.ts` diperluas. Convex **174 pass**.

**Review adversarial (14 agen) → 4 temuan minor, semua diperbaiki:** (1) interest seed bawa topik
mixed-case/Indonesia ke provider → normalize read+write; (2) tak ada tes isolasi cache lintas-user →
tambah `exploreRecommendations.test.ts`; (3) komposisi `openAlexQuery` tak ter-tes → ekstrak helper murni
+ unit test; (4) komentar `interests.ts` overstate → diselesaikan oleh normalize write-side.

**Gotcha terkonfirmasi:** `user._id` === `identity.tokenIdentifier` di query, mutation, **dan** action
(`currentUserFromDoc` mengembalikan `_id: ownerUserId`; `currentUserFromIdentity` mengembalikan
`_id: tokenIdentifier`). `userFeedInterests` ber-key tokenIdentifier di mana-mana → interest-read di jalur
action (searchPapers) benar.

**Langkah owner tersisa (Fase 2):** `convex deploy` **prod** (pure cron/function refactor, tanpa perubahan
schema) supaya `feed:hydrate-cycle` + `hydrateCycle` menggantikan cron lama.

### Yang dikerjakan di Fase 3 Slice 5 (2026-06-17, uncommitted)

**Slice 5 — Infinite scroll (Isu 5):**
- **Schema (D-greenfield):** `feedItems.orderAt: v.number()` **non-optional** + index `by_order ["orderAt"]`.
  `deriveOrderAt = publishedAt ?? lastSeenAt ?? createdAt` (`feed/model.ts`), di-inject di **3 insert/patch
  site** (`upsertFeedItems` insert+patch, `ensureFeedItemForPaperKey`, `claims.upsertClaimItems`
  insert+patch). Builder/provider **tak disentuh** — typecheck menegakkan kewajiban field di tiap insert.
- **Query baru** `feed.getFeedPaginated(paginationOpts, kinds?)`: paginate `by_order` desc, filter
  hidden+kinds **post-paginate**, reorder interest-aware **per-page**. `returns` di-omit (shape mapped,
  per AGENTS.md, seperti `getFeed`).
- **Frontend:** `useConvexPaginatedQueryData` (re-export `usePaginatedQuery`) di `convex-query.ts` =
  satu-satunya penyentuh adapter paginated. `discovery-page.tsx` Brief → auto infinite scroll
  (IntersectionObserver, `rootMargin:600px`) + state lengkap (LoadingFirstPage→overlay, Exhausted+kosong→
  empty-state, Exhausted+isi→"Kamu sudah update", CanLoadMore→sentinel, LoadingMore→footer). Guard
  `MAX_AUTO_LOADS=4` (reset saat hasil bertambah) cegah loop page-shrink akibat filter hidden lokal. Aside
  baca `getFeed(limit:30)` terpisah supaya rail tak goyang tiap loadMore. Papers view tak berubah.
- **Migrasi dev (TIDAK di-commit):** karena dev punya 132 row lama tanpa `orderAt`, dilakukan
  widen→backfill→narrow manual (schema optional sementara + throwaway `backfillOrderAtDev` → run → narrow).
  Kode backfill **sengaja tak masuk diff** (prod greenfield dapat field non-optional langsung).
- **Tes baru** `feedPaginated.test.ts`: kontinuitas pagination (tanpa drop/dup), item **tanpa
  `publishedAt` tetap muncul** (via `orderAt`), filter `kinds`, exclude hidden, reorder interest per-page.
- **Dokumentasi (wajib D1):** `feed-feature-prd.md` (P3 + risiko #7) + `feed-feature-research.md`
  (§anti-doomscroll) dicatat pembalikan: kini infinite scroll otomatis, "Tampilkan lebih" dihapus.

**Gate hijau:** typecheck (5 ws), convex **178 pass**, lint (convex bersih; app sama dgn baseline — 1 error
pra-ada `app-sidebar.tsx`), `convex dev --once` (orderAt non-optional + `by_order` ter-push setelah backfill dev).

**Langkah owner tersisa (Slice 5):**
1. Verifikasi UI manual (scroll Brief→auto-load→"Kamu sudah update"; feed kosong→empty-state; tab Papers
   tak berubah).
2. **`convex deploy` prod — PRA-SYARAT KRITIS (review #1, major):** `orderAt` non-optional. Konfirmasi
   `feedItems` prod **kosong** dulu (dashboard row count / `mcp convex tables`). **Jika ada baris lama →
   JANGAN deploy field non-optional langsung** (push akan **gagal** "Schema validation failed … missing
   field orderAt", bukan sekadar drop dari index). Lakukan widen→backfill→narrow: (a) `orderAt` jadi
   `v.optional` → deploy → (b) backfill semua baris `orderAt = deriveOrderAt(row)` via paginated
   internalMutation + `scheduler.runAfter` → (c) narrow ke `v.number()` → deploy. (Persis yang sudah
   dilakukan manual di dev.) Lalu deploy frontend.
3. Commit.

**Review adversarial Slice 5 (12 agen) → 8 temuan (1 major, 5 minor, 2 nit). Ditindaklanjuti:**
- **#1 (major, deploy precondition)** → bukan perubahan kode; diperkuat di langkah owner #2 di atas.
- **#2/#3/#6/#8 (guard auto-load)** → **diperbaiki**: budget di-reset saat ganti view (Papers↔Brief =
  jalur recovery) + logika growth/shrink dipindah ke callback observer (refs-only, lint-safe, reactive-safe);
  wedge tak lagi permanen (self-heal saat feed tumbuh / toggle view).
- **#5 (tes orderAt refresh on re-upsert)** → **ditambah** tes di `feedPaginated.test.ts` (lewat
  `upsertFeedItems`, bukan insert langsung).
- **#7 (nit `?? createdAt` mati)** & **#4 (tes hidden lintas-cursor, redundan dgn tes kinds)** →
  di-skip sengaja (defensif tak berbahaya / sudah ter-cover).

### Yang dikerjakan di Fase 3 Slice 6+7 (2026-06-17, backend `334e9dc` + frontend `89fa042` + review-fix `f008e68`)

**Keputusan owner:** Topics = **sains/kesehatan-adapted** (bukan berita-umum #7); search = `feedItems`
searchIndex **+ augment `searchPapers` live** (#8). `searchText` optional/additive (greenfield, tanpa backfill).

**Slice 6 — nav For You/Top/Topics (Isu 6):**
- `getFeedPaginated` + arg `mode` (`foryou`/`top`/`topics`) + `topic`. `foryou` = komposit interest
  (default); `top` = popularity + recency floor **tanpa interest**; `topics` = filter kategori lalu rank
  foryou-style (filter post-paginate).
- BARU `feed/topicCategories.ts`: 5 kategori (Sains & Teknologi, Kesehatan, Lingkungan, Sosial & Ekonomi,
  Pendidikan) + `matchesTopicCategory` keyword sets; re-export via `@aqsha/convex/feed` (SSOT nav).
- Frontend: `use-discovery-nav` view→mode (nuqs, default foryou) + `topic` nullable + back-compat `?view=`
  diabaikan; `DiscoveryModeNav` (Topics = popover) + `discovery-aside` mode-aware. Tab Papers dihapus.

**Slice 7 — search global lintas-konten (Isu 7):**
- `feedItems.searchText` (optional) = `deriveSearchText(title+summary+topics)` + searchIndex `search_text`
  (filterFields kind), di-inject di 3 write path. `feed.searchDiscovery` (paginated, relevance order,
  filter kind/fromYear/hidden post-fetch).
- Frontend: search + filter pindah ke header kanan (slot `headerRight` baru di ExploreChatShell/Header);
  `DiscoveryToolbar` dihapus. Query non-kosong → `searchDiscovery` (paginated) **digabung** `searchPapers`
  live (dedup paperKey via Set) + header "Hasil untuk …". `discovery-page` di-rework: satu `activeFeed`
  (mode feed vs search) menggerakkan state-machine auto-scroll bersama; budget reset on `feedSessionKey`.

**Tes:** `feedPaginated.test.ts` +4 (mode=top abaikan interest, mode=topics filter kategori, searchDiscovery
match/kind/fromYear/hidden + blank). Convex **183 pass**.

**Gate hijau:** typecheck (5 ws), convex 183, lint (convex bersih; app baseline), `convex dev --once`
(searchText + searchIndex + mode/topic ter-push, additive aman), **React Doctor** (lolos setelah dedup
O(n²)→Set diperbaiki).

**Review adversarial Slice 6+7 (pipeline review→verify) → 14 temuan (3 major, 6 minor, 5 nit), semua yang
aksiyonabel diperbaiki di `f008e68`:**
- **#2 (major):** overlay full-area search di-gate **hanya** pada first-page index (`feedStatus ===
  "LoadingFirstPage"`); pass `searchPapers` live tak lagi memblank hasil index yang sudah dimuat. Empty-state
  ditambah guard `!externalPending`.
- **#3 (major):** input search global tak terjangkau di mobile (`hidden … sm:block`) → selalu tampil
  (`w-[150px] sm:w-[220px]`).
- **#1/#4 (major):** `patchGoogleNewsEnrichment` me-recompute `searchText` saat body lead masuk — row
  Google News ingest dgn summary kosong jadi tersearch setelah enrichment (dulu hanya title+topics).
- **#7 (minor):** `searchDiscovery.fromYear` bound pada `publishedAt` **saja** (bukan fallback `orderAt`)
  — item undated yang baru di-ingest tak lagi lolos filter "since 20XX" via waktu ingest.
- **#8 (minor):** `shapeFeedItem` strip `searchText`+`orderAt` dari payload klien (bloat tiap halaman).
- **#9 (minor):** tombol manual "Muat lebih banyak" di `CanLoadMore` — view Topics yg post-filter-nya
  membuang seluruh halaman tak lagi men-strand user; kedua footer feed disatukan ke `FeedFooter`.
- **#12 (minor):** external papers ditunda sampai index search exhausted (dedup stabil, tak reshuffle).
- **#5/#6 (nit):** keyword over-match `"mental"`/`"law"` diganti stem disambiguasi; **#13 (nit):** docstring
  `discovery-aside` di-refresh (For You/Top/Topics, bukan Brief/Papers).
- **Ditunda (terdokumentasi):** #10 (titleId Indonesia di searchText — laten), #11 (overlay saat ganti
  range — poles pre-existing), #14 (urutan deploy — sudah terdokumentasi).
- **Tes baru:** recompute `searchText` enrichment (`feedGoogleNews.test.ts`) + regresi `fromYear`
  publishedAt-only (`feedPaginated.test.ts`). Gate hijau: typecheck (5 ws), convex **183 pass**, app lint
  bersih utk file tersentuh, `convex dev --once`, **React Doctor lolos** (setelah `FeedFooter` di-refactor
  buang ref-as-prop + inline-JSX-as-prop).

**Langkah owner tersisa:** verifikasi UI manual (nav For You/Top/Topics, popover Topics, search lintas-konten
+ augment paper, clear search, **tombol Muat lebih banyak di Topics**, **search mobile**); `convex deploy`
**prod** (schema-dulu: `searchText`/`search_text` additive, aman walau ada row lama — row lama tak tersearch
sampai re-upsert); push.

## Ringkasan eksekutif

Lima isu yang saling bertaut, tetapi bisa di-ship sebagai slice independen:

1. **Hapus Exa dari surface explore/feed** — Exa berbayar. Saat ini dipakai di tiga jalur explore/feed:
   cron `feed:science-news` (`feed/providers/news.ts`), fallback pencarian paper (`explore.ts`), dan
   crawler URL fallback di ingest (`papers/ingest/ingest.ts`). Exa **tetap** untuk AI agent
   (`agent/providers/externalProviders.ts` + `apps/agents`).
2. **Google News RSS sebagai sumber berita** — gantikan lane berita Exa dengan Google News RSS (gratis),
   di-parse `fast-xml-parser` (sudah terpasang, jalan di V8 isolate Convex). Decode URL redirect Google
   News dilakukan **lazy/best-effort**, bukan blocking pipeline.
3. **Feed explore menghormati interest user** — `userFeedInterests` + scoring interest di `getFeed`
   sudah ada; gap-nya: pencarian Explore (`searchPapers`) belum interest-aware, dan ranking interest
   harus dipertahankan setelah pindah ke paginated.
4. **Konsolidasi hidrasi/cron explore ke tiap 3 jam** — 5 cron feed (8h/24h/24h/12h/6h) → satu parent
   cron 3 jam yang men-`scheduler.runAfter` tiap child dengan stagger (anti thundering-herd, hormati
   rate-limit per provider). `agent:watchdog` (5m) **tidak** tersentuh.
5. **Infinite scroll pada feed explore** — `getFeedPaginated` (`.paginate()` di atas index `orderAt`
   non-optional) + helper `useConvexPaginatedQueryData`, dipicu IntersectionObserver (auto-load).

Ditambah **empat isu UI/UX** (Isu 6–9, **Bagian II** di bawah) yang dispesifikasi owner dan dibangun di
atas feed terpadu dari Isu 1–5:

6. **Header nav Brief/Papers → For You | Top | Topics** (Topics = popover kategori); Papers **tidak**
   dihapus — digabung ke feed terpadu + hasil search.
7. **Search + filter dipindah ke header kanan atas, berlaku global** lintas-konten (paper + news + dll),
   di-rank best-match teratas.
8. **Ganti fitur "save" (bookmark) → Save to Workspace** (popover pilih workspace), dengan **ikon
   konsisten di seluruh app**.
9. **"Teliti klaim ini" → "Tanya Astra"** + ganti ikon `SparklesIcon` → Hugeicon lain.

Pendekatan: **backend-first per isu**, migrasi schema **additive saja** (tidak ada narrowing validator
di fase ini), setiap slice melewati gate `bun run typecheck` + `bun run lint` + convex tests +
`npx convex dev --once`, dan **deploy Convex (prod) mendahului deploy frontend** pada slice yang
menyentuh keduanya.

## Keputusan terkunci (dikonfirmasi owner, 2026-06-16)

| # | Keputusan | Konsekuensi |
|---|-----------|-------------|
| D1 | **Infinite scroll otomatis** (IntersectionObserver), bukan tombol "Tampilkan lebih". | **Membalik keputusan PRD P3 anti-doomscroll** (`feed-feature-prd.md:22,146`, `feed-feature-research.md:198-200`). Wajib update PRD agar dokumen konsisten — lihat Isu 5 + Tindakan dokumentasi. |
| D2 | **Pertahankan GDELT** berdampingan dengan Google News. | GDELT = lane `kind="topic"` (sparkline volume); Google News = lane `kind="news"`. Keduanya tetap di orchestrator cron + validator. |
| D3 | **Hapus Exa dari ingest** (`papers/ingest`) juga. | Ingest URL crawl jadi **Jina-only**. Sesuai prinsip "Exa hanya untuk AI agent". |
| D4 | Nav header = **For You \| Top \| Topics**; Topics = popover `[Tech & Science, Business, Arts & Culture, Sports, Entertainment]`. **Tab Papers dihapus**; paper tetap muncul di feed (kind=paper) + hasil search. | Ganti `nav.view` (brief/papers) → `nav.mode` (foryou/top/topics) + `nav.topic`. `getFeedPaginated` dapat arg `mode`/`topic`. Lihat Isu 6. |
| D5 | **Search + filter pindah ke header kanan atas, berlaku global** lintas-konten, ranked best-match. | `feedItems` butuh `searchText` + `searchIndex` + query `searchDiscovery`. DiscoveryToolbar lama dihapus. Lihat Isu 7. |
| D6 | **Fitur "save" (bookmark) diganti Save-to-Workspace** (popover pilih workspace); **satu ikon konsisten app-wide**. | Hapus jalur bookmark (`saveDiscoveryItem`/`savedFeedItems` → jadi dead); promote `onSaveToWorkspace` ke semua kind; ikon kanonik. Menghilangkan toggle "Tersimpan" + sinyal interest dari save (mitigasi di Isu 8). |
| D7 | **"Teliti klaim ini" → "Tanya Astra"**; ikon `SparklesIcon` → Hugeicon lain (default `MessageSquareIcon`) untuk action itu. | Pure frontend (copy + icon). Lihat Isu 9. |

## Catatan koreksi penting (hasil review adversarial — jangan terulang)

- **`fast-xml-parser` SUDAH terpasang** (`packages/convex/package.json:66`, `^5.7.3`), dipakai di
  `papers/ingest/providers.ts`, `papers/grobid/teiParser.ts`, `agent/providers/externalProviders.ts`.
  **Tidak ada** langkah "tambah dependency". Ikuti pola `XMLParser` yang ada.
- **`@convex-dev/migrations` TIDAK terpasang** (`convex.config.ts` hanya `rag`/`rateLimiter`/`polar`).
  Semua purge/backfill memakai **paginated `internalMutation` + `ctx.scheduler.runAfter` continuation**
  (pola "Bounded reads" di `packages/convex/AGENTS.md`). Untuk greenfield prod, backfill one-time boleh
  di-skip (write path mengisi field baru sejak event pertama) — tapi lihat caveat `orderAt` di Isu 5.
- **JANGAN narrowing validator di fase ini.** Literal `"Exa"` (`exploreProviderValidator`), `"exa_news"`
  (`feedProviderValidator`), dan `"exa"` (`providerValidator` + `externalLookupCache.provider`) adalah
  **field tersimpan** di `explorePapers`/`feedItems`/`externalLookupCache`. Menghapusnya tanpa
  membersihkan row lama → `ReturnsValidationError`/`Schema validation failed` saat row lama dibaca
  (mis. `getPaper`/`getOrFetchPaper` deep-link paper `provider:"Exa"`). Strategi: **additive saja** —
  berhenti memproduksi row baru, biarkan literal lama tetap ada. Penghapusan literal = pekerjaan
  terpisah jauh di kemudian hari, setelah purge tuntas + verifikasi.
- **Provider literal baru `"google_news"` harus ditambah di DUA-TIGA tempat** (lihat Isu 2d), bukan satu.
- **Rename `exaClient.ts` → "exaForAgent" TIDAK perlu.** Importer `exaClient.ts` hanya
  `feed/providers/news.ts` (dihapus Isu 1) dan `agent/providers/externalProviders.ts` (agent, KEEP).
  Setelah `news.ts` dihapus, `exaClient.ts` otomatis agent-only — andalkan `typecheck`. Tidak ada
  "Slice 0".

---

## Kondisi saat ini (current-state, terverifikasi)

### Backend feed/explore (Convex)

- **Cron** (`crons.ts:15-68`): `feed:trending-papers` 8h → `internal.feed.refreshTrendingPapers`
  (OpenAlex); `feed:factcheck-claims` 24h → `internal.feed.claims.refreshFactCheckClaims`;
  `feed:gdelt-topics` 24h → `internal.feed.sources.refreshTrendingTopics`; `feed:science-news` 12h →
  `internal.feed.sources.refreshScienceNews` (**Exa**); `feed:backfill-id` 6h →
  `internal.feed.bahasa.backfillIndonesian`. Plus `agent:watchdog` 5m (bukan feed). Tanpa stagger.
- **getFeed** (`feed.ts:58-135`): query reaktif, candidate pool in-memory per-kind (`by_kind_trend` ∪
  `by_kind_published`, ~120 kandidat), skor komposit `recency + popularity + interest*1.5 + kindBoost`,
  `deClump`, annotate `relevanceScore` + `reason`. Default limit 40, cap 80. **Tidak ada `.paginate()`**.
  Konsumen: `discovery-page.tsx` (Brief) **dan** `home-explore-bento.tsx:31` (`limit: 7`).
- **Interest** (`userFeedInterests`, index `by_owner_topic`): di-seed onboarding (`feed/interests.ts`
  `seedFeedInterests`), di-bump save/hide/research, di-load `loadInterestWeights` (`feed.ts:554-567`),
  dipakai `interestMatch` (`feed.ts:798+`). `userInterestTopics` (`feed.ts:310-324`) mengembalikan
  top-positif per-user. Provider cron **tidak** interest-aware.
- **Lane berita (Exa)**: `feed/sources.ts:99-177` (`refreshScienceNews`) → `feed/providers/news.ts`
  `fetchScienceNews` → `getExaClient()` + `exa.search()`, bucket `exaSearchGlobal`, cache provider
  `"exa"`, tulis `feedItems.provider = "exa_news"`.
- **Exa fallback explore** (`explore.ts:92-104`): `searchExaCandidates` dipanggil bila OpenAlex/arXiv di
  bawah `minFallbackResults`. Rantai: OpenAlex → arXiv → **Exa** → Jina → Crossref.
- **Exa URL crawl ingest** (`papers/ingest/ingest.ts:137-140`): `readWithExaContents` fallback (Jina
  dulu), di-guard `EXA_API_KEY`.
- **Exa SHARED (KEEP untuk agent)**: `agent/providers/exaClient.ts` (`getExaClient`),
  `agent/providers/externalProviders.ts` (`searchExaCandidates`, `readWithExaContents` — call site
  explore/ingest mengimpor dari **sini**, bukan dari `exaClient.ts`), `limits.ts` (`exaSearchPerUser`
  KEEP; `exaSearchGlobal` jadi tak terpakai setelah cutover news).
- **Provider validator (TIGA union terpisah!)**: `feed/validators.ts:11-17` `feedProviderValidator`
  (`openalex`/`exa_news`/`gdelt`/`google_factcheck`/`turnbackhoax`); `agent/providers/providerCache.ts`
  `Provider` type **+** `providerValidator` (`crossref`/`openalex`/`arxiv`/`exa`/`jina_*`/`explore`/
  `paper_ingest`/`google_factcheck`/`gdelt`) yang **memvalidasi arg** `provider` di `getCache`/`putCache`;
  `schema.ts` `externalLookupCache.provider`. `explore/validators.ts` `exploreProviderValidator` (punya
  `Exa`).
- **`fetchScienceNews` skip-translate**: `feed/bahasa.ts:17` `ID_NATIVE_PROVIDERS =
  {google_factcheck, gdelt, turnbackhoax}` — lane yang sudah berbahasa Indonesia dilewati translasi.
- **`feedSources` (`schema.ts:460-473`) = TABEL MATI** — didefinisikan, tidak pernah dibaca/ditulis.

### Frontend Explore

- **Surface** (`discovery-page.tsx`): `useConvexQueryData(api.feed.getFeed, feedArgs)` (Brief);
  `useConvexActionQueryWithKey(api.explore.searchPapers, ...)` (Papers, limit 12); filter hidden/saved
  lokal; aside-derivations dari `rawItems`. `CaughtUp` dirender saat item habis (`:476`).
- **Detail berita** (`features/explore/pages/news-detail-page.tsx`, route `/app/explore/n/[id]`):
  body = `item.articleText ?? item.summary`; `ReaderSourceCard url={item.url}`; `buildNewsSeed()`
  menyuntik `item.url` ke seed riset agent. **Surface ber-parity** (lihat `apps/web/AGENTS.md`).
- **Helper** (`convex-query.ts`): `useConvexQueryData` (`:56-63`), `useConvexActionQueryWithKey`
  (`:37-54`). **Belum ada** helper paginated. `@convex-dev/react-query@0.1.0` me-re-export
  `usePaginatedQuery as useConvexPaginatedQuery` (+ `optimisticallyUpdateValueInPaginatedQuery`,
  `insertAtTop`).
- **IntersectionObserver** sudah ada polanya di `pdf-artifact-viewer.tsx:201,398`.
- **Aturan boundary**: CLAUDE.md melarang raw `useQuery`/`useMutation`/`useAction` dari `convex/react`.
  `usePaginatedQuery` (di-re-export adapter) **sah**, tapi **wajib dibungkus** di `convex-query.ts` agar
  feature code tidak menyentuh adapter langsung. (Tidak ada eslint `no-restricted-imports` yang
  menegakkan; `useConvexAuth` sudah dipakai luas sebagai preseden pengecualian.)

---

## Target arsitektur

```
HIDRASI (1 parent cron @ 3h → scheduler.runAfter staggered child; tanpa await inline)
  feed:hydrate-cycle (3h)  → internal.feed.hydrateCycle (internalAction)
    runAfter(0)        refreshTrendingPapers    (OpenAlex)
    runAfter(20m)      refreshTrendingTopics     (GDELT, KEEP per D2)
    runAfter(40m)      refreshGoogleNews         (Google News RSS) ← GANTI Exa news
    runAfter(60m)      refreshFactCheckClaims    (Google Fact Check)
    runAfter(100m)     enrichGoogleNewsArticles  (fetchArticlePreview, opsional/bertahap)
    [backfillIndonesian / lajur translasi LLM DIHILANGKAN untuk saat ini]
  agent:watchdog (5m)  → TIDAK tersentuh

SUMBER BERITA
  feed/providers/googleNews.ts        ← BARU (fast-xml-parser; SEARCH feed ID + topic SCIENCE/HEALTH)
  feed/providers/googleNewsDecode.ts  ← BARU (resolvePublisherUrl: lazy, 302-follow → batchexecute fallback)
  feed/providers/news.ts (Exa)        ← DIHAPUS
  feedItems.provider = "google_news"  ← BARU (additive di 3 union)
  feedItems.orderAt   = number        ← BARU non-optional (= publishedAt ?? lastSeenAt ?? createdAt)

INTEREST-AWARE (MVP = per-user, tanpa agregasi global ber-scan)
  reuse userInterestTopics (per-user keyword)        → searchPapers recommendations + reorder paginated
  feed/interestKeywords.ts (taksonomi → keyword)     ← BARU (seed statis, bukan personalisasi cron)

INFINITE SCROLL (auto, per D1)
  feed.getFeedPaginated (query, paginationOptsValidator, kinds?) over by_order index
  convex-query.ts: useConvexPaginatedQueryData                   ← BARU (satu-satunya penyentuh adapter)
  discovery-page.tsx: IntersectionObserver sentinel + loadMore + CaughtUp/empty/loading/guard

EXA (KEEP, agent-only — otomatis setelah news.ts dihapus)
  agent/providers/exaClient.ts + externalProviders.ts            ← KEEP
  apps/agents/src/providers/exa.ts                               ← KEEP (standalone, tak tersentuh)
```

---

## Isu 1 — Hapus Exa dari surface explore/feed

### 1a. Hapus lane berita Exa (digabung dengan Isu 2 dalam satu slice)
- Hapus `feed/providers/news.ts` (`fetchScienceNews`).
- `feed/sources.ts`: hapus `refreshScienceNews` (`:99-177`), import `fetchScienceNews`, konstanta
  `NEWS_SEEDS`/`NEWS_WINDOW_DAYS`/`NEWS_PER_SEED`/`NEWS_TOTAL_CAP`/`firstSentence`.
- `crons.ts`: hapus job `feed:science-news` (digantikan referensi `refreshGoogleNews` di orchestrator
  Isu 4).
- **Gabungkan dengan Isu 2 di slice yang sama** supaya lane `kind="news"` tidak kosong di antara dua
  deploy. (Per-kind pool boleh kosong tanpa memecahkan `getFeed`, tapi gap berita tidak diinginkan.)

### 1b. Hapus Exa fallback dari pencarian explore
- `explore.ts:92-104`: hapus blok `collectProvider(..., "Exa", ...)`. Rantai fallback jadi
  OpenAlex → arXiv → Jina → Crossref. Hapus import `searchExaCandidates` **dari `explore.ts`** (fungsi
  tetap diekspor `externalProviders.ts` untuk agent).
- **JANGAN** hapus literal `"Exa"` dari `exploreProviderValidator` maupun `providerLabels.exa`
  (`explore/model.ts`) — itu field tersimpan + mapper aktif. Cukup berhenti menulis row `provider:"Exa"`
  baru.

### 1c. Hapus Exa dari ingest URL crawl (D3)
- `papers/ingest/ingest.ts:137-140`: hapus cabang `readWithExaContents`. Ingest URL crawl jadi
  Jina-only. (Jina sudah crawler utama; Exa hanya fallback kedua.)

### Rate-limiter & cache
- `limits.ts`: **pertahankan** `exaSearchPerUser` (agent). `exaSearchGlobal` jadi tak terpakai —
  **jangan hapus** di slice ini; tandai komentar "unused after Google News cutover". Penghapusan butuh
  verifikasi runtime 0-usage (Convex insights/logs), bukan hanya grep — pekerjaan terpisah.
- `externalLookupCache.provider` literal `"exa"`: **tetap** (agent masih menulis cache `"exa"` via
  `externalProviders.getCache/putCache`).

### Tes
- `tests/exploreModel.test.ts:167`: ganti fixture `provider: "exa"` → `provider: "openalex"`/`"jina_search"`.
- Tambah `tests/exploreSearch.test.ts`: assert `providerStatus` rantai fallback tidak lagi memuat `Exa`
  (mock provider; ekspektasi OpenAlex/arXiv/Jina/Crossref saja).
- Test backward-compat: `getPaper`/`getOrFetchPaper` membaca row lama `provider:"Exa"` **tetap lolos**
  (literal dipertahankan) — guard agar tidak ada yang iseng menyempitkan validator.
- Gate: `typecheck` menangkap importer `searchExaCandidates`/`readWithExaContents` yang putus.

---

## Isu 2 — Google News RSS sebagai sumber berita

### Keputusan arsitektur
- Sumber utama: **Google News SEARCH feed ID** —
  `https://news.google.com/rss/search?q={q}&hl=id&gl=ID&ceid=ID:id` dengan operator `when:7d` untuk
  window; pelengkap **topic feed** `SCIENCE` & `HEALTH`
  (`https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=id&gl=ID&ceid=ID:id`).
- Parser: **`fast-xml-parser` (sudah terpasang)**. Ikuti pola repo
  (`papers/ingest/providers.ts:19`: `ignoreAttributes:false`) + `isArray:(name)=>name==="item"`.
- Dedup: `guid` sebagai primary key (`dedupeKey = "news:gnews:" + guid`); dedup sekunder = judul
  ternormalisasi + domain publisher (artikel sama, guid beda lintas seed).
- **URL decode TIDAK blocking.** Simpan `<link>` redirect + publisher dari `<source url>`. Resolusi ke
  URL publisher final = lazy (Isu 2f).

### 2a. Provider baru
- `feed/providers/googleNews.ts` (BARU):
  - `export type GoogleNewsItem = { title; redirectUrl; guid; publisherName; publisherDomain; pubDate?; descriptionSnippet? }`.
  - `fetchGoogleNews(ctx, { query, limit? }): Promise<GoogleNewsItem[]>` — `fetch` RSS (di **action**,
    bukan query/mutation), parse via `new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_",
    isArray:(n)=>n==="item" })`. Map: strip suffix `" - {publisher}"` dari `<title>`; `publisherName =
    item.source["#text"]`; `publisherDomain = item.source["@_url"]`; `pubDate` via `Date.parse`,
    fallback `now`; `guid = item.guid["#text"] ?? item.guid`. Unescape entity di title/description.
  - Jeda 1–2 dtk antar fetch seed (sopan). `try/catch` per fetch + retry terbatas.

### 2b. Lane refresh baru
- `feed/sources.ts`: tambah `refreshGoogleNews` (`internalAction`) menggantikan `refreshScienceNews`:
  - Seed query sains/kesehatan ID + (Isu 3) keyword interest statis. Contoh:
    `"kesehatan OR medis OR penyakit when:7d -hoaks"`, `"sains OR penelitian OR riset when:7d"`,
    `"vaksin OR gizi OR pandemi when:7d"`, + topic feed `SCIENCE`/`HEALTH`.
  - Loop seed dengan jeda; dedup by guid + sekunder; cap total (mis. 16). Map ke `feedItems`:
    `kind:"news"`, `provider:"google_news"`, `dedupeKey`, `url:redirectUrl`, `sourceLabel:publisherName`,
    `topics:[seedLabel]`, `trendScore:0`, `publishedAt:pubDate`, `orderAt: publishedAt ?? lastSeenAt`
    (lihat Isu 5), `articleText`/`imageUrl` **kosong** (enrichment terpisah, 2f).

### 2c. Cache provider
- Hasil mentah RSS di-cache via `externalProviders.getCache/putCache`. **Wajib** tambah literal
  `"google_news"` ke **`agent/providers/providerCache.ts`**: (i) `Provider` type union, (ii)
  `providerValidator`. **Dan** verifikasi `schema.ts` `externalLookupCache.provider` — tambah literal di
  sana bila union-nya didefinisikan inline (bukan re-use `providerValidator`). Tanpa ini →
  `ArgumentValidationError` saat cron jalan (lolos typecheck, tertangkap di `convex dev --once`/runtime).
  Alternatif minimal: reuse literal `"explore"`/`"gdelt"` yang sudah ada (kurang ekspresif) — **default
  plan: tambah literal `"google_news"` di semua union (additive aman)**.

### 2d. Validator feedItems
- `feed/validators.ts`: tambah `v.literal("google_news")` ke `feedProviderValidator` (additive).
  Pertahankan `exa_news` (backward-compat row lama).

### 2e. Skip translasi — DEFER (untuk saat ini)
- **Ditunda**: lajur `backfillIndonesian` dihilangkan dari hidrasi (lihat Isu 4), jadi tidak ada
  translasi yang jalan dan perubahan ini tidak diperlukan sekarang. Saat lajur translasi diaktifkan
  kembali, baru tambahkan `"google_news"` ke `feed/bahasa.ts:17` `ID_NATIVE_PROVIDERS` (feed `hl=id`
  sudah berbahasa Indonesia) agar tidak boros menerjemahkan ulang.

### 2f. Enrichment & resolusi URL — WAJIB untuk parity news-detail reader
> Kritik blocker: dengan Google News, `articleText` kosong + `url`=redirect `news.google.com` →
> `news-detail-page.tsx` (reader ber-parity) jadi nyaris kosong + `ReaderSourceCard` menaut ke domain
> opaque + `buildNewsSeed` mengirim URL redirect tak terbaca ke agent. **Bukan opsional.**

- `feed/providers/googleNewsDecode.ts` (BARU): `resolvePublisherUrl(redirectUrl): Promise<string|null>`
  — **coba HTTP GET follow-redirect dulu** (ambil `Response.url`); fallback `batchexecute` (rpcid
  `Fbv4je`, signature `data-n-a-sg` + timestamp `data-n-a-ts`) hanya bila perlu, dengan UA browser +
  backoff 429. Terima bahwa fallback rapuh.
- Tambah field **optional** `resolvedUrl: v.optional(v.string())` ke `feedItemFields` (additive).
- **Reader/source-card**: `ReaderSourceCard` link = `resolvedUrl ?? url`; tampilkan **`sourceLabel`
  (nama publisher)** sebagai label utama (bukan domain mentah). `buildNewsSeed` pakai `resolvedUrl ??
  publisherDomain`. Cek `getRelatedFeedItems`/`ReaderRelatedGrid` tetap waras untuk `kind="news"`.
- **Job enrichment** `enrichGoogleNewsArticles` (`internalAction`, masuk orchestrator Isu 4, cadence
  rendah): untuk batch `feedItems` `provider:"google_news"` tanpa `articleText`, panggil
  `resolvePublisherUrl` lalu `fetchArticlePreview` (`papers/articlePreview.ts`, dipakai
  `refreshScienceNews` lama) terhadap URL publisher; persist `resolvedUrl` + `articleText` + `imageUrl`.
  Soft-fail + rate-limit; jangan blokir ingest.

### Frontend
- `feedItemToDiscoveryItem` sudah generic — kartu render `sourceLabel`/`url`. Tambah label provider
  `google_news → "Google News"` di mapping label (`feed/model.ts`/`discovery-format.ts`).

### Migrasi/cleanup
- **Purge row `exa_news` lama** (news ephemeral) via **paginated `internalMutation` + `scheduler.runAfter`
  continuation** (bukan `@convex-dev/migrations`; bukan `.collect()`): query `by_kind_published`
  `kind="news"`, filter `provider==="exa_news"`, `.paginate()`, delete batch, jadwalkan lanjutan. Literal
  `exa_news` **tetap** di validator (additive; penghapusan literal = pekerjaan terpisah).

### Tes
- `tests/googleNewsParse.test.ts` (BARU): fixture XML live-shape — single item dipaksa array via
  `isArray`; suffix `" - Publisher"` ter-strip; `source @_url` → domain; CDATA/entity unescape; `pubDate`
  absen → fallback `now`.
- Test dedup sekunder: dua seed, guid beda, judul+domain sama → satu `feedItems`.
- Test `refreshGoogleNews` (mock `fetchGoogleNews`): assert upsert `provider:"google_news"` + `orderAt`
  terisi.

### Pra-implementasi (empiris — gate sebelum koding)
- Cek `https://news.google.com/robots.txt` (path yang dibatasi).
- Uji dari **runtime Convex** (bukan lokal): (a) 302-follow `<link>` menghasilkan URL publisher atau
  halaman consent/interstitial? (b) operator `site:` konsisten di edisi `hl=id`? (c) rate sebelum 429
  untuk fetch feed vs resolusi URL. Hasilnya menentukan kelayakan `resolvePublisherUrl` on-click vs
  batch.

---

## Isu 3 — Feed explore menghormati interest user

### Status: parsial sudah ada
`getFeed` interest-aware (scoring `interest*1.5`). Gap: pencarian Explore (`searchPapers`) belum
interest-aware; ranking interest harus dipertahankan di paginated (Isu 5).

> Koreksi: **JANGAN** bikin `getGlobalTopInterests` ber-`.take(2000)` lintas-user. `userFeedInterests`
> hanya berindeks `by_owner_topic` → query lintas-user tanpa `eq(ownerUserId)` = scan (dilarang AGENTS.md)
> + bias urutan index + mahal per cron-run. **MVP: drop personalisasi level-sumber.** Andalkan seed
> statis + scoring per-user di `getFeed`/`getFeedPaginated` (yang sudah interest-aware).

### 3a. Taksonomi interest → keyword (single source of truth)
- `feed/interestKeywords.ts` (BARU): map `INTEREST_FIELDS` (`onboarding.ts:38-54`, 15 kategori) →
  keyword pencarian (ID + EN) untuk OpenAlex/Google News. Hindari hardcode tersebar.
- Normalisasi: pastikan `seedFeedInterests` (`feed/interests.ts`) dan `interestMatch` keduanya
  lowercase-trim, dan provider menulis `topics` lowercase-trim konsisten (cegah mismatch diacritics ID).

### 3b. Explore Papers search interest-aware
- `explore.ts:searchPapers`: saat `mode="recommendations"` (query kosong), pakai **top interest user**
  (`userInterestTopics`, `feed.ts:310-324` — **reuse, jangan duplikat** dengan `getFeedInterestKeywords`)
  sebagai `providerQuery` default alih-alih `defaultRecommendationQuery`. Arg opsional `interestSeed?:
  boolean` (default true untuk recommendations).

### 3c. Pertahankan ranking interest di paginated
- `getFeedPaginated` (Isu 5) memanggil `loadInterestWeights` + `interestMatch` lalu **reorder per-page**
  (bukan global). Cukup interest-aware untuk MVP.

### Frontend
- Tidak ada perubahan wajib (server-driven). Badge "Karena minat: {topik}" dari `reason`
  (`feed.ts:reasonFor`) tetap muncul di item paginated.

### Tes
- `tests/feedInterest.test.ts`: seed `userFeedInterests`, `userInterestTopics` → top-N benar +
  ternormalisasi lowercase.
- `searchPapers` recommendations dengan interest → `providerQuery` memuat keyword interest (mock
  provider, assert query string); tanpa interest → fallback default (cold-start tetap waras).
- Guard taksonomi: tiap id `INTEREST_FIELDS` → ≥1 keyword valid.

---

## Isu 4 — Konsolidasi hidrasi ke tiap 3 jam

### Pola: satu parent cron + child via `scheduler.runAfter` (bukan await inline)
`crons.interval` tak punya offset. Satu cron 3 jam memanggil orchestrator `internalAction` yang
**hanya** men-`scheduler.runAfter(delayMs, internal.feed.X, {})` tiap child (5–6 panggilan ringan,
selesai <1s). **Tanpa await child, tanpa try/catch pembungkus** (batas action 10 menit + stagger akan
rusak bila inline). Penanganan kegagalan ada di **masing-masing child** (soft-fail sudah ada).

### 4a. Orchestrator
- `feed/hydrate.ts` (BARU) atau `feed.ts`: `internalAction hydrateCycle`:
  ```
  runAfter(0,            internal.feed.refreshTrendingPapers, {})        // OpenAlex
  runAfter(20*60_000,    internal.feed.sources.refreshTrendingTopics, {}) // GDELT (D2: KEEP)
  runAfter(40*60_000,    internal.feed.sources.refreshGoogleNews, {})     // Google News
  runAfter(60*60_000,    internal.feed.claims.refreshFactCheckClaims, {})
  runAfter(100*60_000,   internal.feed.sources.enrichGoogleNewsArticles, {}) // opsional/bertahap
  // backfillIndonesian (lajur translasi LLM) DIHILANGKAN untuk saat ini — tidak dijadwalkan.
  ```
  Urutan stagger naik = biaya/rate-sensitivity. Siklus ulang tiap 180m.
  **Catatan (keputusan owner):** lajur `backfillIndonesian` (translasi LLM) **dihilangkan untuk saat
  ini** — tidak masuk orchestrator. Konsekuensi: konten non-ID (mis. paper OpenAlex berbahasa Inggris)
  tidak memperoleh `tldrId`/`titleId` sampai lajur ini diaktifkan kembali. Google News (`hl=id`) memang
  sudah berbahasa Indonesia, jadi dampaknya kecil untuk lane berita.

### 4b. Registrasi cron
- `crons.ts`: ganti 5 `crons.interval` feed dengan **satu**:
  `crons.interval("feed:hydrate-cycle", { hours: 3 }, internal.feed.hydrateCycle, {})`.
  Hapus `feed:trending-papers`, `feed:factcheck-claims`, `feed:gdelt-topics`, `feed:science-news`,
  `feed:backfill-id`. **Pertahankan `agent:watchdog` (5m).** Nama child tetap `internalAction` (bisa
  dipanggil manual/test).
- `feed:backfill-id` (→ `backfillIndonesian`) dihapus dari `crons.ts` **dan tidak di-re-add** ke
  orchestrator untuk saat ini (keputusan owner). Fungsi `backfillIndonesian` di `feed/bahasa.ts` tetap
  ada (jangan dihapus) supaya mudah diaktifkan kembali nanti — cukup tambah satu `runAfter` lagi.

### 4c. Telemetry
- **JANGAN** tulis ke `feedSources` (tabel mati, tanpa konsumen — melanggar prinsip "code terorganisir").
  Andalkan return value tiap child (`{ fetched, inserted, updated }`) + Convex logs. Bila kelak butuh
  observability persisten, tambahkan **konsumen UI dulu**. Pertimbangkan tandai `feedSources` sebagai
  dead-table untuk dihapus di pekerjaan cleanup terpisah.

### Migrasi/cleanup
- Pure cron refactor, tanpa perubahan schema. `npx convex dev --once`: tidak ada cron name collision +
  referensi `internal.*` valid.
- Budget: 3h = 8 siklus/hari. Tanpa lajur `backfillIndonesian` (dihilangkan), **tidak ada konsumsi token
  LLM dari hidrasi** untuk saat ini. Pantau overlap di Convex metrics.

### Tes
- `tests/feedHydrate.test.ts`: panggil `hydrateCycle` (mock scheduler), assert **5** `runAfter`
  (trendingPapers, trendingTopics/GDELT, googleNews, factCheckClaims, enrichGoogleNewsArticles — TANPA
  backfillIndonesian) dengan delay + urutan referensi benar; assert **tidak ada `await`** child
  (orchestrator selesai cepat).
- Idempoten: tiap child masih dipanggil mandiri.

---

## Isu 5 — Infinite scroll (auto, per D1)

> **D1 membalik PRD P3 (anti-doomscroll).** Mekanisme `usePaginatedQuery` + `getFeedPaginated` sama
> untuk auto maupun tombol; pemicunya = IntersectionObserver (auto). **Tindakan dokumentasi (wajib):**
> update `feed-feature-prd.md:22,146` + `feed-feature-research.md:198-200` agar mencatat pembalikan
> eksplisit ini (jangan biarkan PRD bertentangan dengan kode).

### Strategi A — kronologis lintas-kind via `orderAt` + reorder interest per-page
`getFeed` tak bisa dipaginate murni (pool in-memory, tanpa cursor). Solusi minimal-schema: **query baru**
`getFeedPaginated` di atas index waktu non-optional; reorder interest **per-page**. **Jangan ubah**
`getFeed` (dipakai aside + `home-explore-bento`).

> Koreksi blocker: index pada `publishedAt` (**optional**) berisiko — row tanpa `publishedAt`
> ber-urutan tak deterministik / berpotensi tak konsisten di range scan, dan banyak feedItems (claim,
> topic, news lama) bisa `publishedAt=null`. **Solusi: field `orderAt` non-optional.**

### 5a. Field + index waktu non-optional
- `schema.ts` / `feed/validators.ts` `feedItemFields`: tambah `orderAt: v.number()` (non-optional,
  additive) = `publishedAt ?? lastSeenAt ?? createdAt`, di-set di **semua write path** `feedItems`
  (`upsertFeedItems` + tiap provider). Tambah index `by_order` `["orderAt"]` lintas-kind.
- **Backfill `orderAt` row lama** (paginated `internalMutation` + `scheduler.runAfter` continuation)
  **sebelum** mengandalkan `by_order` — kalau tidak, row tanpa `orderAt` hilang dari index. (Greenfield
  prod tanpa data lama boleh skip; konfirmasi volume `feedItems` prod sebelum memutuskan.) Sertakan test
  dengan item **tanpa `publishedAt`** → assert tetap muncul di `getFeedPaginated`.

### 5b. Query paginated
- `feed.ts`: `getFeedPaginated` (`query`):
  ```
  args: { paginationOpts: paginationOptsValidator, kinds?: array(feedItemKindValidator) }
  handler:
    requireCurrentUser
    page = db.query("feedItems").withIndex("by_order").order("desc").paginate(paginationOpts)
    interests = loadInterestWeights; hidden = loadHiddenItemIds; saved = loadSavedItemIds
    items = page.page
      .filter(kinds match && !hidden)         // catatan page-shrink di bawah
      .map(shapeFeedItem + relevanceScore + reason + saved)
      .sort(interest-aware per-page)
    return { ...page, page: items }
  ```
  Reuse `shapeFeedItem`/`interestMatch`/`recencyScore`/`popularityScore`/`kindBoost`/`reasonFor`.
  `returns`: boleh di-off bila shape mapped tak 100% pasti (per AGENTS.md), atau `PaginationResult` of
  `feedItemValidator` + field tambahan.
- **Filter kind**: lewat arg `kinds` → arg berubah → `usePaginatedQuery` auto-reset ke page pertama
  (diinginkan saat ganti tab). Idealnya `kinds` tunggal di-paginate via `by_kind_published`; untuk
  Brief campur, `by_order` lintas-kind.
- **Filter hidden post-paginate** membuat page menyusut (gotcha Convex resmi). Mitigasi di frontend
  (5d, guard auto-loadMore). Hidden per-user jarang banyak — acceptable MVP. Strategi B (materialized
  `feedRanking`) di-defer.

### 5c. Aside tetap pakai `getFeed` ber-cap
- Aside-derivations (`deriveTopTopics`/`deriveVerdictBreakdown`/`deriveTopCited`/`deriveTopicMomentum`)
  jangan ikut `results` paginated (akan goyang tiap loadMore). Pertahankan
  `useConvexQueryData(api.feed.getFeed, { limit: 30 })` **khusus aside** (cap kecil, stabil).
- **`home-explore-bento.tsx` tetap `getFeed` (`limit: 7`)** — jangan migrasi ke paginated. Hanya list
  utama Brief di `discovery-page` yang pindah.

### 5d. Helper paginated (satu-satunya penyentuh adapter)
- `convex-query.ts` (setelah `useConvexQueryData`):
  ```ts
  import { useConvexPaginatedQuery } from "@convex-dev/react-query";
  import type { PaginatedQueryReference, PaginatedQueryArgs } from "convex/react";
  export function useConvexPaginatedQueryData<Q extends PaginatedQueryReference>(
    funcRef: Q,
    args: PaginatedQueryArgs<Q> | "skip",
    opts: { initialNumItems: number },
  ) { return useConvexPaginatedQuery(funcRef, args, opts); }
  ```
  Dokumentasikan di komentar: `usePaginatedQuery` pakai subscription Convex langsung (tidak masuk cache
  TanStack adapter) — pengecualian yang diterima, seperti `useConvexAuth`.

### 5e. Discovery page (auto infinite scroll + state lengkap)
- `discovery-page.tsx`:
  - Ganti `useConvexQueryData(api.feed.getFeed, feedArgs)` (Brief, `:67`) →
    `useConvexPaginatedQueryData(api.feed.getFeedPaginated, nav.view==="papers" ? "skip" : { kinds },
    { initialNumItems: 18 })`. `results` menggantikan `feedData`; `status`/`isLoading` menggantikan
    `feedData === undefined`.
  - Sentinel `<div ref={sentinelRef} />` + `IntersectionObserver` (tiru `pdf-artifact-viewer.tsx:201`,
    `rootMargin:"600px"`): `if (isIntersecting && status==="CanLoadMore") loadMore(PAGE_SIZE)`.
  - **State lengkap (wajib, dari kritik):**
    - `status==="Exhausted" && results.length>0` → `CaughtUp` ("Kamu sudah update").
    - `status==="Exhausted" && results.length===0` → **empty-state sejati** ("Belum ada konten di
      Jelajahi") — beda dari caught-up.
    - `LoadingFirstPage`/`LoadingMore` → skeleton.
    - **Guard auto-loadMore**: `usePaginatedQuery` tak punya `.error` seperti TanStack → bungkus error
      boundary/fallback UI. Saat page menyusut akibat filter hidden tapi `status` tetap `CanLoadMore`,
      batasi **maks N auto-fetch berturut** (mis. 3) sebelum berhenti, agar IntersectionObserver tidak
      loop tanpa batas.
  - `buildBriefRows` (`:414-459`): hitung baris dari `results` terakumulasi (jangan asumsikan ukuran
    page tetap — page-size variability Convex).
  - Filter hidden/saved lokal tetap valid lintas-page; opsional `optimisticallyUpdateValueInPaginatedQuery`
    untuk save/hide mulus (defer, map lokal cukup MVP).
- **Papers view tetap** `searchPapers` action (pencarian eksternal, bukan `.paginate()`). Infinite
  scroll Papers = opsional, slice terpisah (tombol/limit bertambah). Default plan: **hanya Brief**.

### Tes
- `tests/feedPaginated.test.ts`: seed `feedItems` (termasuk **satu tanpa `publishedAt`**), dua page →
  assert continuity (tanpa duplikat), filter `kinds` benar, hidden ter-exclude, item tanpa `publishedAt`
  tetap muncul (via `orderAt`).
- Test reorder per-page interest-aware.
- Frontend: tidak ada test runner di apps/web → verifikasi manual (scroll Brief → auto loadMore →
  CaughtUp; feed kosong → empty-state; ganti tab kind → reset page).

---

# Bagian II — Revamp UI/UX Explore (Isu 6–9)

> Empat isu frontend-led (spesifikasi owner) di atas feed terpadu Isu 1–5. **Interaksi lintas-isu:**
> Isu 6 (mode nav) + Isu 7 (search global) **memperluas** `getFeedPaginated` (Isu 5) + menambah query
> `searchDiscovery`; **Isu 8 menghapus konsep "saved"** → `getFeedPaginated` (Isu 5b) drop field `saved`;
> Isu 9 murni copy + ikon. Verifikasi UI dilakukan manual (tidak ada test runner di `apps/web`).

## Isu 6 — Header nav: Brief/Papers → For You | Top | Topics (+ merge Papers)

### Kondisi saat ini (terverifikasi)
- `DiscoveryViewTabs` (`discovery-toolbar.tsx:27-60`) merender tab **Brief|Papers** (underline style) via
  prop `headerCenter` (`discovery-page.tsx:59-70`). `nav.view ∈ {brief, papers}` (`use-discovery-nav.ts:12-16`).
- Brief → `api.feed.getFeed` (reaktif); Papers → `api.explore.searchPapers` (action eksternal, limit 12).
- **Paper SUDAH jadi feed item**: `refreshTrendingPapers` (`feed.ts:504-547`) meng-ingest OpenAlex →
  `feedItems` `kind="paper"`. Jadi paper akademik sudah muncul di feed. "Tab Papers" hanya menjalankan
  **search eksternal on-demand** (`searchPapers`) — fungsi itu pindah ke search global (Isu 7).

### Target
- **For You** = personalized (ranking `getFeed` interest-aware sekarang). **Top** = trendScore/popularity,
  **non-personalized**. **Topics** = filter by kategori via popover `[Tech & Science, Business, Arts & Culture, Sports, Entertainment]`.
- **Tab Papers dihapus**; paper tetap muncul (a) sebagai feed item di ketiga mode, (b) di hasil search global.

### Frontend (file-level)
- `use-discovery-nav.ts`: ganti `discoveryViews ["brief","papers"]` → `discoveryModes ["foryou","top","topics"]`
  (nuqs key `mode`, default `foryou`); tambah `topic` (nullable, kategori terpilih). **Back-compat**: map
  `?view=brief`→`foryou`, `?view=papers`→`foryou` + buka search (Isu 7). Tambah `discoveryTopicCategories`
  const + label ID.
- `discovery-toolbar.tsx`: ganti `DiscoveryViewTabs` → `DiscoveryModeNav` (For You | Top | Topics). Topics
  = `Popover` (`components/ui/popover.tsx`) berisi 5 kategori. Pakai primitive yang ada (Popover/DropdownMenu).
- `explore-surface-header.tsx`: `centerSlot` = `DiscoveryModeNav` (search/filter di kanan, Isu 7).
- `discovery-page.tsx`: branch data by `mode` + `q` (lihat Isu 7); aside per mode (FactBalance hanya For You,
  Trending semua mode).
- `discovery-aside.tsx`: `onSelectTopic` saat ini `setNav({view:"papers", q:name})` → ganti `setNav({mode:"topics", topic:name})` (selaras Isu 6/7).

### Backend (file-level)
- Perluas `getFeedPaginated` (Isu 5b) dengan arg `mode: "foryou"|"top"|"topics"` + `topic?: string`:
  - **foryou**: ranking interest-aware (recency + popularity + `interest*1.5` + kindBoost), reorder per-page.
  - **top**: **decouple interestMatch** — sort `trendScore`/popularity + recency saja. Tambah **recency floor**
    agar tidak didominasi paper sitasi-tinggi tapi lama.
  - **topics**: filter kandidat by kategori (`topic` → keyword set match `item.topics[]`/title) lalu ranking foryou-style.
- `feed/topicCategories.ts` (BARU): map 5 kategori nav → keyword/regex set. MVP keyword-based; formalize nanti
  via field `feedItems.topicCategory` (LLM-classified saat ingest). **Catatan**: 5 kategori ini bergaya berita
  umum, beda dari `INTEREST_FIELDS` akademik & fokus sains/kesehatan app → lihat Keputusan Terbuka #7.

### Risiko & Tes
- Risiko: kategori umum vs konten sains/kesehatan (sebagian kategori bisa sepi); back-compat deep-link `?view=`;
  "Top" tanpa interest bisa basi (mitigasi recency floor).
- Tes: `mode=top` → urut `trendScore` desc tanpa interest; `mode=topics topic="Tech & Science"` → hanya item match;
  back-compat nav mapping `?view=`.

## Isu 7 — Search + filter global di header kanan atas (lintas-konten, ranked best-match)

### Kondisi saat ini (terverifikasi)
- Search input + `RangePopover` (filter) ada di `DiscoveryToolbar` (`discovery-toolbar.tsx:65-122,124-175`),
  **hanya** render saat `view=papers`, menulis `nav.q`/`nav.range`; `searchPapers` (eksternal) yang eksekusi.
- `feedItems` **TIDAK punya searchIndex** (hanya `by_dedupe_key`/`by_kind_trend`/`by_kind_published`).

### Target
Pindah search + filter ke `ExploreSurfaceHeader` kanan atas; berlaku **global** (semua mode). `q` non-kosong →
hasil pencarian lintas-konten (paper+news+claim+topic) di-rank by relevance; `q` kosong → feed mode (Isu 6).
Filter (`range`→`fromYear`) berlaku untuk feed & search.

### Backend (file-level)
- Tambah field denormalized `searchText: v.string()` ke `feedItemFields` (additive) = `title + " " + summary +
  " " + topics.join(" ")` (lowercased), di-set di semua write path (Convex search index hanya 1 `searchField`).
- `schema.ts` `feedItems`: tambah `.searchIndex("search_text", { searchField: "searchText", filterFields: ["kind"] })`.
- Query baru `searchDiscovery` (paginated): `args { paginationOpts, q, kinds?, fromYear? }` →
  `db.query("feedItems").withSearchIndex("search_text", q => q.search("searchText", text))` (relevance-ranked native),
  filter `fromYear`/hidden post-fetch (page-shrink guard sama spt Isu 5). Reuse `shapeFeedItem`.
- Cakupan: paper (sudah di feed via cron) + news + dll. **Opsional augment**: untuk paper belum ter-cache,
  panggil `searchPapers` eksternal + merge (cold query) — atau defer (Keputusan Terbuka #8).

### Frontend (file-level)
- Ekstrak search input + `RangePopover` dari `DiscoveryToolbar` → komponen baru `DiscoveryHeaderControls` di
  kanan `ExploreSurfaceHeader` (grid kanan, di samping chat toggle). Bind `nav.q` (**debounce 300ms**) + `nav.range`.
- `discovery-page.tsx`: bila `nav.q` non-kosong → `useConvexPaginatedQueryData(api.feed.searchDiscovery, { q, fromYear, kinds })`
  (relevance order); else `getFeedPaginated(mode, topic)`. Empty/loading/CaughtUp state sama (Isu 5).
- **Hapus `DiscoveryToolbar` lama** (search pindah ke header → toolbar obsolete).
- `explore-surface-header.tsx`: kolom kanan grid `[1fr_auto_1fr]` memuat chat toggle + search + filter;
  responsif (mobile: search→ikon `SearchIcon`, filter→ikon `FilterIcon`).

### Risiko & Tes
- Risiko: `searchIndex` butuh schema push + (greenfield) backfill `searchText` row lama; latency skew bila merge
  external; UX wajib tampilkan "Hasil untuk '{q}'" + tombol clear; Convex search = relevance → mungkin perlu
  tie-break recency.
- Tes: `searchDiscovery` `q="vaksin"` → match title/summary/topics lintas kind, relevance order; filter kind +
  `fromYear`; item lama tanpa `searchText` → backfill (paginated mutation).

## Isu 8 — Ganti "save" → Save to Workspace (popover pilih workspace) + ikon konsisten app-wide

### Kondisi saat ini (terverifikasi — DUA jalur save, ikon TIDAK konsisten)
- **"Save/bookmark" (logic sendiri)**: `onSave` → `saveDiscoveryItem` (`feed.ts:415-426`) → `savedFeedItems` +
  **bump `userFeedInterests` +1** (`feed.ts:675`). UI inkonsisten: `discovery-list-item.tsx:198-204`
  `BookmarkIcon`/`CheckIcon` ("Simpan"/"Tersimpan"); `discovery-item-card.tsx:304` `LikeButton` **`HeartIcon`**;
  `reader-actions.tsx` `BookmarkIcon` (`saveItem`). State `saved` dari `getSavedDiscoveryRefs` (`feed.ts:166-213`).
- **"Save to workspace" (sudah ada, paper-only)**: `onSaveToWorkspace` → `WorkspacePickerDialog` →
  `handleSaveToWorkspace` (`discovery-page.tsx:216-226`) → `api.artifacts.createUrl`. UI: `discovery-list-item.tsx:191-196`
  `FolderIcon` (paper-only); `discovery-item-card.tsx:366` `FolderIcon` (dropdown); `explore-detail-page.tsx:117`
  **`PlusIcon`** "Add to library" (inkonsisten).

### Target
Hapus jalur **bookmark**; jadikan **Save-to-Workspace satu-satunya** action save untuk **semua kind**
(news/claim/paper/topic/idea) di explore + detail; popover pilih workspace (reuse `WorkspacePickerDialog`);
**SATU ikon konsisten** di seluruh app.

### Frontend (file-level)
- Promote `onSaveToWorkspace` ke semua kind (bukan paper-only): `discovery-list-item.tsx` (hapus blok
  `BookmarkIcon` `onSave`; ikon save-to-workspace untuk semua), `discovery-item-card.tsx` (hapus `LikeButton`
  `HeartIcon`), `reader-actions.tsx` (tambah `onSaveToWorkspace` + `WorkspacePickerDialog`).
- **Ikon kanonik** = **`FolderIcon`** (`Folder01Icon`, `icons.tsx:170`) — sudah dipakai discovery workspace-save.
  Ganti **`PlusIcon`** di `explore-detail-page.tsx:117` → `FolderIcon`. (Opsi: tambah `FolderAddIcon`
  (`FolderAdd01Icon`) untuk semantik "+folder" — Keputusan Terbuka #9.) **Sentralisasi** via komponen
  `SaveToWorkspaceButton` (atau konstanta ikon) agar enforced.
- **Audit app-wide**: cari SEMUA pemakaian `WorkspacePickerDialog` + `createUrl` + ikon save-to-workspace
  (mis. thread/workspace library), seragamkan ke ikon kanonik.

### Backend / signal
- `WorkspacePickerDialog` + `artifacts.createUrl` sudah ada → reuse. **Verifikasi `createUrl` menerima URL
  artifact generic** (non-paper: news/claim) — URL = `resolvedUrl ?? url` (Isu 2f) + judul/metadata.
- **Sinyal interest**: save lama bump interest +1; `createUrl` tidak. Agar personalisasi tak hilang → pada
  sukses save-to-workspace, panggil `recordDiscoveryInteraction(itemRef, 'save')` / `bumpInterests +1`
  (`recordDiscoveryInteraction` sudah punya `kind:'save'` tapi belum dipanggil — `feed.ts:455-475`).
- **State "saved" hilang**: dengan bookmark dihapus, toggle "Tersimpan" + filter saved hilang. Save-to-workspace
  = aksi fire+toast ("Disimpan ke {workspace}"), bukan toggle persisten. Konsekuensi: **`getFeedPaginated`
  (Isu 5b) drop `saved`**; `getSavedDiscoveryRefs`/`saveItem`/`saveDiscoveryItem`/`savedFeedItems` jadi **dead**
  (additive cleanup terpisah). **Hide** (`hiddenFeedItems`, `ThumbsDownIcon`) TETAP.

### Risiko & Tes
- Risiko: kehilangan sinyal interest (mitigasi: bump on workspace-save); kehilangan toggle saved (produk: terima);
  `WorkspacePickerDialog` = modal (bukan instant toggle) — UX shift; `createUrl` heavyweight (URL ingestion) untuk
  news; cold-start tanpa workspace → picker wajib tawarkan **buat workspace baru**.
- Tes: save-to-workspace semua kind → `createUrl` dipanggil + interest bump; grep memastikan tak ada
  `PlusIcon`/`BookmarkIcon`/`HeartIcon` untuk save-to-workspace (ikon kanonik saja); reader pages punya save-to-workspace.

## Isu 9 — "Teliti klaim ini" → "Tanya Astra" + ganti ikon Sparkles

### Kondisi saat ini (terverifikasi)
Action mulai-riset (`onTeliti`) pakai copy "Teliti ini"/"Teliti klaim ini"/"Teliti pertanyaan ini" + `SparklesIcon`.
Lokasi action: `discovery-list-item.tsx:136-146` ("Teliti ini", Sparkles), `discovery-item-card.tsx:331-339`
(dropdown), `idea-dialog.tsx:174-176` ("Teliti pertanyaan ini"), `reader-actions.tsx:57` (Sparkles) dgn
`researchLabel` dari `fact-detail-page.tsx:291` ("Teliti klaim ini") + `news-detail-page.tsx:108` ("Teliti ini").
Handler binding `discovery-page.tsx:229`.

### Changes (file-level)
- **Copy** → "Tanya Astra" (semua varian): `discovery-list-item.tsx:145`, `discovery-item-card.tsx:339`,
  `idea-dialog.tsx:176`, dan prop `researchLabel` di `fact-detail-page.tsx:291` + `news-detail-page.tsx:108`
  (default `ReaderActions` → "Tanya Astra").
- **Ikon** `SparklesIcon` → **`MessageSquareIcon`** (`Message01Icon`, `icons.tsx:191-192`) HANYA di action
  ask-Astra: `discovery-list-item.tsx:143`, `discovery-item-card.tsx:337`, `idea-dialog.tsx:174`,
  `reader-actions.tsx:57`, `discovery-page.tsx:499`. (Opsi `MessageSquarePlusIcon`.)
- **JANGAN ubah** Sparkles dekoratif di luar scope: `discovery-aside.tsx:209` (header "Sedang ramai") +
  `onboarding-steps.tsx:161` — bukan action Tanya Astra (Keputusan Terbuka #10 bila ingin global).
- **Handler rename (opsional, code-org)**: `onTeliti` → `onAskAstra` (`discovery-item-card.tsx:50`,
  `discovery-list-item.tsx`, `idea-dialog.tsx`, `discovery-page.tsx:229`, `home-explore-bento.tsx`); prop
  `researchLabel` → `askLabel`. (`typecheck` guard.)
- **"Lihat bukti"** (`Quote`) + **"Cari celah"** (`CompassIcon`) TIDAK berubah.

### Risiko & Tes
- Risiko: `MessageSquareIcon` stroke beda dari Sparkles di 5 konteks ukuran (preview dulu); tone "Tanya Astra"
  cek `BRAND-IDENTITY.md`; rename handler = perubahan lintas-file.
- Tes: verifikasi manual + grep memastikan tak ada `SparklesIcon`/"Teliti" tersisa di action ask-Astra.
- **Catatan**: Isu 9 = pure frontend, **nol perubahan backend** → slice paling independen (bisa di-ship kapan saja).

---

## Fase implementasi & sequencing

Sembilan slice dikelompokkan ke **4 fase**. Tiap fase adalah unit yang koheren dan bisa di-ship; di
dalamnya slice berurutan. **Fase 0 (opsional) bisa ditarik ke depan** karena murni frontend & nol
dependency.

> **Aturan deploy (wajib):** untuk tiap slice yang menyentuh backend + frontend → (1) **owner
> `convex deploy` prod** (schema/index/validator additive, query/cron baru) + verifikasi, **lalu**
> (2) deploy frontend yang mengonsumsinya. Schema/validator additive (`google_news`, `orderAt`,
> `by_order`, `searchText`/`searchIndex`) harus ada di prod **sebelum** write path/cron/query yang
> mengisinya jalan. (`convex deploy` prod = langkah manual owner — lihat memory.)
>
> **Gate tiap slice:** `bun run typecheck` + `bun run lint` + `bun run --filter '@aqsha/convex' test`
> + `npx convex dev --once`. Frontend (apps/web) tanpa test runner → verifikasi manual.

### Ikhtisar fase

| Fase | Fokus | Slices | Sifat | Hasil utama |
|------|-------|--------|-------|-------------|
| **0** ✅ | Polish copy/ikon | 9 | Frontend | "Tanya Astra" + ikon baru — **SELESAI** `6e27a98` |
| **1** ✅ | Lepas Exa & sumber berita gratis | 1, 2 | Backend | Explore tanpa Exa, berita via Google News — **SELESAI** `c9104d4` |
| **2** ✅ | Hidrasi terpadu & personalisasi | 3, 4 | Backend | Cron 3 jam staggered + search interest-aware — **SELESAI** `d427871` |
| **3** ✅ | Pengalaman jelajah baru | 5, 6, 7 | Backend + Frontend | Infinite scroll + nav For You/Top/Topics + search global — **SELESAI** `1a51d83`/`334e9dc`/`89fa042` |
| **4** ⬜ | Aksi terpadu | 8 | Frontend-led | Save-to-Workspace konsisten (+ ikon app-wide) — **belum** |

> **Peta dependency:** Fase 0 & 1 & 2 saling independen (boleh paralel/urut bebas). Fase 3 berurutan
> ketat: **5 → 6 → 7** (semua menyentuh `getFeedPaginated`/`nav`/header bersama). Fase 4 (Slice 8) butuh
> Slice 5 sudah ada (untuk drop `saved` dari `getFeedPaginated`) → jalankan **setelah Fase 3**.

---

### Fase 0 (opsional) — Polish "Tanya Astra" — ✅ SELESAI 2026-06-17 (commit `6e27a98`)
**Tujuan:** rebrand action riset jadi conversational, nol risiko backend. **Prasyarat:** tidak ada.
> Lihat **§ Yang dikerjakan di Fase 0 (2026-06-17)** di atas untuk rincian + penyimpangan.

- ✅ **Slice 9 — Tanya Astra (Isu 9).** Pure frontend: copy "Teliti …" → "Tanya Astra" (5 lokasi) + ikon
  `SparklesIcon` → `MessageSquareIcon` (hanya action ask-Astra) + rename `onTeliti`→`onAskAstra` /
  `researchLabel`→`askLabel`. **Nol backend.** Grep bersih (tak ada Sparkles/"Teliti" tersisa di action);
  `typecheck` hijau. **DONE.**

### Fase 1 — Lepas Exa & sumber berita gratis (backend) — ✅ SELESAI 2026-06-17 (commit `c9104d4`)
**Tujuan:** hilangkan biaya Exa dari explore, hidupkan lane berita via Google News RSS (gratis), bersihkan
Exa dari ingest. **Prasyarat:** pra-cek empiris Google News (robots.txt / 302-follow / rate dari IP Convex).
> Lihat **§ Status implementasi (progress log)** di atas untuk rincian eksekusi, temuan empiris, 6 fix
> review adversarial, penyimpangan, dan langkah owner yang tersisa.

- ✅ **Slice 1 — Cutover berita Exa→Google News (Isu 1a + Isu 2 penuh).** Hapus lane Exa news + tambah Google
  News provider/refresh/validator/cache(`google_news`)/enrichment + purge `exa_news`. Cron sementara
  `feed:google-news` 3h (digabung ke orchestrator di Slice 4). Deploy Convex dulu. Ship: lane berita hidup
  via Google News (lane tak pernah kosong). **DONE** — enrichment dibuat konvergen (`enrichAttempts`).
- ✅ **Slice 2 — Hapus Exa fallback explore + ingest (Isu 1b + 1c).** Rantai explore OpenAlex→arXiv→Jina→
  Crossref; ingest Jina-only. Literal `Exa`/`exa` dipertahankan (additive). Tes. Ship. **DONE.**

### Fase 2 — Hidrasi terpadu & personalisasi (backend) — ✅ SELESAI 2026-06-17 (commit `d427871`)
**Tujuan:** satu siklus hidrasi 3 jam + feed/search hormati interest. **Prasyarat:** Slice 1 (referensi
`refreshGoogleNews` masuk orchestrator di Slice 4).

- **Slice 3 — Interest-aware search + taksonomi keyword (Isu 3).** `feed/interestKeywords.ts`, reuse
  `userInterestTopics`, `searchPapers` recommendations interest-seeded. Tes interest. Ship.
- **Slice 4 — Konsolidasi cron 3 jam (Isu 4).** `hydrateCycle` orchestrator (`scheduler.runAfter` staggered,
  tanpa `backfillIndonesian`), satu cron `feed:hydrate-cycle`, hapus cron lama (termasuk `feed:google-news`
  sementara). Tes hydrate. Ship.

### Fase 3 — Pengalaman jelajah baru (backend + frontend) — **berurutan 5 → 6 → 7** — ✅ SELESAI 2026-06-17 (`1a51d83`/`334e9dc`/`89fa042`)
**Tujuan:** surface explore baru — infinite scroll + nav For You/Top/Topics + search global. **Prasyarat:**
Fase 1–2 (feed sudah terisi Google News + paper + claim/topic). Tiap slice: deploy Convex dulu, lalu frontend.

- **Slice 5 — Infinite scroll (Isu 5).** `orderAt` (non-optional) + index `by_order` + backfill,
  `getFeedPaginated`, helper `useConvexPaginatedQueryData`, discovery-page auto-scroll + state lengkap
  (CaughtUp/empty/loading/guard), aside ber-cap terpisah. **Update PRD (D1).** Tes paginated.
- **Slice 6 — Nav For You/Top/Topics (Isu 6).** Perluas `getFeedPaginated` (`mode`/`topic`) +
  `feed/topicCategories.ts` + `DiscoveryModeNav` + popover Topics + migrasi `nav.view`→`nav.mode`/`topic`
  (+ back-compat `?view=`). Tab Papers dihapus. Tes mode/topics.
- **Slice 7 — Search global di header (Isu 7).** `searchText` (denormalized) + `searchIndex` + backfill +
  query `searchDiscovery` + `DiscoveryHeaderControls` (pindah search/filter ke header kanan, **hapus
  `DiscoveryToolbar`**). Tes search relevance + filter.

### Fase 4 — Aksi terpadu (frontend-led)
**Tujuan:** satu aksi Save-to-Workspace untuk semua kind + ikon konsisten app-wide. **Prasyarat:** Slice 5
(untuk drop `saved` dari `getFeedPaginated`).

- **Slice 8 — Save → Save-to-Workspace + ikon konsisten (Isu 8).** Hapus jalur bookmark; promote
  `onSaveToWorkspace` ke semua kind; ikon kanonik (default `FolderIcon`) di seluruh app (ganti `PlusIcon`/
  `BookmarkIcon`/`HeartIcon`); `createUrl` generic (non-paper); bump interest on save; drop `saved` dari
  `getFeedPaginated`; `savedFeedItems`/`saveDiscoveryItem` jadi dead (cleanup terpisah). Audit app-wide.
  Tes save-to-workspace.

---

**Catatan lintas-fase.** Tidak ada "Slice 0 rename Exa" (churn tak perlu). Penghapusan literal
`Exa`/`exa_news`/`exa` + `exaSearchGlobal` + tabel dead (`savedFeedItems`, `feedSources`) = **pekerjaan
cleanup terpisah** jauh kemudian, hanya setelah purge tuntas + verifikasi runtime 0-usage (Convex
insights/logs) — **bukan** bagian rencana ini.

---

## Risiko & mitigasi

- **Google News longevity** (tak ada API resmi/SLA; format URL berubah total Juli 2024). → Abstraksi di
  `feed/providers/googleNews.ts` agar bisa di-swap ke RSS publisher langsung (Kompas/detik/Antara).
  Pertimbangkan RSS publisher resmi sebagai primer jangka panjang.
- **URL decode rapuh** (format baru `CBM...AU_yqL` wajib network; batchexecute rentan 429, kadang
  breakage total). → Decode **lazy/best-effort**, bukan blocking. Simpan redirect + publisher domain
  apa adanya. Coba 302-follow dulu, batchexecute fallback. Convex tak punya proxy rotation → decode
  volume tinggi tak andal; resolve on-demand/batch kecil.
- **ToS gray area** (polling server-side). → Volume rendah (8×/hari per seed, headline-only), cek
  `robots.txt`, jangan ambil full-content dari Google News (ambil dari publisher), jeda 1–2 dtk.
  Dokumentasikan ketergantungan feed tak resmi + rencana cadangan.
- **`fast-xml-parser` edge-case** (`<item>` tunggal jadi object; CDATA/entity; `pubDate` absen). →
  `isArray:(n)=>n==="item"`, unescape, fallback `pubDate→now`. Test fixture single-item.
- **Thundering herd cron 3 jam.** → `runAfter` stagger 20/40/60/100/120m; tiap provider self-paced
  (GDELT `sleep` ~5.2s, Google News jeda 1–2s).
- **Reader news regresi** (Isu 2f). → `resolvedUrl` + `sourceLabel` publisher + enrichment
  `fetchArticlePreview` **wajib**.
- **Page-shrink + hidden post-paginate** → guard maks-N auto-loadMore + `buildBriefRows` dari `results`
  terakumulasi.
- **Ranking interest hanya per-page** (Strategi A). → Terima untuk MVP; eskalasi Strategi B
  (`feedRanking` materialized) bila kualitas kurang. (Catatan: interest per-user → rankKey global tak
  bisa per-user interest-aware; reorder per-page tetap pendekatan paling pragmatis.)
- **Narrowing validator tak sengaja** → `ReturnsValidationError` row lama. Mitigasi: **additive saja**
  di rencana ini; literal lama tetap.
- **Deploy out-of-order** → "Couldn't find function"/schema gagal. Mitigasi: aturan deploy Convex-dulu.

---

## Keputusan terbuka (tersisa)

1. **Purge vs keep row `exa_news`/explorePapers `Exa`**: default = **keep literal (additive)** +
   purge row news ephemeral. Penghapusan literal ditunda (butuh purge tuntas + verifikasi). OK?
   _[Fase 1]_ Diterapkan sesuai default: literal dipertahankan; fungsi `purgeLegacyExaNews` (paginated)
   tersedia untuk dijalankan owner sekali — **belum** dijalankan.
2. **Strategi pagination**: mulai dari **A** (kronologis `orderAt` + reorder per-page). Naik ke B
   (materialized) bila perlu. Setuju mulai A?
3. **Infinite scroll Papers view**: default **hanya Brief** yang auto-scroll; Papers tetap action
   `searchPapers` limit 12 (+ tombol "muat lebih" opsional). OK?
4. **Backfill `orderAt`**: tergantung volume `feedItems` prod. Greenfield → skip; ada data lama →
   backfill paginated. Konfirmasi volume.
5. **RSS publisher langsung** (Kompas/detik/Antara) sebagai sumber primer jangka panjang vs Google News
   agregator — keputusan arsitektur lanjutan (bukan blocker MVP).
6. **Enrichment cadence** (`enrichGoogleNewsArticles`): seberapa agresif (per-siklus vs on-detail-open)
   — trade-off kualitas reader vs volume request/rate-limit dari IP Convex.
   _[Fase 1]_ Sementara: per-siklus (di-self-schedule dari `refreshGoogleNews`, batch 6, retry di-cap
   `MAX_ENRICH_ATTEMPTS=2` → konvergen). **Catatan empiris penting:** decode `CBMi…` mayoritas gagal
   sekarang, jadi enrichment sebagian besar no-op (cuma menandai attempt). **on-detail-open** jadi opsi
   lebih menarik — keputusan masih TERBUKA.
7. **Taksonomi Topics (Isu 6)**: 5 kategori `[Tech & Science, Business, Arts & Culture, Sports, Entertainment]`
   bergaya berita umum vs fokus sains/kesehatan app & `INTEREST_FIELDS` akademik (15). MVP = keyword-map
   (`feed/topicCategories.ts`); formalize via field `topicCategory` (LLM-classified)? Konfirmasi daftar 5
   kategori final + apakah perlu disesuaikan ke sains/kesehatan.
8. **Cakupan search global (Isu 7)**: hanya `feedItems` ter-cache (via `searchIndex`) — default — atau **+augment**
   `searchPapers` eksternal untuk paper yang belum ter-cache (hasil lebih kaya, latency lebih tinggi)?
9. **Ikon kanonik Save-to-Workspace (Isu 8)**: `FolderIcon` (default, churn minimal) atau tambah `FolderAddIcon`
   (`FolderAdd01Icon`) untuk semantik "+folder"?
10. **Ikon Tanya Astra (Isu 9)**: `MessageSquareIcon` (default) vs `MessageSquarePlusIcon` vs glyph Astra khusus?
    Apakah Sparkles dekoratif (`discovery-aside.tsx:209` "Sedang ramai", `onboarding-steps.tsx:161`) ikut diganti
    atau dibiarkan?
11. **Save gantikan bookmark sepenuhnya (Isu 8/D6)**: konfirmasi menghilangkan toggle "Tersimpan" +
    `savedFeedItems` jadi dead (vs mempertahankan keduanya). Default plan: ganti penuh.
12. **Rename handler (Isu 9)**: `onTeliti`→`onAskAstra` & `researchLabel`→`askLabel` (selaras prinsip "code
    terorganisir") atau biarkan nama handler lama? Default plan: rename.

---

## Lampiran A — Referensi Google News RSS (terverifikasi live, edisi ID)

- **Endpoint** (semua terima `hl=id&gl=ID&ceid=ID:id`):
  - Top: `https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id`
  - Topic: `https://news.google.com/rss/headlines/section/topic/{TOPIC}?...` —
    `TOPIC ∈ {WORLD,NATION,BUSINESS,TECHNOLOGY,ENTERTAINMENT,SCIENCE,SPORTS,HEALTH}`
  - Search (utama): `https://news.google.com/rss/search?q={q}&hl=id&gl=ID&ceid=ID:id`
- **Operator `q`** (URL-encode): `when:7d` (rentang waktu, `Nh`/`Nd`/`Nm`), `after:`/`before:YYYY-MM-DD`,
  `intitle:`/`allintitle:`, `allintext:`, `inurl:` (terkonfirmasi; `site:` perlu uji), `"frasa"`, `OR`,
  `-eksklusi`. Contoh: `q="vaksin" OR "imunisasi" when:7d -hoaks`.
- **Batas item**: Search ~100, Top ~25, Topic ~30–50.
- **Skema item**: `<title>` (di-append `" - {publisher}"` → strip), `<link>` (redirect ter-enkode),
  `<guid isPermaLink="false">` (= bagian setelah `/articles/`; **dedup key ideal**), `<pubDate>` (RFC822
  GMT), `<description>` (HTML escaped, anchor+publisher — **bukan** ringkasan; snippet miskin),
  `<source url="https://publisher.go.id">Nama Publisher</source>` (cara terbaik dapat publisher+domain
  tanpa decode).
- **Parser** (Convex/V8): `new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_",
  isArray:(n)=>n==="item" })`. `<source url>` → `@_url`.

## Lampiran B — File kunci (tervalidasi)

`crons.ts:15-68` · `feed.ts:58-135,310-324,554-567,798+` · `feed/sources.ts:99-177` ·
`feed/providers/news.ts` · `feed/providers/gdelt.ts` · `feed/validators.ts:11-17,55-101` ·
`feed/bahasa.ts:17` · `feed/interests.ts` · `agent/providers/providerCache.ts` (Provider+providerValidator) ·
`agent/providers/exaClient.ts` · `agent/providers/externalProviders.ts` · `explore.ts:44-144` ·
`explore/validators.ts` · `explore/model.ts` · `papers/ingest/ingest.ts:137-140` ·
`papers/articlePreview.ts` · `limits.ts` (exaSearchPerUser KEEP / exaSearchGlobal) · `schema.ts`
(feedItems, userFeedInterests by_owner_topic, externalLookupCache.provider, feedSources=mati) ·
`onboarding.ts:38-54` (INTEREST_FIELDS) · `convex.config.ts` (rag/rateLimiter/polar — TANPA migrations) ·
`discovery-page.tsx:67,145-148,414-459,476` · `home-explore-bento.tsx:31` ·
`news-detail-page.tsx` (buildNewsSeed, ReaderSourceCard) · `convex-query.ts:37-63` ·
`pdf-artifact-viewer.tsx:201,398` (pola IntersectionObserver) · `package.json:66` (fast-xml-parser ada).

## Lampiran C — File kunci UI/UX (Isu 6–9, tervalidasi)

**Nav/header (Isu 6/7)**: `use-discovery-nav.ts:12-16,29-31,46-51` (view/q/range nuqs) ·
`discovery-toolbar.tsx:18-21` (VIEW_LABELS Brief/Papers), `:27-60` (DiscoveryViewTabs), `:65-122` (search+toolbar),
`:124-175` (RangePopover) · `explore-surface-header.tsx:22-103` (grid `[1fr_auto_1fr]`, centerSlot) ·
`explore-chat-shell.tsx:20-97` · `discovery-page.tsx:59-79` (branch brief/papers), `:273-281` (toolbar conditional) ·
`discovery-aside.tsx:33-62` (onSelectTopic) · `components/ui/popover.tsx`, `dropdown-menu.tsx`, `tabs.tsx`.
**Search backend (Isu 7)**: `schema.ts:454-459` (feedItems index: by_dedupe_key/by_kind_trend/by_kind_published —
**NO searchIndex**) · `explore.ts:44-144` (searchPapers eksternal).
**Save (Isu 8)**: `discovery-list-item.tsx:191-196` (FolderIcon paper-only onSaveToWorkspace), `:198-204`
(BookmarkIcon/CheckIcon onSave) · `discovery-item-card.tsx:51-52` (onSave/onSaveToWorkspace), `:304` (LikeButton
HeartIcon), `:366` (FolderIcon dropdown) · `discovery-page.tsx:103,216-226,237` (createUrl + handleSaveToWorkspace) ·
`explore-detail-page.tsx:117` (**PlusIcon** "Add to library"), `:178-184` (WorkspacePickerDialog) ·
`reader-actions.tsx:9,25` (BookmarkIcon + saveItem) · `workspace-picker-dialog.tsx:17-103` ·
`feed.ts:166-213` (getSavedDiscoveryRefs), `:376-385` (saveItem), `:415-426` (saveDiscoveryItem), `:455-475`
(recordDiscoveryInteraction kind='save', belum dipanggil), `:675` (bumpInterests +1) · `artifacts.ts:455-523`
(createUrl, NO interest bump) · icons: `icons.tsx:170` FolderIcon (Folder01Icon), `:135` BookmarkIcon, `:177`
HeartIcon (FavouriteIcon), `:141` CheckIcon.
**Tanya Astra (Isu 9)**: copy+icon di `discovery-list-item.tsx:136-146` ("Teliti ini"+Sparkles) ·
`discovery-item-card.tsx:50,331-339` · `idea-dialog.tsx:174-176` ("Teliti pertanyaan ini") ·
`reader-actions.tsx:57` (Sparkles, researchLabel) · `fact-detail-page.tsx:291` ("Teliti klaim ini") ·
`news-detail-page.tsx:108` ("Teliti ini") · `discovery-page.tsx:229,499` (onTeliti binding) · ikon ganti:
`icons.tsx:191-193` MessageSquareIcon (Message01Icon)/MessageSquarePlusIcon (MessageAdd01Icon) · **JANGAN ubah**
`discovery-aside.tsx:209` + `onboarding-steps.tsx:161` (Sparkles dekoratif, di luar scope).
