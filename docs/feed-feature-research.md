# Riset Fitur "Feed" Aqsha — Hasil & Rekomendasi

> Hasil deep-research (multi-agent, 28 sumber diekstrak, 135 klaim, diverifikasi adversarial) + pemetaan kode Aqsha + arahan produk dari pemilik.
> Tanggal: 2026-06-06.

## Keputusan arah (dari pemilik)
- **Audiens:** Indonesia dulu (berita + ekosistem cek-fakta lokal), paper akademik tetap global.
- **Isi feed:** campuran berimbang — (1) berita sains/riset, (2) klaim viral ber-badge fakta/hoax, (3) pemicu ide riset.
- **Tujuan utama:** menjembatani user dari *"belum tahu mau meneliti apa"* → pertanyaan/thread riset konkret.
- **Aksi per item:** lihat bukti & sumber · simpan & kumpulkan · mulai riset dari item.
- **Visual:** bukan daftar teks seragam seperti Explore — sisipkan diagram, grafik, gambar (mixed-media).

**Keputusan lanjutan (setelah riset):**
- **Lajur B (cek fakta) cakupan = sains + kesehatan saja** (klaim yang bisa diadu ke paper akademik: kesehatan, vaksin, iklim, makanan/herbal). Scam/penipuan/program pemerintah dikecualikan dari MVP (arsitektur tetap menyisakan ruang perluasan).
- **Generator pertanyaan riset (RAG, bertambat bukti) MASUK MVP** — bukan v2. "Teliti ini" hadir bersama generator pertanyaan ber-skor novelty/feasibility + HITL (pilih/sunting sebelum jalan).

---

## 0. Ringkasan eksekutif

Feed sebaiknya dibangun sebagai **permukaan discovery sejajar Explore** dengan **tiga lajur konten** yang berbagi satu model kartu mixed-media dan satu CTA inti: **"Teliti ini"**. Tiga prinsip non-negosiabel yang muncul kuat dari riset:

1. **Jangan pernah auto-melabeli "hoax" sendiri.** Klasifikasi stance otomatis tidak andal justru di kelas yang menentukan verdict (scite: F=0.59 untuk *contrasting*, audit lapangan lebih rendah). Untuk lajur fakta/hoax, **agregasi verdict manusia** (Mafindo/CekFakta via ClaimReview) jadi sumber kebenaran; AI hanya untuk retrieval, ringkasan bukti, dan routing — selalu dengan bukti tertaut + tingkat keyakinan. Pakai **taksonomi berjenjang**, bukan biner.
2. **Bukti dulu, bukan label telanjang.** Setiap verdict harus menampilkan kalimat bukti + sumber + penjelasan. Label berpenjelasan terbukti lebih efektif menurunkan kepercayaan pada misinformasi (dan meningkatkan recall sumber) dibanding stempel kosong.
3. **Desain "tenang", anti-doomscroll.** Optimalkan metrik **konversi inspirasi→riset**, bukan dwell-time. Pakai feed berbatas (caught-up state, sesi), serendipity terukur (relevansi × keberagaman × kejutan), dan transparansi "kenapa ini muncul".

MVP yang realistis dengan stack sekarang: **OpenAlex (trending paper) + Exa news (sudah ada) + Google Fact Check API & TurnBackHoax (lajur fakta/hoax) + GDELT (tren berita ID gratis)**, di-cache lewat cron Convex, dirender sebagai kartu bento, dengan tombol "Teliti ini" yang men-seed thread/workspace + memanggil agent deep-research yang sudah ada.

---

## 1. Fondasi yang sudah ada di kode (jangan dibangun ulang)

| Kebutuhan feed | Sudah ada di Aqsha | Lokasi |
|---|---|---|
| Pencarian paper multi-provider | `searchPapers` (OpenAlex→arXiv→Exa→Jina) | `packages/convex/convex/explore.ts`, `exploreModel.ts` |
| Cache paper hasil temuan | tabel `explorePapers` | `schema.ts` |
| Cache lookup eksternal (TTL 24 jam) | tabel `externalLookupCache` (openalex/crossref/arxiv/exa/jina) | `schema.ts` |
| **Mesin "fakta/hoax"** | verifikasi klaim → tabel `citationChecks` (`supported/partially_supported/contradicted/unsupported` + evidence + sourceIds) | `agent/deepResearch.ts` |
| Web/news search & fetch | tool `searchWeb` (Exa kategori `news` + fallback Jina), `searchArxiv`, `lookupDoi` | `agent/researchTools.ts` |
| Sumber & kutipan | `researchSources`, `researchExtracts` | `schema.ts` |
| HITL/approval | `askUser`, `needsApproval`, `presentWorkspacePlan` | `agent/hitlTools.ts` |
| Shell halaman + UI primitives | `WorkspaceShell`, `ExploreSurfaceHeader`, Card/Badge/Tabs, ikon Hugeicons | `apps/web/features/explore/`, `@aqsha/ui` |
| Slot navigasi | tambah `PrimaryNavLink` setelah "Jelajahi" | `apps/web/components/app-sidebar.tsx:~209` |

