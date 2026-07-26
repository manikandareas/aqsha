# Aqsha — Arah Produk Research-First (Branch Svelte)

**Status:** living document · **Tanggal sintesis:** 2026-07-25  
**Scope:** arah produk aktif di branch `feat/apps-svelte-migration` (`apps/svelte` + backend yang dilayaninya)  
**Positioning ringkas:** [`apps/svelte/PRODUCT.md`](../../apps/svelte/PRODUCT.md) · visual: [`apps/svelte/DESIGN.md`](../../apps/svelte/DESIGN.md)

> Dokumen ini merangkum **pivot besar** yang terjadi di branch migrasi Svelte: dari chat-first / workspace generik menuju **proyek karya tulis sebagai pusat produk**, dengan dokumen Typst tunggal, perpustakaan sitasi ala Zotero, pencarian literatur paper-first, dan Astra sebagai co-writer scoped proyek. Sumber otoritatif per keputusan tetap di `docs/superpowers/specs/`; dokumen ini adalah **peta produk satu pintu**.

---

## 1. Ringkasan eksekutif

Aqsha adalah workspace riset-dan-tulisan untuk **student researcher** (mahasiswa S1/S2 dan penulis akademik awal). Job-to-be-done: mengubah tumpukan sumber yang terpencar menjadi **draf yang siap direview**, dengan setiap klaim tetap tertelusur ke sumbernya.

Tagline positioning: **"Ideas, neatly linked."**

Pada branch ini, pusat produk **bukan** composer chat ala GPT dan **bukan** file board ala Drive. Pusatnya adalah:

1. **Proyek karya tulis** (skripsi, tesis, disertasi, artikel jurnal, proposal, makalah, atau bebas).
2. **Satu dokumen Typst kontinu** per proyek (bab = heading), dengan preview realtime di browser.
3. **Perpustakaan sitasi akun** + tautan ke proyek (model Zotero).
4. **Astra** yang selalu bekerja di dalam konteks proyek — membaca source, mengusulkan patch, tidak pernah menulis dokumen resmi tanpa review pengguna.

Deep Research (`/deep`) tetap ada sebagai mode mahal multi-langkah, bukan pintu masuk produk.

---

## 2. Sejarah pivot (mengapa produk berubah)

Branch belum pernah cutover produksi — **tidak ada data user yang perlu dimigrasi**. Itu memungkinkan beberapa ganti fondasi beruntun tanpa kompatibilitas mundur dengan `apps/web` lama.

| Gelombang | Keputusan lama | Keputusan baru | Dokumen kunci |
|---|---|---|---|
| **A. Research-first repositioning** (17 Jul) | Pintu masuk = chat global; workspace = file board generik | Pusat = karya tulis; chat scoped proyek; library Zotero-like; hapus feed berita GDELT dari Svelte | `2026-07-17-research-first-repositioning-design.md` |
| **B. Editor SuperDoc → LaTeX** (18 Jul) | DOCX WYSIWYG SuperDoc per bab | LaTeX kanonik + PDF agen-first (anotasi → SyncTeX → diff); SuperDoc = NO-GO | `…-phase4-latex-foundation-design.md` + gate report |
| **C. LaTeX → Typst dokumen-tunggal** (20 Jul) | Satu bab = satu sumber LaTeX; status/stage granular; compile server untuk preview | **Typst** satu buffer kontinu; preview WASM realtime; hapus `workspace_sections` + stage; compile server hanya untuk ekspor & dry-run proposal | `…-phase9-typst-single-document-design.md` |
| **D. Surface polish** (21–24 Jul) | Shell proyek / explore / library masih kasar | Loop Astra+anotasi+proposal; Research Shelf beranda; Advanced literature search; Project references library; Explore research canvas | Specs 21–24 Jul |

Arah sebelumnya (workspace + folder + artifact BlockNote + chat global, stack Convex) sudah diganti penuh di branch ini. Beberapa primitif teknis (artifact storage, RAG, billing, Astra runtime) tetap dipakai di bawah permukaan.

