# Plan: Evidence Viz di Laporan `/deep` (fitur ala Consensus, tanpa sandbox)

> Status: Fase A–D SUDAH DIIMPLEMENTASIKAN (2026-07-07) — migration 0027 di DEV;
> kontrak/builders/injector di `@aqsha/chat-core/deep-viz`; step `analyze-sources` +
> injeksi di agent; 6 komponen FE + restyle ala referensi Consensus (tema token web).
> Fase E berjalan: smoke run thread 116b9eb6 (run 09303c8a) menghasilkan 5 blok valid;
> temuan audit data (consensus-meter tak pernah lolos ambang karena cap 60 unit global +
> 79% not_applicable; gaps-matrix didominasi fallback topics provider level field →
> semua massa di kolom "Lainnya") = kandidat perbaikan menyusul.
> Tanggal: 2026-07-07. Referensi visual: 6 screenshot Consensus.app (consensus meter,
> results timeline, top contributors, claims & evidence table, research gaps matrix,
> open research questions).

## 1. Tujuan

Laporan akhir `/deep` menampilkan enam blok visual berbasis bukti yang **diselang-seling
dengan prosa** (bukan enam visual berurutan), mengikuti struktur artikel ilmiah:
visual muncul di bagian yang argumennya sedang dibangun, seperti *figure* di paper.

| # | Blok (`type`) | Padanan Consensus | Sumber data |
|---|---|---|---|
| 1 | `consensus-meter` | Yes/Possibly/Mixed/No meter per pertanyaan | Klasifikasi stance per paper (LLM) + agregasi deterministik |
| 2 | `results-timeline` | Timeline publikasi (tahun × sitasi) | Metadata OpenAlex/Crossref (deterministik penuh) |
| 3 | `top-contributors` | Tabel top authors & journals | Metadata `authors`/`venue` (deterministik penuh) |
| 4 | `claims-evidence` | Claims & Evidence table + strength meter | Klaim (LLM) + skor kekuatan deterministik |
| 5 | `gaps-matrix` | Research gaps heatmap | Tagging outcome (LLM) × design, pivot deterministik |
| 6 | `open-questions` | Open research questions + "Why" | LLM (dipandu counter-evidence + gaps) |

## 2. Prinsip desain

1. **Angka tidak pernah ditulis LLM.** Semua agregat (persentase, N, skor kekuatan,
   sel matrix) dihitung kode TS deterministik — selaras keputusan verify `/deep`
   deterministik (IMP-5). LLM hanya melakukan dua hal: (a) klasifikasi per paper
   (stance/design/outcomes) via `structuredOutput` strict, (b) memilih **posisi**
   blok dalam prosa via marker.
2. **Laporan markdown self-contained.** Data blok di-embed sebagai fenced block
   ` ```aqsha:viz ` di markdown yang dipersist (`deep-report:<runId>`), jalur yang
   sama dengan pill sitasi `[n]` → riwayat, refresh, re-attach durable, dan
   time-travel aman TANPA jalur persist baru.
3. **Degradasi mulus di setiap lapisan.** Step analisis gagal → laporan tampil
   seperti hari ini (tanpa blok). Blok tak memenuhi ambang data → tidak ditawarkan
   ke writer. JSON korup di FE → fallback kotak ringkas, bukan crash.
4. **Anti-pemalsuan.** Post-processor MEMBUANG semua fence `aqsha:viz` yang ditulis
   model sendiri sebelum injeksi — snippet paper yang mengandung prompt-injection
   tidak bisa menyuntik visual palsu.

## 3. Arus data (pipeline baru)

```
search-literature ── counter-evidence ── assign-citations ──► analyze-sources (BARU)
                                                                │  LLM structuredOutput strict:
                                                                │  stance/design/outcomes per [n]×subQ,
                                                                │  claims, openQuestions
                                                                ▼
                                              verify-citations (tak berubah)
                                                                ▼
                buildDeepVizBlocks() ──────────► synthesize (prompt + daftar blok tersedia;
                (deterministik, chat-core)       writer menaruh marker {{viz:<id>}})
                                                                │  post-process: strip fence liar,
                                                                │  replace marker → fenced JSON,
                                                                │  append blok wajib yang tak ditaruh
                                                                ▼
                                              persist-report (+ deepProcess.viz)
                                                                ▼
                        FE: rehype plugin `aqsha:viz` → komponen <DeepVizBlock/>