**Yang belum ada:** tabel feed/news, model interest user, dan **cron** untuk refresh berkala. Tiga inilah pekerjaan backend inti yang baru.

> Implikasi penting: lajur "fakta/hoax" **bukan fitur dari nol** — `citationChecks` sudah merepresentasikan verdict berjenjang berbasis bukti. Yang perlu ditambah hanya: input klaim (dari berita viral/ClaimReview) dan penyajiannya sebagai badge.

---

## 2. Konsep: tiga lajur, satu tujuan

```
FEED
├── Lajur A — Berita sains & riset hangat      → inspirasi
├── Lajur B — Klaim viral + badge fakta/hoax   → literasi + sudut riset
└── Lajur C — Pemicu ide / topik naik daun     → jembatan ke riset
            ↘ semua kartu punya CTA: [Teliti ini] [Lihat bukti] [Simpan]
```

Satu sistem kartu, beberapa *varian tipe*, satu aliran ranking. Ketiganya bermuara ke CTA "Teliti ini" yang men-seed thread riset.

---

## 3. Set fitur — MVP vs Nanti

### MVP (v1) — buktikan loop "inspirasi → riset"
1. **Halaman `/app/feed`** sejajar Explore, kartu bento mixed-media, infinite-but-finite (ada penanda "Kamu sudah update").
2. **Lajur A — Trending papers/news**: OpenAlex (`from_publication_date` + `sort=cited_by_count:desc`) untuk paper; Exa `news` (sudah ada) untuk berita sains. Di-cache via cron.
3. **Lajur B — Cek fakta (agregasi, bukan auto-label)**: tarik verdict ClaimReview lewat **Google Fact Check API** (`languageCode=id`, `maxAgeDays`) + ingest **TurnBackHoax**. Badge = label resmi fact-checker + tautan sumber. **Tidak ada verdict yang dibuat AI sendiri di MVP.**
4. **CTA "Teliti ini"**: satu klik → buat thread (atau workspace) ter-seed judul/abstrak/URL item → jalankan agent deep-research yang sudah ada. Ini fitur pembeda inti.
5. **Simpan/koleksi**: bookmark item ke koleksi (sekaligus jadi sinyal interest positif — lihat §6).
6. **Drawer "Lihat bukti"**: tampilkan klaim, verdict, kalimat bukti, dan daftar sumber (reuse pola `citationChecks`/`researchSources`).
7. **Onboarding interest ringan + "kenapa ini muncul"**: pilih 3–5 topik saat pertama buka; tiap kartu beri label alasan ("Karena kamu menyimpan X" / "Sedang ramai di bidang Y").

### v2 — personalisasi & kedalaman
8. **Recommender konten-based** ala Scholar Inbox/Semantic Scholar: regresi/embedding atas sinyal simpan(+)/sembunyikan(−); folder/koleksi = model interest.
9. **Generator pertanyaan riset (RAG)**: dari item, hasilkan 2–3 pertanyaan riset *yang ditambatkan ke sumber*, dengan skor Novelty/Feasibility dan rationale "kenapa layak diteliti".
10. **Grafik tren perhatian** per topik (Altmetric/Crossref Event Data/OpenAlex `counts_by_year`).
11. **Mini-graph paper terkait** ala Connected Papers/ResearchRabbit di kartu paper (seed → earlier/later work).
12. **Lajur C eksplisit**: "research gap" dari klaim `contradicted/partially_supported` (kontradiksi = benih celah riset).