---

## 3. Audience & positioning

### 3.1 Pengguna utama

**Student researcher** — mahasiswa tingkat akhir, magister, dan penulis akademik awal yang mengerjakan skripsi/tesis/proposal/paper/literature review.

Konteks kerja mereka biasanya terpencar: sumber di satu tab, AI di tab lain, catatan di tempat ketiga, draf di tempat keempat — di bawah deadline dan kecemasan review. Produk harus membuat jalur **sumber → klaim → draf** terlihat dan mudah ditutup.

### 3.2 Audience sekunder

Mentor / dosen pembimbing lewat Shared Journal (review & edit). Mereka **bukan** design target utama; permukaan yang mereka sentuh harus legible untuk mereview kerja mahasiswa. Shared Journal di IA baru masih **out of scope** (menyusul setelah repositioning inti).

### 3.3 Personality & anti-references

| Personality | Anti-references |
|---|---|
| Calm, clear, playful | Fear-driven AI-safety ("zero hallucination", polisi sitasi) |
| Capable, not clinical | Generic AI SaaS (sparkle, purple gradient, feature-card grid) |
| Premium-simple | Strict academic/institutional (seals, compliance coldness) |

Copy: sentence case, label state ramah (`Linked`, `Source added`, `Needs source`, `Saved`), bukan peringatan menghukum. Target aksesibilitas: **WCAG 2.2 AA**; dark mode first-class.

### 3.4 Design principles (produk)

1. **Keep the thread visible** — klaim ↔ bukti selalu dekat.
2. **Clarity over fear** — arahkan aksi berikutnya, jangan scold.
3. **Calm density** — cukup informasi untuk riset, tanpa noise dashboard.
4. **Playful in the moments, quiet on the pages** — kepribadian di micro-interaction, bukan dekorasi page-level.
5. **Capable, not clinical** — mesin riset serius; kulit approachable.

---

## 4. Konsep inti (domain)

### 4.1 Proyek (`workspaces`)

Proyek = kontainer tunggal karya tulis. Tidak ada entity kontainer paralel.

| Atribut | Peran |
|---|---|
| `kind` | Jenis karya — memilih scaffold Typst saat create |
| `kindInfo` | Metadata opsional per kind (universitas, fakultas, jurnal tujuan, …) |
| `name` / `topicNote` | Judul; topik kasar boleh jadi placeholder judul |
| `deadline` | Tenggat opsional |
| `documentArtifactId` | Artifact sumber Typst dokumen tunggal (lazy) |
| `status` | `active` \| `archived` (hapus di UI = archive) |

**Jenis proyek (`kind`) dan label UI:**

| `kind` | Label UI | Scaffold heading (ringkas) |
|---|---|---|
| `undergraduate_thesis` | skripsi | Pendahuluan → … → Penutup (+ halaman judul) |
| `masters_thesis` | tesis | Pendahuluan → … → Kesimpulan dan Saran |
| `dissertation` | disertasi | Termasuk kerangka konseptual |
| `journal_article` | artikel jurnal | IMRaD |
| `proposal` | proposal | + Jadwal Penelitian |
| `paper` | makalah | Pendahuluan / Pembahasan / Penutup |
| `freeform` | bebas | Tanpa kerangka khusus |

**Dihapus dari model user-facing (pivot Typst):** `stage` (exploration → done), status per bab, tabel `workspace_sections`. Bab kini **derived** dari heading level-1 di source Typst.

### 4.2 Dokumen Typst tunggal

- Satu proyek = **satu** source Typst (`artifactType = 'typst'`).
- Bab = heading `= …`; TOC overlay mem-parse heading (bukan baris DB).
- Autosave dengan CAS (`contentVersion` / `stale_write`).
- Revisi append-only (`document_revisions`, retention terbatas).
- Sitasi in-text: `@key` / `#cite`; bibliografi proyek digenerate dari citation yang ter-link (`refs.bib` + `#bibliography`).