```

## 4. Kontrak data — `@aqsha/chat-core` (dipakai agent + web)

Modul baru `packages/chat-core/src/deep-viz/` (pure TS, tanpa dependency db/services;
chat-core sudah jadi dependency `apps/agent` DAN `apps/web`, dan punya test runner):

- `contract.ts` — zod schema + type per blok, di-discriminated-union oleh `type`,
  semua payload ber-`v: 1` (versioning; FE menolak `v` yang tak dikenal dengan fallback).
- `builders.ts` — `buildDeepVizBlocks(input): DeepVizBlock[]` deterministik (§6).
- `inject.ts` — post-processor marker (§7.3).
- `index.ts` — re-export; tambahkan subpath bila chat-core memakai exports map.

Bentuk payload (ringkas; detail final di `contract.ts`):

```ts
type DeepVizBlock =
  | { v: 1; type: "consensus-meter"; id: string; subQuestionIndex: number;
      question: string; n: number;                       // N = paper unik terklasifikasi
      stances: { yes: number; possibly: number; mixed: number; no: number };
      designByStance: Record<Stance, Partial<Record<StudyDesign, number>>> } // badge ikon per baris
  | { v: 1; type: "results-timeline"; id: "timeline";
      points: Array<{ n: number; year: number; citedByCount: number | null }> }
  | { v: 1; type: "top-contributors"; id: "contributors";
      authors: Array<{ name: string; papers: number[] }>;   // papers = nomor sitasi [n]
      venues: Array<{ name: string; papers: number[] }> }
  | { v: 1; type: "claims-evidence"; id: "claims";
      claims: Array<{ text: string; reasoning: string; papers: number[];
        score: number;                                    // 0..10, deterministik (§6.4)
        label: "strong" | "moderate" | "limited" }> }
  | { v: 1; type: "gaps-matrix"; id: "gaps";
      rows: string[];                                     // outcomes (≤5)
      cols: ["meta_sysrev", "rct", "observational", "other"];
      cells: number[][] }                                  // count paper unik
  | { v: 1; type: "open-questions"; id: "open-questions";
      items: Array<{ question: string; why: string }> };
```

Catatan: `papers: number[]` memakai nomor sitasi `[n]` global run — FE me-resolve ke
kartu sumber lewat `CitationProvider` yang SUDAH membungkus laporan (reuse penuh,
tanpa duplikasi data kartu di payload).

## 5. Lapisan DB & services

### 5.1 Migration `0027` — kolom baru `research_sources`

```sql
ALTER TABLE research_sources
  ADD COLUMN cited_by_count integer,        -- OpenAlex cited_by_count / Crossref is-referenced-by-count
  ADD COLUMN topics_json    text,           -- topik provider (fallback outcomes; JSON array string)
  ADD COLUMN stance         text,           -- hasil klasifikasi (nullable; CHECK di bawah)
  ADD COLUMN study_design   text,           -- idem
  ADD COLUMN outcomes_json  text;           -- idem (JSON array string, ≤3)