### v3 — sosial & lokal-dalam
13. Bagikan/diskusi item ke tim/workspace; anotasi kolaboratif.
14. **Grounding lokal**: untuk klaim ber-rasa Indonesia (jamu/herbal, mitos bencana), cari paddan paper di GARUDA/SINTA/Neliti (scraping/partnership) selain OpenAlex.
15. Verdict "AI-assisted" untuk klaim yang *belum* ada ClaimReview-nya — dengan gate keyakinan ketat + label "Belum terverifikasi / perlu konteks" dan **wajib HITL** sebelum tampil sebagai apa pun selain "perlu konteks".

---

## 4. Sumber konten & data (biaya, limit, catatan)

### Lajur A — paper & berita sains
- **OpenAlex** — *tulang punggung trending paper.* Gratis (CC0), **tanpa API key**; "polite pool" via `mailto`. Limit: 100.000 kredit/hari (list = 10 kredit → ~10k list/hari), maks 100 req/s. Trending = `filter=from_publication_date:YYYY-MM-DD` + `sort=cited_by_count:desc`; `counts_by_year` untuk momentum. Pagination cap 10k hasil (pakai cursor). Catatan: text/vector search mahal (1.000 kredit) — pakai metadata list saja. → **paling hemat & sudah dipakai Aqsha.**
- **Exa** — *berita sains global, sudah di stack.* Neural search, kategori `news`, `startPublishedDate`. Harga 2026: ~$7/1k search (≤10 hasil), contents ~$1/1k halaman, **Monitors** (lacak berita berkala) ~$15/1k. Free 1k/bln, 10 QPS. Lemah untuk berita lokal Indonesia → pasangkan dengan GDELT/RSS lokal.
- **RSS gratis** — bioRxiv/arXiv per-kategori (riset baru sebelum sitasi terbentuk), EurekAlert!/ScienceDaily/Nature news (berita sains terkurasi). Catatan: EurekAlert cenderung promosi → perlakukan sebagai *kandidat untuk diverifikasi*, bukan verdict.
- **Altmetric / Crossref Event Data** — lapisan "perhatian berita/sosial" di atas DOI (sinyal trending). Crossref Event Data gratis; Altmetric komersial.

### Lajur A/C — tren berita Indonesia (gratis)
- **GDELT DOC 2.0** — *pendeteksi tren ID terbaik tanpa biaya.* 100% gratis, jendela bergulir 3 bulan, terjemah 65 bahasa, filter `sourcecountry`/`sourcelang`/tema GKG/tone; output JSON/CSV/RSS; mode `timelinevol` = lonjakan volume artikel = sinyal "lagi ramai". Cap 75 (default) – 250 hasil/query. Negara media kecil under-represented. → Indonesia-first trending tanpa membakar budget.

### Lajur B — cek fakta (agregasi verdict manusia)
- **Google Fact Check Tools API** (`claims.search`) — query korpus ClaimReview global; filter `languageCode=id`, `maxAgeDays` (kunci untuk "klaim hangat"), `reviewPublisherSiteFilter`. Butuh Google Cloud API key. Mengembalikan `textualRating` (mis. "Hoaks"/"Salah"/"Misleading") + publisher + url. **Catatan penting:** Google **menghapus rich result ClaimReview di Search (2025)**, TAPI API + Fact Check Explorer + skema **tetap didukung** — jadi ini valid sebagai sumber data (bukan untuk SEO). Ini cara menarik verdict Mafindo/CekFakta/Tempo **tanpa scraping**.
- **Mafindo / TurnBackHoax / GFD** — sumber Indonesia paling penting. `gfd.turnbackhoax.id` ~8.086 halaman, ID stabil (`GFD-2026-xxxxx`), IFCN-certified (2018), mesin "Yudistira" (juga menyalakan cekfakta.com & chatbot WA Kalimasada). **API key Yudistira bisa diminta.** Pakai taksonomi: *Hoaks, [PENIPUAN], [SALAH], False & Misleading, Impostor Content, False Context, Manipulated, Satire.* **Tidak ada REST API publik** di halaman GFD → ingest via RSS/scrape **atau** minta key Yudistira. Catatan realita: misinformasi ID didominasi **penipuan/scam & program pemerintah** (lowongan palsu MBG, voucher Shopee) selain sains.
- **CekFakta coalition** (Mafindo+AJI+AMSI, sejak Mei 2018, 22+ media: Tempo/Kompas/Liputan6/Detik) — korpus verdict tersindikasi, skala "truth-o-meter" ala PolitiFact, label: *disinformasi, misinformasi, salah, fakta, fitnah, hasut, hoaks, isu, klarifikasi, edukasi, lainnya.* Reuse via Google Fact Check API.
- **Komdigi (eks-Kominfo)** — penentu prioritas topik: Agt 2018–Des 2023 = 12.547 hoaks, **Kesehatan kategori terbesar (2.357)**. Ada dataset "Temuan Isu Hoaks" di Satu Data (data.komdigi.go.id) → seed pemilihan klaim.