### 4.3 Perpustakaan sitasi (model Zotero)

- **Citation** = rekaman kanonik milik akun (`owner_user_id`), dengan metadata CSL, dedupe by canonical key, status kelengkapan.
- **`workspace_citation_links`** = tautan banyak-ke-banyak proyek ↔ citation (tanpa menyalin metadata).
- Unlink dari proyek ≠ hapus dari perpustakaan global.
- Hapus global menghapus citation + semua link proyek.
- Gaya sitasi proyek (`workspace_citation_settings`) tetap per proyek.

### 4.4 Thread chat

- Thread **wajib** scoped ke proyek (`workspace_id` NOT NULL).
- Tidak ada chat global di IA Svelte baru.
- Metadata fokus bisa membawa fokus (mis. anotasi); source of truth pesan tetap Mastra Memory.

### 4.5 Artifact (masih ada, peran berubah)

Artifact tetap primitif storage (PDF pedoman kampus, file ter-upload, dokumen Typst, URL, dsb.) dan bahan RAG. Yang berubah: **produk tidak lagi memasarkan "file board + BlockNote workspace"** sebagai loop utama — dokumen karya tulis adalah Typst; file pendukung mengorbit proyek.

### 4.6 Source / research provenance

Sumber hasil tool riset & Deep Research (`research_sources`) tetap provenance backend untuk sitasi dalam jawaban agent. Ini **bukan** Perpustakaan user-facing; Perpustakaan = citations CSL yang dikelola mahasiswa.

---

## 5. Information architecture & routing

Path bahasa Inggris; **copy UI bahasa Indonesia**.

```
/app                                    → Beranda — Research Shelf (daftar proyek)
/app/projects/new                       → Buat proyek (pilih kind → form kindInfo)
/app/projects/[projectId]               → Rumah proyek (Chat | Editor + preview Typst)
/app/projects/[projectId]/references    → Perpustakaan scoped proyek
/app/projects/[projectId]/search        → Cari sumber in-project
/app/projects/[projectId]/threads/[tid] → Thread Astra dalam proyek
/app/projects/[projectId]/artifacts/[id]→ Detail artifact pendukung
/app/library                            → Perpustakaan global akun
/app/explore                            → Jelajah / pencarian literatur paper-first
/app/explore/[paperRef]                 → Paper reader
/app/settings/*                         → Pengaturan (additive; bukan fokus pivot)
/onboarding                             → Guided Research Journey → masuk ke /app
```

**Sidebar:** Beranda · Perpustakaan · Jelajah · (proyek aktif dengan sub-row `*.typ` + Referensi) · Pengaturan. Recent-threads global dihapus.

**Route lama yang tidak lagi jadi pintu produk:** `/app/workspaces`, threads global, feed berita, halaman per-section LaTeX/PDF, StageStepper.

---

## 6. Katalog fitur (per permukaan)

### 6.1 Onboarding — Guided Research Journey

**Tujuan:** membawa pengguna dari "belum siap" ke ruang riset tanpa wizard form yang dingin.

- Narrative arc: welcome → background → interests → source → finish.
- Nada *sweet and spicy*: hangat tapi menolak budaya jawaban instan; keputusan intelektual tetap milik user.
- Data yang dikumpulkan tetap (background, ≥3 interests, heard-about); kontrak API tidak diperluas di spec ini.
- Selesai → navigasi ke **`/app`** (bukan explore).

### 6.2 Beranda `/app` — Research Shelf

**Tujuan:** rumah seluruh proyek tulis; terasa meja belajar, bukan dashboard admin.

| Elemen | Perilaku |
|---|---|
| Heading | "Ruang risetmu" + sapaan kontekstual |
| Shortcut | Jelajahi · Perpustakaan (utility links, bukan card kompetitif) |
| Shelf | Grid kartu proyek (cover warna candy per `kind`, jenis, cuplikan topik, judul, last edited) |
| Sort | Menu sorting proyek |
| Create | `NewProjectCard` / CTA "Proyek baru" → `/app/projects/new` |
| States | Skeleton anatomi-card; empty ramah; error + Coba lagi; pagination "Muat lebih banyak" |