-- CHECK: stance in ('yes','possibly','mixed','no','not_applicable')
-- CHECK: study_design in ('meta_analysis','systematic_review','rct','observational','review','other')
```

Semua nullable — jalur chat biasa & run lama tak tersentuh. Ikuti pola migration-collision
(file fresh `0027_*`, jangan edit migration lama). Setelah `db:migrate`: **full-restart
dev** (gotcha proses basi reusePort).

### 5.2 `packages/db` — `ResearchSourceRepo`

- `setClassification(db, updates: Array<{ id; stance; studyDesign; outcomesJson }>)` —
  batch update by id, pola sama `setImages`/`setCitationNumbers`.
- Tipe `ResearchSource` ikut kolom baru otomatis (inferSelect).

### 5.3 `packages/services/src/research`

- `openalex.ts` — `metadataJson` SUDAH memuat `citedByCount` + `topics`; tak berubah.
- `crossref.ts` — tambahkan `citedByCount: work["is-referenced-by-count"]` ke `metadataJson`.
- `index.ts`:
  - `candidateCitationMeta` → tambah `citedByCount: number | null` dan `topics: string[]`
    (best-effort parse, pola sama authors/year/venue).
  - `persistSources` → map ke kolom `cited_by_count`, `topics_json`.
  - `ResearchSourceItem` + `toResearchSourceItem` → expose `citedByCount`, `topics`,
    `stance`, `studyDesign`, `outcomes` (parse JSON defensif, pola `parseAuthorsJson`).
  - `setSourceClassification(db, updates)` — wrapper repo untuk step analyze.
- **Build dist**: perubahan services/db dikonsumsi agent dari `dist/` → `bun run build:dist`
  sebelum smoke (gotcha FE type via Eden juga butuh ini bila route API berubah — di plan
  ini route API TIDAK berubah).

## 6. Builders deterministik (`chat-core/deep-viz/builders.ts`)

Input: daftar item terklasifikasi
`{ n, subQuestionIndex, title, authors, year, venue, citedByCount, evidenceStrength, stance, studyDesign, outcomes }`
(unik per pasangan `n × subQuestionIndex`), plus `subQuestions`, `claims`, `openQuestions`,
`subQuestionAnswerable` dari step analyze.

### 6.1 `consensus-meter` (per sub-pertanyaan)
- Hanya untuk subQ dengan `answerable: true` (pertanyaan berbentuk dapat dijawab
  ya/tidak — dinilai LLM di analyze).
- Populasi: paper unik `n` milik subQ itu, exclude `not_applicable`.
- **Ambang: N ≥ 5**, dan minimal 2 stance berbeda (meter 100% satu warna tak informatif
  → tetap tampil, tapi N < 5 di-drop).
- `designByStance` = hitungan design per stance → badge ikon kecil ala gambar 1.

### 6.2 `results-timeline`
- Titik: paper unik `n` dengan `year` non-null. **Ambang: ≥ 4 titik dan ≥ 2 tahun berbeda.**
- `citedByCount` null dibiarkan null (FE render ukuran default).

### 6.3 `top-contributors`
- Author dinormalisasi exact `display_name`; masuk daftar bila muncul di **≥ 2 paper unik**;
  top 3 by count, tiebreak total `citedByCount`. Venue idem. Kosong dua-duanya → blok drop.

### 6.4 `claims-evidence`
- Teks klaim + reasoning + `papers[n]` dari LLM; **skor deterministik**:
  `score = Σ paper pendukung (bobot design × multiplier evidenceStrength)`,
  design: meta_analysis/systematic_review 3.0, rct 2.5, observational 1.5, review/other 1.0;
  evidenceStrength: strong ×1.0, medium ×0.75, weak ×0.5. Clamp 0..10 (meter 10 segmen).
- Label: `score ≥ 6` strong, `≥ 3` moderate, sisanya limited.
- Klaim yang mengutip `n` di luar inventaris → `n` itu dibuang; klaim tanpa paper valid → drop.

### 6.5 `gaps-matrix`
- Baris: outcomes ternormalisasi (lowercase-trim; gabungkan via kesamaan exact) top ≤ 5
  by jumlah paper; fallback `topics` provider bila LLM outcomes kosong.
- Kolom tetap 4 bucket design. Sel = count paper unik. **Ambang: ≥ 2 baris dan ≥ 8 paper.**

### 6.6 `open-questions`
- Pass-through 2–4 item LLM. Selalu layak bila non-kosong.

Semua builder mengembalikan `null` bila ambang tak terpenuhi → blok tak pernah
ditawarkan ke writer. **Unit test lengkap di chat-core** (runner sudah ada): kasus
ambang, dedupe, skor, klaim dengan `n` liar, input kosong.

## 7. Workflow agent (`apps/agent/src/mastra/workflows/deep-research.ts`)

### 7.1 Step baru `analyze-sources` (antara `assign-citations` dan `verify-citations`)

- Skema: `CitedSchema` → `AnalyzedSchema = CitedSchema + { sourceInsights, vizBlocks }`;
  `verify-citations` dan `synthesize` meneruskan field baru (extend skema mereka).
- Eksekusi (`retries: 1`, best-effort total):
  1. `ResearchService.listTurnSources(db, { threadId, turnId: runId })` → baris ber-nomor.
  2. Susun unit klasifikasi = pasangan unik `n × subQuestionIndex` (cap **60**; lebih →
     prioritaskan evidenceStrength strong, log jumlah yang di-drop). Chunk ~20 unit
     per panggilan LLM.
  3. Panggilan LLM: pola persis `draft-plan` — agent generate `toolChoice:"none"` +
     `structuredOutput: structuredOutputOpts(AnalyzeOutputSchema)`. Prompt berisi:
     pertanyaan utama, daftar subQ, inventaris bernomor (judul+snippet+tahun+venue),
     dan teks counter-evidence (bahan claims jujur + open questions).
     ```ts
     const AnalyzeOutputSchema = z.object({
       insights: z.array(z.object({
         n: z.number().int().min(1),
         subQuestionIndex: z.number().int().min(0),
         stance: z.enum(["yes","possibly","mixed","no","not_applicable"]),
         studyDesign: z.enum(["meta_analysis","systematic_review","rct","observational","review","other"]),
         outcomes: z.array(z.string()).max(3),
       })),
       subQuestionAnswerable: z.array(z.object({
         subQuestionIndex: z.number().int(), answerable: z.boolean() })),
       claims: z.array(z.object({
         text: z.string(), reasoning: z.string(),
         papers: z.array(z.number().int()) })).min(3).max(6),
       openQuestions: z.array(z.object({
         question: z.string(), why: z.string() })).min(2).max(4),
     });
     ```
     Instruksi stance: "posisi TEMUAN paper terhadap sub-pertanyaan, berdasar
     judul+abstrak/snippet; ragu → `mixed`; tak menjawab → `not_applicable`".
  4. Persist klasifikasi ke `research_sources` (best-effort, `setSourceClassification`) —
     kegagalan DB tak menggagalkan step.
  5. `buildDeepVizBlocks(...)` → `vizBlocks` masuk state workflow.
  6. `emitDetail(writer, { kind: "analyze", ... })` di awal ("Mengklasifikasikan N sumber…")
     dan akhir (ringkasan: berapa blok layak) — paritas pola IMP-9; perlu menambah varian
     `kind` di union detail FE (`timeline-types.ts`) + baris panel proses.
- **Durabilitas**: panggilan generate langsung (bukan `runDeepSubagentTask`) mengikuti
  preseden draft-plan; restart run mengulang step ini (biaya kecil, output deterministik-ish).
  JANGAN membungkus ke deep-tasks di v1 (`structuredOutput` belum lewat jalur task; catat
  sebagai perbaikan menyusul bila terbukti mahal saat restart).
- **Kegagalan total** (kedua attempt): `sourceInsights = null`, `vizBlocks = []` →
  laporan polos. JANGAN throw pasca-billing (paritas CFG-4).

### 7.2 Kontrak writer di `synthesisPrompt`

Tambahkan seksi (hanya bila `vizBlocks.length > 0`):

```
## Blok visual tersedia (WAJIB ditempatkan)
Berikut blok visual yang SUDAH dihitung dari data. Sisipkan penandanya di laporan,
masing-masing pada BARIS TERSENDIRI, persis: {{viz:<id>}}
- {{viz:consensus-q2}} — meter konsensus untuk sub-pertanyaan 3 (N=19)
- {{viz:timeline}} — timeline publikasi 2017–2026 (23 paper)
- …
Aturan penempatan (gaya artikel ilmiah):
- Meter konsensus: TEPAT setelah paragraf yang menyimpulkan sub-pertanyaan terkait.
- Timeline & kontributor: di bagian karakteristik/peta literatur (biasanya awal
  pembahasan), timeline dulu, dipisah minimal satu paragraf.