### Grounding scholarly lokal (v2/v3)
- **GARUDA** (5,2 jt artikel, 29.460 jurnal), **SINTA**, **Neliti**, payung **BRIN**. **Tak ada API publik** → scraping/partnership. Pakai saat klaim lokal butuh paddan paper berbahasa Indonesia.

**Topik prioritas debunking ID (dari Komdigi + literatur):** kesehatan & vaksin, iklim/bencana, makanan/herbal — di atas fondasi paper global.

---

## 5. Model verdict "fakta/hoax" + taksonomi label

### Prinsip
- **Agregasi > auto-label.** Verdict utama berasal dari fact-checker manusia (ClaimReview). AI Aqsha hanya: cocokkan klaim viral ↔ verdict yang ada, ringkas bukti, tarik paper pendukung. Alasan: akurasi klasifikasi stance otomatis rendah di kelas penentu (scite *contrasting* F=0.59; distribusi nyata 92,6% *mentioning* / 6,5% *supporting* / 0,8% *contrasting* — sinyal verdict langka & rawan salah). Biner juga lebih "akurat" secara metrik justru karena membuang nuansa — itu jebakan, bukan keunggulan.
- **Berjenjang, bukan biner.** Ikuti pola Science Feedback / ClaimReview / Mafindo. Hindari kata inflamatif: scite sengaja ganti "refuting/disputing" → "contrasting".
- **Bukti wajib menyertai label.** Tanpa kalimat bukti + sumber + penjelasan, jangan tampilkan verdict. Label berpenjelasan ↑efektivitas & ↑recall sumber.
- **Sediakan state "perlu konteks / belum terverifikasi"** sebagai jalan keluar dari uncertainty (jangan paksa biner).

### Taksonomi label yang direkomendasikan (dipetakan ke `citationChecks` yang sudah ada)

| Badge UI (ID) | ClaimReview/internal | citationChecks mapping | Warna |
|---|---|---|---|
| **Terbukti** | True / Accurate | `supported` | hijau/mint |
| **Sebagian benar** | Mostly true / Mostly accurate | `partially_supported` | kuning/lemon |
| **Perlu konteks** | Lacks context / Misleading / Missing context | (baru) `needs_context` | amber/coral-soft |
| **Belum terverifikasi** | Unverified / NEI | (baru) `unverified` | abu-abu netral |
| **Keliru** | Mostly false / Inaccurate | `contradicted` | oranye |
| **Hoaks/Salah** | False / Hoaks / [PENIPUAN] | `contradicted` + `severity:high` | merah |

- Selalu simpan & tampilkan: **sumber verdict** (mis. "Diperiksa Mafindo/TurnBackHoax"), **tanggal**, **provenance klaim** (asal viral), **kalimat bukti**, dan **paper global** yang relevan.
- **Emit ClaimReview (schema.org)** untuk verdict yang Aqsha buat sendiri (interop + Fact Check Explorer), walau bukan lagi keuntungan SEO.
- Untuk badge bukti ilmiah berbasis sitasi, **pertimbangkan badge scite (embed JS gratis by DOI)** sebagai pelengkap visual instan.

### Tampilan badge (meter bukti)
Tampilkan **meter** kecil (mis. 4 mendukung / 1 kontra dari 5 sumber) + persen keyakinan, klik → drawer bukti. Pola "tally + tooltip + link ke sumber" terbukti (scite) sebagai cara memadatkan kekuatan bukti yang bisa di-inspeksi, bukan dipercaya buta.

---

## 6. Ranking & personalisasi feed

### Model interest (cold-start → adaptif)
- **Onboarding tap-to-choose** topik (skippable). Lalu **active learning** ala Scholar Inbox/Semantic Scholar: simpan = sinyal +, "sembunyikan/tidak relevan" = sinyal −. Heuristik bootstrap S2: rating ~5 relevan + 3 tidak relevan.
- **Recommender konten-based** (embedding paper/berita + regresi atas rating user). Konten-based lebih jujur (tak bias sinyal sosial). Folder/koleksi = model interest (folder bisa jadi thread riset → menyatu dengan jembatan §7).
- **"Peta sains"** untuk cold-start: beri overview lintas domain agar user baru bisa menjelajah sebelum sinyal terkumpul.