Visual language: **Paper + Candy** (warm paper + aksen mint/lavender/coral/lemon deterministik per kind).

### 6.3 Buat proyek `/app/projects/new`

Alur halaman penuh (bukan dialog):

1. **Pemilih kind** — grid kartu dengan deskripsi singkat.
2. **Form info** (`?kind=…`) — judul, topik, tenggat, field `kindInfo` sesuai kind; prefill dari proyek se-kind terakhir (kecuali pedoman PDF).
3. **Pedoman universitas (opsional, thesis-family)** — upload PDF → artifact ter-link proyek (best-effort; gagal upload ≠ gagal create).
4. Submit → scaffold Typst (judul + heading + `#bibliography` bila relevan) → masuk rumah proyek.

`kind` tidak diganti setelah create (ganti jenis = proyek baru). `kindInfo` bisa diedit di sheet Detail proyek.

### 6.4 Rumah proyek — Chat | Editor + preview Typst

Ini **surface inti produk**.

**Layout**

- Header: identitas proyek, unduh PDF/DOCX, sheet Sumber/Detail.
- Kiri: tab **Chat** (default) | **Editor**.
- Kanan: **preview Typst** persisten (WASM worker), TOC overlay, mode anotasi.

**Editor**

- CodeMirror 6 + ekstensi Typst (highlight, autocomplete/hover, lint dari diagnostik worker).
- Autosave debounced + CAS; banner muat ulang saat `stale_write`.
- Error Typst tampil inline (tidak ada tombol Compile di UI).

**Preview & TOC**

- Compile incremental di Web Worker (~debounce 300 ms); server tidak dibutuhkan untuk preview.
- TOC overlay = rumah manajemen bab: klik navigasi, drag reorder, tambah/rename/hapus heading — semua = transformasi teks source.
- Source mapping editor↔preview: **level-heading** (presisi per-baris SyncTeX-like ditunda).

**Ekspor**

- **PDF** — `typst compile` server sandboxed → signed URL.
- **DOCX** — `pandoc -f typst --citeproc` (best-effort; styling halaman terbatas).

**Anotasi & proposal** — lihat §7.

### 6.5 Perpustakaan global `/app/library`

Perpustakaan sitasi akun (bukan file manager).

| Kapabilitas | Detail |
|---|---|
| List + detail split | Search `q`, filter status/source/tag, state di URL |
| Tambah sumber | DOI · manual · import `.bib`/`.ris` · sync Mendeley/Zotero |
| Deduplikasi | Canonical key; opsi return-existing; kelola duplikat |
| Export | BibTeX / RIS / CSL-JSON |
| Render sitasi | Preview gaya (default APA-7; juga IEEE, Vancouver, Chicago author-date) |
| Visual | Index-card grid berwarna (polish terbaru) |

### 6.6 Referensi proyek `/app/projects/[id]/references`

Library yang sama, scoped ke citation yang ter-link proyek.

- Header: `Perpustakaan / Nama Proyek`.
- Menu tambah: Dari Perpustakaan · Import · DOI · Manual · Mendeley/Zotero.
- Create/import dari scope proyek → auto-link ke proyek.
- Unlink membership tanpa menghapus rekaman kanonik.
- Query/filter/pagination setara library global; query key terpisah per scope.

### 6.7 Jelajah `/app/explore` — literature research canvas

**Paper-first**, bukan feed berita.

**Keadaan landing (query kosong)**

- Canvas dua kolom desktop: filter rail sticky kiri + kolom konten kanan.
- Hero pencarian "Cari literatur" + suggestions / topic posters.
- Feed kurasi discovery di bawah (source-row grammar yang sama dengan hasil search); **tanpa house ad**.

**Keadaan hasil**