- Tabel klaim & bukti: di bagian sintesis bukti, sebelum kesimpulan.
- Gaps matrix lalu open questions: di bagian keterbatasan/arah riset ke depan,
  setelah kesimpulan utama.
- JANGAN dua penanda berurutan tanpa paragraf prosa di antaranya; setiap blok
  diantar kalimat yang merujuknya (mis. "Gambar berikut merangkum sebaran temuan…").
- JANGAN mengarang penanda lain, JANGAN menulis blok ```aqsha:viz sendiri,
  JANGAN mengubah data.
```

`id` blok: `consensus-q<index>`, `timeline`, `contributors`, `claims`, `gaps`,
`open-questions`.

### 7.3 Post-processor (di step `synthesize`, setelah `out.text`; `chat-core/deep-viz/inject.ts`)

Urutan operasi pada `report` (pure function `injectVizBlocks(report, vizBlocks)`):
1. **Strip** semua fenced block ```` ```aqsha:viz … ``` ```` yang ditulis model (anti-forgery §2.4).
2. Ganti tiap baris marker `/^\s*\{\{viz:([a-z0-9-]+)\}\}\s*$/` dengan fenced block JSON
   blok ber-`id` sama. Marker `id` tak dikenal → hapus barisnya. Marker duplikat →
   kemunculan pertama menang, sisanya dihapus.