### Ranking = relevansi + serendipity terukur
- **Jangan murni prediksi perilaku** (itu bikin filter bubble & feed menyempit). Optimalkan **serendipity = interestingness × diversity × unexpectedness**. SRS (2025): +84,66% serendipity, ~30% item "tak terduga" dengan kehilangan relevansi marginal. Randomisasi naif tidak cukup — kejutan harus tetap relevan.
- **Komposisi slot per layar (saran awal):** ~60% on-interest, ~25% diverse/tetangga-topik, ~15% "idea spark"/lintas-disiplin. Sisakan slot tetap untuk lajur B (klaim) & C (pemicu).
- **Default chronological-ish + "Untuk kamu" sebagai opsi**, dengan transparansi "kenapa ini muncul" di tiap kartu (bangun kepercayaan + bisa di-mute).
- **Hindari sinyal pre-konscious** (dwell milidetik ala TikTok). Pakai sinyal eksplisit (simpan, "Teliti ini", buka bukti) sebagai umpan balik utama.

---

## 7. Jembatan inspirasi → riset (fitur pembeda inti)

### Pola UX: item = "seed"
Adopsi model **seed-paper ResearchRabbit**: perlakukan item feed (paper/klaim/berita) sebagai *seed* yang, saat diklik "Teliti ini", **otomatis mengisi thread/workspace** dengan: pertanyaan awal, sumber terkait (earlier/later work via OpenAlex/citation graph), dan abstrak — menurunkan cold-start dari inspirasi ke thread konkret. Ini langsung memetakan ke pembuatan thread + agent deep-research Aqsha.

### Generator pertanyaan riset (v2) — bertambat bukti
- **RAG, bukan free-form.** Tambatkan generasi ke sumber yang ditarik (kurangi halusinasi, bisa diverifikasi). Tampilkan **rationale "kenapa pertanyaan ini layak"**.
- **Output terstruktur** (ala Fynman/SciSpace), bukan sekadar string: *pertanyaan + metodologi yang disarankan + tantangan + sumber pendukung.*
- **Skor Novelty/Feasibility/Excitement/Effectiveness** (Deep Ideation / rubrik Stanford). Penting: LLM menghasilkan ide **lebih novel** tapi **lebih lemah feasibility**, **kurang beragam**, dan **buruk menilai dirinya sendiri** → sajikan sebagai *titik awal*, wajib **pilih/refine sebelum mulai** (HITL), **dedupe** untuk lawan keseragaman, jangan biarkan LLM me-ranking idenya sendiri.
- **Kontradiksi = benih celah riset.** Klaim ber-verdict `contradicted`/`partially_supported`/`needs_context` adalah sinyal gap alami → tombol "Jadikan pertanyaan riset" di drawer bukti. (Taksonomi gap: evidence, theoretical, methodological, population/geographical, practical.)

### Reuse HITL
Pakai `askUser`/`needsApproval` yang sudah ada untuk langkah "pilih/sunting pertanyaan sebelum jalan".

---

## 8. Desain visual (mixed-media) — arahan pemilik

Feed harus *terlihat* berbeda dari Explore. Prinsip:

- **Sistem kartu multi-varian** (bukan satu template): kartu berita ber-thumbnail, kartu paper dengan **figure pembuka**, kartu **klaim + meter fakta/hoax**, kartu **topik naik daun** (dengan sparkline tren), kartu **pemicu ide**. Layout **bento/masonry** untuk ritme.
- **Visual lahir dari data, bukan tempelan:**
  - **Meter bukti** untuk badge (proporsi supported vs contradicted dari `citationChecks`) — gauge/bar glanceable.
  - **Grafik tren** lonjakan perhatian/sitasi (OpenAlex `counts_by_year` / GDELT `timelinevol` / Altmetric).
  - **Mini-graph paper terkait** ala Connected Papers (sumbu X=waktu, Y=sitasi seperti ResearchRabbit).
  - **Figure/thumbnail paper** otomatis (banyak paper OA punya figure kuat).