- Search bar ringkas + sort + jumlah hasil.
- List vertikal padat: judul, abstrak cuplikan, author/tahun/venue/sitasi, badge OA/PDF/retracted, aksi Baca / Simpan.
- Batch: simpan N sumber, ekspor BibTeX/RIS/CSL-JSON dari seleksi (tanpa wajib simpan dulu).
- URL state recoverable: `q`, `sort`, `f` (filter clauses bertipe, bukan raw OpenAlex).

**Filter Builder (katalog produk)**

Kategori user-facing: Publikasi · Akses · Dampak · Penulis & afiliasi · Bidang riset · Pendanaan · Keterhubungan · Kelengkapan & integritas.  
Retracted diexclude default. Autocomplete untuk author/institution/venue/topic/funder. Apply eksplisit; draft di rail/drawer terpisah dari applied state.

**Mobile:** filter = bottom drawer (bukan popover desktop oversized).

**Bukan bagian Explore (sengaja):** semantic search UI, Boolean mentah, journal rank eksternal (SINTA/Scopus/SJR), feed berita GDELT.

### 6.8 Pencarian in-project `/app/projects/[id]/search`

Pencarian literatur sadar konteks proyek: simpan hasil → citation akun + auto-link ke proyek aktif. Melengkapi Explore global tanpa mencampur query-param konteks di `/app/explore`.

### 6.9 Paper reader `/app/explore/[paperRef]`

Membaca metadata/full-text paper dari hasil jelajah; jalur simpan ke perpustakaan/proyek. (Reader chat shell discovery tetap bagian ekosistem explore.)

### 6.10 Pengaturan `/app/settings/*`

Additive / bukan fokus fokus: overview, account, security, appearance, personalization, integrations (Mendeley/Zotero), usage & billing. Redesign Settings di luar scope repositioning.

### 6.11 Billing & plans (tetap relevan)

Entitlement membatasi kredit chat, kuota Deep Research, jumlah workspace/proyek, dan ukuran library. Plan keys: free · starter · plus · ultra · admin. Deep Research mendebit sekali saat plan disetujui. Detail perilaku agent: [`astra-agent-spec.md`](astra-agent-spec.md).

---

## 7. Astra — asisten riset scoped proyek

### 7.1 Dua kemampuan utama

| Mode | Peran di arah baru |
|---|---|
| **Chat (`astra-lite`)** | Loop harian di tab Chat proyek: tanya, outline, paraphrase, usulkan suntingan Typst |
| **Deep Research (`/deep`)** | Mode mahal: plan-gate kartu Setujui/Tolak → subagents → sintesis bersitasi |

Slash commands akademik (`/paraphrase`, `/outline`, `/literature-review`, `/deep`, …) tetap di composer.

### 7.2 Context default proyek (tanpa chip wajib)

Dari halaman proyek, setiap turn mendapat **manifest ringkas** proyek aktif (identitas, versi dokumen, ketersediaan sumber) — tanpa pill composer otomatis.

| Situasi | Izin Astra |
|---|---|
| Chat di proyek aktif | Baca Typst aktif, RAG artifact proyek, bibliografi proyek, ajukan proposal patch |
| `@mention` dokumen/proyek lain | Prioritas baca; **read-only** kecuali target = dokumen aktif |
| Evidence proyek kurang | Nyatakan kekurangan; Library global / web hanya bila diminta atau benar-benar perlu |

### 7.3 Loop anotasi → proposal → review per-hunk

Ini diferensiator UX **agen-first** (bukan WYSIWYG yang ditulis AI diam-diam):

1. User menandai teks di preview (anotasi `selectedText` + rects); hingga 8 chip context di composer.
2. Astra wajib `get_document_source`, lalu `propose_document_edit` (`oldText`→`newText` atau `fullSource`).
3. Server dry-run compile Typst; hanya candidate bersih → status `pending` (maks **satu** pending per proyek).
4. UI: CTA **Tinjau usulan**, badge Editor, banner preview — **preview tetap dokumen tersimpan**.
5. Review unified diff (merah/hijau) di tab Editor; checkbox per hunk; Terima subset → compile ulang sebelum save CAS.
6. Manual save saat pending → proposal **Basi**; user bisa Tolak atau **Minta Astra susun ulang**.
7. Clear anotasi: countdown 3 detik + Batal; dismiss batch tanpa menghapus chip/history.

