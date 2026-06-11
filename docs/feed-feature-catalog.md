# Katalog Fitur Feed — berbasis riset, konteks penelitian

> Sintesis dari riset terfokus (3 sudut: prior-art feed riset · kebutuhan/pain peneliti · fitur trust & engagement sehat). Melengkapi `docs/feed-feature-research.md` & `docs/feed-feature-prd.md`.
> Tanggal: 2026-06-06. Audiens: mahasiswa & peneliti awal, Indonesia-first, paper global.

## Temuan inti (yang mengubah prioritas)

1. **Bottleneck peneliti = menyaring & memvalidasi, bukan akses.** Di semua jenjang, kebutuhan terbesar adalah *konteks* "kenapa ini, kenapa sekarang, kenapa untukku" — bukan lebih banyak paper. (JASIST 2015 — asistdl.onlinelibrary.wiley.com/doi/10.1002/asi.23623; PaperWeaver CHI'24 — arxiv.org/abs/2403.02939)
2. **Peneliti junior butuh "peran mentor".** Mereka belum bisa menyaring sendiri & mengharapkan rekomendasi must-read + scaffolding memilih topik/gap. (JASIST 2015)
3. **Blueprint paling tervalidasi = Scholar Inbox**: digest ter-ranking + thumbs/"not relevant" + warna-relevansi + preview figure + cold-start active-learning (23k user, studi 1.233 partisipan). (arxiv.org/html/2504.08385v1)
4. **Label peringatan/cek-fakta berbukti efektif** (meta-analisis 21 eksperimen, N=14.133: −27,6% kepercayaan, −24,7% berbagi) — **asalkan disertai penjelasan**, berjenjang, dan menampilkan bukti. (nature.com/articles/s41562-024-01973-x; science.feedback.org/process)
5. **Gap unmet yang bisa Aqsha menangkan**: konteks "relevan untukmu" (LLM), **gap-finder + feasibility (FINER)**, **flag retraksi/disputed**, **lajur serendipity**, dan **lapisan Bahasa Indonesia** — semuanya kurang dilayani inkumben.

---

## Katalog fitur per tahap perjalanan riset

Penanda tier: ★ pembeda kuat · ◆ table-stakes/bernilai tinggi · ○ nice-to-have

### Tahap 1 — TEMUKAN (tetap update tanpa kebanjiran)
- ◆ **Digest ter-ranking, cadensi bisa dipilih** (harian/mingguan). [Scholar Inbox]
- ◆ **Pelacakan minat semantik (embedding), bukan keyword** — tangkap konsep yang diparafrase. [paper-radar.com]
- ◆ **Konsolidasi + dedupe** — satu feed, bukan banyak email alert tumpang-tindih. [emptysqua.re taming-gscholar-alerts]
- ◆ **Jendela & tanda kebaruan** (mis. 3 bulan terakhir; "lebih gelap = lebih baru"). [SemScholar; Connected Papers]
- ★ **Lajur serendipity / "bidang bersebelahan"** — item beragam, novel-tapi-relevan, sebagai *toggle* (bukan paksaan). Lawan filter bubble. [Bridger arxiv 2108.05669; PeerJ CS 2020]
- ○ Trending/topik naik daun · ○ Preprint baru (arXiv/bioRxiv).

### Tahap 2 — NILAI & PERCAYA (triase cepat + kepercayaan)
- ★ **"Kenapa relevan untukmu" (konteks LLM, sadar-koleksi)** — jelaskan kaitan ke karya/koleksimu, bukan sekadar abstrak. **Pembeda teratas**, cocok karena Aqsha sudah punya agent. [PaperWeaver CHI'24]
- ◆ **Encoding warna relevansi** untuk triase sekejap. Murah, berdampak. [Scholar Inbox, skala −100..100]
- ◆ **TL;DR 1 kalimat + preview figure + sorot kalimat paling relevan** — turunkan biaya baca. [Scholar Inbox; S2 TLDR]
- ★ **Sinyal kepercayaan yang benar**: status peer-review, venue, (untuk preprint) open-data/preregistration; tampilkan jumlah sitasi **dengan kaveat** (pemula cenderung over-trust angka). [RSOS preprint credibility; PMC9548432; JASIST trust]
- ★ **Flag retraksi / disputed / supporting-contrasting** (ala scite) — inkumben gagal di sini; sitasi pasca-retraksi menyebar. [scite.ai/features; PubMed 36186715]
- ◆ **Badge bukti berjenjang + alasan 1-baris** (lajur klaim) — verdict word + warna, bukan stempel biner. [Science Feedback; meta-analisis Nature]
- ◆ **State "Perlu konteks" sebagai verdict kelas-satu** — mayoritas klaim sains/kesehatan tidak biner salah. [Science Feedback; tainted-truth ScienceDirect]
- ◆ **Evidence drawer** — ketuk badge → sumber, kutipan, alasan, paper pendukung. [NewsGuard nutrition label: 91% terbantu]
- ◆ **Consensus meter** (Ya/Tidak/Mungkin) untuk pertanyaan sains/kesehatan, paper tampil di bawahnya. [Consensus.app]
- ★ **Baris provenance verdict** ("Diperiksa Mafindo · diperbarui [tgl]") — naikkan kepercayaan; **menyambung ke `hitlProvenance.ts` yang sudah ada**. [NewsGuard/Knight]

### Tahap 3 — IDEKAN (temukan topik / celah riset) — INI tujuan utama produk
- ★ **Gap-finder** — tambang bagian "future research/limitations" dari review/meta-analisis; tandai jenis gap (geografis, temporal, populasi, metodologis, integrasi); dukung **context gap** ("terapkan studi X ke Indonesia/populasimu"). **Tak ada inkumben melakukannya di feed.** [Grad Coach; ApplyKite]
- ★ **Generator pertanyaan riset (RAG, skor novelty/feasibility)** — sudah diputuskan masuk MVP. [survey hypothesis-gen; Stanford 2409.04109]
- ★ **Scaffolding feasibility (FINER) + bantu mempersempit** (broad→narrow), peringatkan "perfect gap trap". [FINER PMC11129835]
- ★ **Debat ilmiah** — pasangan paper kontradiktif → benih riset (reuse `citationChecks`).
- ○ Seed-paper exploration (earlier/later/similar). [ResearchRabbit/Connected Papers]

### Tahap 4 — MULAI (ubah jadi riset)
- ★ **"Teliti ini"** → seed thread + deep-research (inti, sudah ada jalurnya).
- ◆ **Simpan-ke-koleksi + rekomendasi per-koleksi** (jadikan "Simpan" aksi utama). [SemScholar; calm UX]
- ○ Mulai outline/proposal dari item.

### Lintas — PERSONALISASI & KONTROL (yang peneliti terima)
- ◆ **Umpan balik eksplisit (thumbs/"tidak relevan"/"lebih seperti ini") dengan efek terlihat** — preview/diff perubahan. [SemScholar; Cornell preview-diff]
- ★ **Profil minat yang bisa disunting & transparan** (folder = minat) — naikkan akurasi 20–47%. [arxiv 2304.04250]
- ◆ **Cold-start active-learning** (minta rating paling informatif). [Scholar Inbox]
- ◆ **"Kenapa ini muncul" yang spesifik** ("Karena folder: Diabetes"), bukan "untuk kamu". [survei 515 user]
- ○ Follow topik/penulis/jurnal · ◆ mute/hide.

### Lintas — ENGAGEMENT SEHAT (anti-doomscroll)
- ◆ **Feed berbatas + "Kamu sudah update"** — pemicu berhenti. Murah. [calm UX]
- ○ **Mode digest** (alih-alih scroll live).
- ○ **Friksi hanya pada aksi berisiko** (bagikan klaim belum terverifikasi) — jangan per-item (>50% user terganggu). [CHI friction]

### Lintas — LAPISAN INDONESIA (pembeda pasar, unmet)
- ★ **Ringkasan/terjemahan Bahasa Indonesia** (judul/abstrak/"kenapa relevan") + glosarium istilah akademik — kebutuhan terdokumentasi, tak dilayani inkumben. [IKIP Siliwangi; TPLS]
- ◆ Prioritaskan full-text open-access.
- ○ (nanti) **Lapor klaim via WhatsApp** + framing empatik/literasi (pelajaran Mafindo: "fakta saja tak cukup"). [Nieman Lab; The Conversation]
- ○ (nanti) Grounding repositori lokal (Garuda/SINTA).

---

## Rambu desain (dari bukti — agar tak merugikan)
- **Berjenjang > biner**, tapi skala bersih (~4 titik) lebih baik dari 6-titik/biner. (nature s41562-024-02086-1)
- **Setiap label wajib disertai penjelasan + bukti**; label samar "hati-hati" menurunkan kepercayaan pada berita BENAR. (ScienceDirect tainted-truth)
- **Hindari implied-truth**: kalau hanya sebagian item ber-badge, yang tak ber-badge tampak lebih benar → buat "belum terverifikasi" eksplisit. 
- **Source-shield saja tak cukup** (efek ~nol); selalu sertakan alasan tingkat-klaim. (Science Advances abl3844)
- **Efek umpan balik harus terlihat**; personalisasi tersembunyi paling tak dipercaya. (Cornell)

## Rekomendasi build order
Inti loop dulu (feed → Teliti ini → bukti → simpan). Lalu menang murah: **warna relevansi**, **"kenapa relevan untukmu" (LLM)**, **"kenapa ini muncul"**, **feed berbatas**, **umpan balik terlihat**. Lalu pembeda inti tujuan: **gap-finder + FINER**, **flag retraksi/disputed**, **provenance verdict** (+`hitlProvenance.ts`). Lalu **lapisan Bahasa Indonesia** & **consensus meter**. Berat/nanti: lapor-klaim WhatsApp, grounding lokal, peta sitasi visual.

## Sumber utama
Scholar Inbox arxiv.org/html/2504.08385v1 · PaperWeaver arxiv.org/abs/2403.02939 · JASIST 2015 (asi.23623) · Bridger arxiv 2108.05669 · Science Feedback science.feedback.org/process · Nature warning-label meta-analysis s41562-024-01973-x · Consensus help.consensus.app · scite scite.ai/features · NewsGuard newsguardtech.com · FINER PMC11129835 · retraction PubMed 36186715 · Indonesia comprehension (IKIP Siliwangi project 21610; TPLS 6544) · Mafindo niemanlab.org 2023.