- **Hierarki:** 1–2 kartu "hero" besar di atas (paling hangat/viral) → grid lebih padat di bawah.
- **Encode relevansi secara visual** (ala Scholar Inbox: warna latar header = prediksi relevansi) sebagai jawaban "kenapa ini muncul".
- **Trade-off (catat):** visual ramai + variable-reward = risiko doomscroll & beban render/biaya generate. Jadi pasangkan dengan §9. Hindari kartu-dalam-kartu-dalam-kartu.

---

## 9. Etika & rambu-rambu

### Anti-mislabel (lajur fakta/hoax)
- **Jangan auto-cap "hoax".** Hanya tampilkan verdict keras bila bersumber fact-checker manusia (ClaimReview) atau setelah HITL. Default ke "perlu konteks/belum terverifikasi" saat ragu.
- **Selalu** sertakan bukti + sumber + penjelasan + tanggal + provenance klaim. Pertimbangkan **implied truth effect** (item tak berlabel jadi terkesan benar) & **spillover** (warning umum bisa turunkan kepercayaan ke berita BENAR) → labeli secara konsisten & jelaskan jangkauan.
- **Severity berjenjang**: label ringan ("perlu konteks") = info tambahan; hanya verdict berat yang menonjol. Jelaskan *bahaya/dampak*, bukan sekadar nilai benar/salah.
- **Klarifikasi narasi, bukan hanya klaim tunggal** (labeling per-klaim = whack-a-mole). Untuk topik berulang (vaksin, iklim), beri konteks naratif/explainer.
- **AI fact-check butuh gate**: RAG bersumber + ambang keyakinan + oversight manusia; halusinasi di tahap mana pun mengontaminasi seluruh verdict.

### Anti-doomscroll (seluruh feed)
- **Optimalkan konversi inspirasi→riset, bukan dwell-time.** Infinite scroll = +50% waktu di app + dampak atensi/kecemasan/tidur; pull-to-refresh = "lotere dopamin".
- **Desain berbatas**: penanda "Kamu sudah update", tombol "Tampilkan lebih", sesi/penanda waktu, rekap mingguan alih-alih aliran tanpa ujung.
- **Steer kejutan ke aksi** ("Teliti ini"), bukan scroll pasif.

---

## 10. Arsitektur teknis usulan (selaras stack Convex)

### Tabel baru (Convex)
- `feedItems` — { kind: "paper"|"news"|"claim"|"topic"|"idea", title, summary, url, imageUrl, source, publishedAt, topics[], trendScore, provider, dedupeKey, lastSeenAt }
- `feedItemClaims` — klaim + verdict (reuse semantik `citationChecks`: `supported/partially_supported/contradicted/needs_context/unverified`), evidence, sourceIds[], verdictSource (mis. "mafindo"/"google_factcheck"/"aqsha_ai"), verdictBy (human/ai), confidence, claimReviewJson.
- `feedSources` — daftar sumber aktif & cadensi (openalex, exa_news, gdelt, google_factcheck, turnbackhoax_rss, biorxiv_rss…).
- `userFeedInterests` — topik & embedding minat; sinyal +/−.
- `savedFeedItems` / koleksi — bookmark (sekaligus sinyal interest).
- `feedInteractions` — eksplisit saja (save/hide/research/open-evidence) untuk ranking.

### Pipeline
- **Convex cron** (belum ada — perlu dibuat): refresh berkala per sumber → tulis ke `feedItems` (dedupe via `dedupeKey`), cache lewat `externalLookupCache`.
- **Lajur B**: cron tarik ClaimReview (`languageCode=id`, `maxAgeDays`) + ingest TurnBackHoax → `feedItemClaims`. Untuk klaim tanpa verdict: jalankan pencocokan ke paper (reuse `searchWeb`/`lookupDoi`) → state "perlu konteks", **bukan** verdict keras.
- **Ranking** dihitung server-side (relevansi user × diversity × unexpectedness) → query feed reaktif (TanStack Query, sesuai `lib/convex-query.ts`).
- **"Teliti ini"**: buat thread/workspace ter-seed → panggil agent deep-research yang ada; "Jadikan pertanyaan" → generator RAG (v2) + HITL.

### Frontend
- Route `apps/web/app/app/feed/page.tsx` + `features/feed/` (mirip pola Explore), `PrimaryNavLink` baru di `app-sidebar.tsx`. Reuse Card/Badge/Tabs/Skeleton + ikon. Komponen kartu varian + grid bento. Error pakai `readableConvexErrorMessage`; error backend baru pakai `appError.ts`.

---