Astra **tidak pernah** direct-write source resmi.

### 7.4 Tools / skills (lapisan teknis, ringkas)

- Tools dokumen: `get_document_source`, `propose_document_edit` (+ retry & union error compile/anchor).
- Skills domain di-inline di runtime Mastra (lepas dari cwd).
- Streaming durable-thread; refresh dapat resume; Stop bersih.
- Observability opsional via Langfuse.

---

## 8. Arsitektur teknis yang menopang arah produk

Ringkas — detail di `docs/architecture/`.

| Lapisan | Peran untuk product direction |
|---|---|
| `apps/svelte` | Product UI cutover (SvelteKit + TanStack Query + Eden Treaty) |
| `apps/api` | REST Elysia tipis → services |
| `apps/agent` | Mastra: `astra-lite` + workflow `deep-research` |
| `packages/services` | Domain: workspaces, typst, citations, literature-search, billing, RAG |
| `packages/db` | Postgres + pgvector; migrasi drop-and-replace di branch unshipped |
| `packages/chat-core` | Primitif composer/timeline bersama |
| `@aqsha/ui-svelte` | Primitif UI + token warm-paper |

**Compile Typst hybrid**

- Preview: `@myriaddreamin/typst.ts` WASM di browser (Web Worker).
- Resmi: CLI `typst` via `runSandboxed` (ekspor + dry-run proposal).
- Keamanan: sandbox OS-level wajib sebelum expose compiler ke user di produksi (read-only rootfs, no-network).

**Yang sengaja ditinggalkan di jalur Svelte**

- SuperDoc / DOCX sebagai kanonik.
- LaTeX + Tectonic + SyncTeX + biblatex pipeline.
- Feed berita GDELT di UI Svelte.
- Chat/thread global sebagai home.
- Stage/status bab sebagai UI utama.

`apps/web` (Next.js) masih ada di monorepo untuk landing/legacy; arah cutover produk adalah Svelte. Perubahan schema research-first **memutus** kompatibilitas penuh dengan app Next lama — diterima secara eksplisit.

---

## 9. User journeys kunci

### Journey A — Mulai dari nol

Onboarding → Beranda Research Shelf → Proyek baru (pilih skripsi) → isi topik kasar + opsional pedoman PDF → rumah proyek tab Chat → brainstorm judul/topik dengan Astra → kumpulkan sumber dari Explore/search → tulis/edit lewat anotasi + proposal → ekspor PDF.

### Journey B — Loop menulis harian

Buka proyek → baca preview → tandai bagian lemah → minta Astra perbaiki → review hunk → Terima → lanjut bab berikutnya lewat TOC → sesekali buka Editor untuk sunting manual.

### Journey C — Literature intake

Explore → filter (tahun, OA, topic, institusi, …) → batch simpan ke perpustakaan → (opsional) link ke proyek dari Referensi → `@key` muncul di dokumen / bibliografi compile.

### Journey D — Deep dive mahal

Di thread proyek: `/deep <pertanyaan>` → kartu rencana → Setujui → jejak proses → sintesis bersitasi → sumber terlacak di provenance; kuota deep terdebit.

---

## 10. Status implementasi vs sisa kerja

Ringkasan berdasarkan roadmap specs + kode di branch (bukan audit QA formal).