3. Blok yang TIDAK ditempatkan writer: `consensus-q*` dan `claims` di-append di akhir
   laporan di bawah heading `### Lampiran visual` (blok inti tak boleh hilang);
   `timeline`/`contributors`/`gaps`/`open-questions` yang tak ditaruh → di-drop
   (nilai kontekstualnya rendah bila writer tak merujuknya). Log jumlah yang di-append/drop.
4. Validasi ringan: dua fence bersebelahan tanpa teks di antaranya → sisipkan baris
   kosong (kosmetik; aturan utamanya sudah di prompt).

Hasil injeksi dipakai sebagai `report` yang mengalir ke `persist-report` (tak ada step
baru; retry synthesize mengulang injeksi — idempoten karena pure).

### 7.4 `persist-report`

- `deepProcess.viz = vizBlocks` (fallback DB-independen + bahan panel proses, paritas
  `deepProcess.sources`). Ukuran kecil (< beberapa KB).

## 8. Frontend (`apps/web`)

### 8.1 Jalur render — pola persis pill sitasi

- File baru `features/threads/lib/viz-markdown.ts`: rehype plugin yang mencari
  `pre > code` ber-class `language-aqsha:viz`, mengganti node `pre` dengan element
  kustom `deepviz` ber-atribut `payload` (string JSON). Berjalan SETELAH sanitize —
  gabungkan di `citation-markdown.ts`: `reportRehypePlugins = [...defaultRehypePlugins,
  citationRehypePlugin, vizRehypePlugin]` (satu pipeline modul-level yang stabil;
  `Response` ganti referensi ke ini). Karena node `pre>code` diganti sebelum mapping
  komponen, plugin `code` Streamdown tak pernah menyentuhnya.
- `message.tsx`: daftarkan `deepviz: DeepVizMarkdownComponent` di `streamdownComponents`.

### 8.2 Komponen `features/threads/components/deep-viz/`

- `viz-block.tsx` — dispatcher: `safeParse` payload dengan zod contract chat-core;
  gagal parse / `v` tak dikenal / type tak dikenal → kotak fallback ringkas
  ("Visual tidak dapat dimuat") + expander teks JSON; saat teks masih streaming/terpotong
  → skeleton. Bungkus error boundary.
- `consensus-meter.tsx` — bar stacked (div flex, warna token: hijau/kuning/oranye/merah),
  legend per stance (dot + label + persen + badge design ala gambar 1), kapsul
  "X% paper mengindikasikan 'Ya/Tidak'" (stance dominan), chip `N = x`.
- `results-timeline.tsx` — SVG scatter in-house (tanpa lib chart baru): x=tahun,
  jitter vertikal deterministik (hash `n`), ukuran marker 3 kelas by kuantil
  `citedByCount`, label `n` di marker; klik marker → popover kartu sumber via
  `CitationProvider` (reuse `CitationMarkdownComponent`/`InlineCitation`).
- `top-contributors.tsx` — tabel dua seksi (Authors/Journals) ala gambar 3; kolom
  Papers = pill sitasi `[n]` reuse komponen pill (+`+n more` bila > 3).
- `claims-evidence.tsx` — tabel 4 kolom ala gambar 4; strength = meter 10 segmen
  (hijau strong / kuning moderate / abu limited) + label; Papers = pill `[n]`.
- `gaps-matrix.tsx` — tabel heatmap; intensitas sel = skala biru dari count
  (normalisasi per-matrix); baris/kolom sticky, wrapper `overflow-x-auto` (mobile).
- `open-questions.tsx` — kartu pertanyaan + kolom "Mengapa penting" ala gambar 6;
  tombol panah per kartu = prefill composer `/deep <question>` (pakai kanal draft
  composer yang ada — verifikasi mekanisme saat implementasi; kalau butuh kanal baru,
  tunda tombolnya ke follow-up, jangan bengkakkan slice ini).
- Semua caption ber-prefix `FIGURE n` kecil ala Consensus → penomoran berurutan
  per-laporan (context counter sederhana di provider pesan).
- **Sebelum menulis komponen chart: load skill `dataviz`** (palet kategorikal stance,
  aksesibilitas dark/light). Ikon dari `@aqsha/ui/icons` (JANGAN lucide langsung).
  Copy sentence case (aturan copywriting no-uppercase).