## 11. Risiko & pertanyaan terbuka

- **Ingestion Mafindo/TurnBackHoax**: tak ada API publik. Perlu putuskan: minta key **Yudistira** (resmi) vs scrape RSS/halaman (rapuh, etika). Rekomendasi: tempuh Google Fact Check API dulu (legal, terstruktur), paralel ajukan key Yudistira.
- **Biaya Exa** untuk news real-time (Monitors $15/1k) — batasi cadensi & andalkan GDELT gratis untuk tren ID.
- **GARUDA/SINTA tanpa API** — grounding lokal mahal; tunda ke v3 atau jalin partnership.
- **Akurasi verdict AI** — tahan diri; jangan jadikan klaim AI sebagai verdict keras tanpa HITL.
- **Legal/reputasi** melabeli "hoax" — patuhi prinsip IFCN, corrections policy, atribusi sumber.
- **Open Q:** Apakah lajur B fokus klaim *sains* saja, atau ikut scam/program pemerintah (yang faktanya mendominasi ID)? · Apakah generator ide masuk MVP atau v2? · Target metrik sukses (mis. % item yang dikonversi jadi thread)?

---

## Sumber kunci

**Prior-art discovery feeds**
- Scholar Inbox (ACL 2025) — https://arxiv.org/abs/2504.08385
- Semantic Scholar Research Feeds FAQ — https://www.semanticscholar.org/faq/research-feed-recommendations
- ResearchRabbit getting started — https://learn.researchrabbit.ai/en/articles/12439939-how-to-get-started-with-researchrabbit
- Aaron Tay — Connected Papers/Inciteful/Litmaps — https://aarontay.medium.com/3-new-tools-to-try-for-literature-mapping-connected-papers-inciteful-and-litmaps-a399f27622a
- Elicit — https://elicit.com/

**Verdict & fact-check responsibly**
- scite badge — https://scite.ai/badge ; scite paper (QSS/MIT Press, akurasi classifier) — https://direct.mit.edu/qss/article/2/3/882/102990
- Science Feedback process (skala 5-tier) — https://science.feedback.org/process/
- ClaimReview — https://schema.org/ClaimReview ; Google Fact Check structured data — https://developers.google.com/search/docs/appearance/structured-data/factcheck
- Google Fact Check Tools API — https://developers.google.com/fact-check/tools/api
- Partnership on AI, "Labeling Misinformation Isn't Enough" — https://partnershiponai.org/labeling-misinformation-isnt-enough/
- "Hallucination to Truth" (AI fact-check review, 2025) — https://arxiv.org/html/2508.03860
- Warning labels + explanations (JMCQ 2026) — https://journals.sagepub.com/doi/10.1177/10776990251347657

**Indonesia**
- TurnBackHoax — https://turnbackhoax.id/ ; GFD — https://gfd.turnbackhoax.id/
- CekFakta Playbook — https://cekfakta.com/playbook/en/1
- GARUDA — https://garuda.kemdiktisaintek.go.id/
- Komdigi hoaks (kesehatan terbanyak) — https://www.komdigi.go.id/ ; Satu Data — https://data.komdigi.go.id/

**Data sources & API**
- OpenAlex rate limits — https://github.com/ourresearch/openalex-docs/blob/main/how-to-use-the-api/rate-limits-and-authentication.md
- Exa pricing — https://exa.ai/pricing
- GDELT DOC 2.0 — https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- bioRxiv/arXiv/EurekAlert/Nature RSS — https://www.biorxiv.org/alertsrss

**Feed ethics & serendipity**
- Filter bubble / serendipity (course rec) — https://arxiv.org/pdf/1907.01591
- Serendipity-incorporated recommender (MDPI 2025) — https://www.mdpi.com/2079-9292/14/4/821
- TikTok affect & doomscroll (2025) — https://journals.sagepub.com/doi/10.1177/14614448251385086
- Infinite scroll / humane design — https://blog.logrocket.com/ux-design/humane-design-ux/

**Inspiration → research bridge**
- Hypothesis generation survey (2025) — https://arxiv.org/html/2504.05496v1
- Can LLMs Generate Novel Research Ideas? (Stanford) — https://arxiv.org/pdf/2409.04109
- Deep Ideation (2025) — https://arxiv.org/html/2511.02238v1
- SciSpace research-gap — https://scispace.com/help/en/articles/10854966 ; Fynman — https://fynman.com/features/research-gap-analysis/