| Area | Status arah |
|---|---|
| Domain proyek/kind/citations/links/thread scope | ✅ Terbentuk (Fase 1) |
| IA Svelte project-first | ✅ |
| Library + search + explore tanpa berita | ✅ (+ advanced search & research canvas) |
| Typst dokumen tunggal + scaffold + preview WASM | ✅ (Fase 9) |
| Proposal/anotasi/composer loop | ✅ (spec 21 Jul + impl) |
| Research Shelf beranda | ✅ |
| Project references page | ✅ |
| Ekspor PDF/DOCX Typst | ✅ jalur service ada |
| Shared Journal / reviewer dosen di IA baru | ❌ Out of scope saat ini |
| Presisi span→baris preview↔source | ❌ Ditunda (perlu upstream typst.ts) |
| Template pedoman kampus otomatis dari PDF | ❌ Out of scope |
| Kolaborasi realtime multi-user | ❌ Out of scope |
| DROP tabel `feed_*` | ⏳ Menunggu cutover penuh dari `apps/web` |
| OS sandbox compiler produksi | ⏳ Prasyarat ops sebelum expose luas |

---

## 11. Explicitly out of scope (arah saat ini)

- Organisasi / classroom / RBAC tim.
- Chat global sebagai home produk.
- Feed berita / GDELT di Svelte.
- SuperDoc / BlockNote sebagai editor karya tulis kanonik.
- LaTeX sebagai format kanonik user-facing.
- Semantic search / Boolean query builder di Explore.
- Journal rank eksternal (SINTA, Scopus quartile, SJR) tanpa integrasi berlisensi terpisah.
- Yjs / CRDT kolaborasi.
- Auto-generate template dari pedoman universitas.
- Redesign menyeluruh Settings.
- Fear-based citation policing sebagai fitur inti.

---

## 12. Metrik keberhasilan produk (kualitatif)

Satu sesi berhasil bila mahasiswa keluar dengan **satu bagian draf yang ia percaya** dan bisa diserahkan ke reviewer — bukan hanya jawaban chat yang mengesankan.

Indikator arah (bukan KPI formal):

- Proyek dibuka lebih sering daripada thread orphan.
- Sitasi di dokumen tertelusur ke item Perpustakaan/proyek.
- Proposal Astra diterima (sebagian/penuh) lebih sering daripada regenerate teks tanpa review.
- Explore → Simpan → muncul di Referensi proyek dalam satu alur.

---

## 13. Indeks dokumen sumber

### Positioning & visual

- `apps/svelte/PRODUCT.md`
- `apps/svelte/DESIGN.md`

### Master & fase research-first

- `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md` — master keputusan produk
- `docs/superpowers/specs/2026-07-18-research-first-phase-planning-context.md` — peta konteks fase
- `docs/superpowers/specs/2026-07-20-research-first-phase9-typst-single-document-design.md` — pivot Typst (otoritatif dokumen)
- `docs/superpowers/specs/2026-07-21-typst-agent-composer-annotations.md` — loop Astra/proposal/anotasi

### Surface specs lanjutan

- `docs/superpowers/specs/2026-07-15-onboarding-guided-research-journey-design.md`
- `docs/superpowers/specs/2026-07-22-app-home-research-shelf-design.md`
- `docs/superpowers/specs/2026-07-23-advanced-literature-search-design.md`
- `docs/superpowers/specs/2026-07-23-project-references-library-design.md`
- `docs/superpowers/specs/2026-07-24-explore-research-canvas-design.md`
- `docs/superpowers/specs/2026-07-18-research-first-phase3-library-search-design.md`

### Agent & arsitektur

- `docs/product/astra-agent-spec.md`
- `docs/architecture/00-overview.md` … `06-implementation-phases.md`

### Historis (jangan dipakai sebagai arah maju)

- Specs SuperDoc / LaTeX fase 4–8b di `docs/superpowers/specs/` — digantikan Fase 9 Typst

---

## 14. Satu paragraf "north star"

> Aqsha menaruh **karya tulis mahasiswa** di tengah: satu proyek, satu dokumen Typst yang hidup di preview realtime, sumber yang tertata di perpustakaan, dan Astra yang mengusulkan perubahan lewat diff — sehingga riset dan tulisan berhenti terpisah, dan setiap ide tetap tertaut rapi ke bukti di belakangnya.