### 8.3 Panel proses `/deep`

- `timeline-types.ts` + `deep-search-cards.tsx`/detail: tambah varian detail
  `kind: "analyze"` (baris "Analisis bukti: N sumber diklasifikasikan, M blok visual").

## 9. Ambang & kelayakan (rangkuman)

| Blok | Syarat tampil |
|---|---|
| consensus-meter | subQ answerable, N ≥ 5, ≥ 2 stance berbeda |
| results-timeline | ≥ 4 paper ber-tahun, ≥ 2 tahun berbeda |
| top-contributors | ≥ 1 author ATAU venue dengan ≥ 2 paper |
| claims-evidence | ≥ 3 klaim valid (papers non-kosong pasca-sanitasi) |
| gaps-matrix | ≥ 2 baris outcome, ≥ 8 paper unik |
| open-questions | ≥ 2 item |

Run kecil (mis. 6 sumber) secara alami hanya memunculkan 1–2 blok — laporan tidak
pernah "di-spam" visual.

## 10. Biaya, billing, batasan

- +1–3 panggilan LLM per run (klasifikasi, ~2–4k token/panggilan) — ditanggung kredit
  deep run yang sudah didebit di plan-gate; TANPA jenis billing baru. Opsional: catat
  usage ledger `deep_analyze` rate 0 (paritas `citation_verify`) — keputusan terbuka §13.
- Batasan diakui di UI: klasifikasi berbasis judul+abstrak/snippet (bukan full-text) —
  caption meter mencantumkan "berdasar abstrak" (kejujuran ilmiah). Full-text stance =
  kandidat fase sandbox.

## 11. Testing

1. **Unit (chat-core)**: builders §6 (ambang, skor, dedupe, `n` liar), `injectVizBlocks`
   §7.3 (strip fence liar, replace, duplikat, append blok inti, drop marker asing).
2. **Unit (services)**: `candidateCitationMeta` extended; persist kolom baru
   (itest DB yang ada; ingat itests billing pakai `--timeout 25000` bila tersentuh).
3. **Workflow (agent, manual/smoke)**: run `/deep` di dev — verifikasi: (a) laporan
   memuat fence `aqsha:viz` di posisi selang-seling; (b) refresh mid-run & pasca-selesai
   tetap merender blok (durable); (c) run dengan sumber minim → tanpa blok, tanpa error.
4. **FE**: typecheck + verifikasi visual dark/light + mobile (blok lebar dalam
   `overflow-x-auto`); payload korup manual → fallback.
5. **Regression**: chat biasa (non-deep) tak berubah; pill `[n]` tetap jalan
   (pipeline rehype digabung — uji keduanya dalam satu laporan).

## 12. Urutan implementasi

| Fase | Isi | Sentuhan |
|---|---|---|
| A | Migration 0027 + persist `citedByCount`/`topics` + read model + build:dist | db, services |
| B | Kontrak + builders + injector + unit tests | chat-core |
| C | Step `analyze-sources` + extend skema + prompt writer + injeksi + `deepProcess.viz` | agent |
| D | Rehype `deepviz` + 6 komponen + panel proses `kind:"analyze"` | web |
| E | Smoke E2E `/deep` (3 skenario: kaya-sumber, minim-sumber, refresh mid-run) + rapikan | semua |

A–B bisa paralel dengan D (kontrak disepakati dulu di B). C bergantung A+B.
Estimasi kasar: A ~0.5 hari, B ~1 hari, C ~1 hari, D ~1.5–2 hari, E ~0.5 hari.

## 13. Keputusan terbuka (default bila tak dijawab)

1. **Usage ledger `deep_analyze` rate 0** untuk observabilitas? *(default: ya, murah)*
2. **Model step analyze**: model writer tier run (lite/pro) atau selalu lite? *(default:
   selalu lite — tugas klasifikasi, hemat)*
3. **Tombol panah open-questions → prefill `/deep`** masuk slice ini atau follow-up?
   *(default: follow-up bila kanal composer perlu kerja baru)*
4. **`sampleSize` per paper** ikut diekstrak? *(default: tidak di v1 — akurasi dari
   snippet rendah; tambah saat full-text/sandbox)*

## 14. Di luar scope (fase sandbox, plan terpisah)

Forest plot / pooled effect size, verifikasi statistik klaim (recompute CI/p),
integrasi dataset user (.sav), export chart PNG ke .docx/PDF.
