# Landing page redesign plan

> Status: **draft for owner review** (2026-06-19). Source surface: `apps/web/features/marketing/`. Companion: `BRAND-IDENTITY.md`, `apps/web/AGENTS.md`. Bahasa untuk brainstorming/planning = Indonesia; istilah teknis Inggris.

## 1. Tujuan & masalah

Landing page sekarang rapi secara teknis tapi **salah brand**: hero berupa panel terminal gelap, `WorkflowSection` menampilkan JSON palsu, beberapa seksi dibungkus crosshair CAD, contoh "RAG evaluation" tidak relatable, copy English-only, dan voice "academic-proof" yang justru diminta dihindari oleh brand doc. Tidak ada satu pun fitur unggulan yang punya seksi sendiri yang detail.

**Target:** halaman terstruktur, tiap fitur unggulan punya seksinya sendiri, semua visual = **mock produk asli yang cantik (tanpa kode)**, on-brand (playful-premium untuk mahasiswa), Bahasa Indonesia.

## 2. Keputusan terkunci (owner, 2026-06-19)

1. **Visual/token**: pertahankan token live `apps/web` — **Instrument Serif** (`font-heading`), `--primary` near-black, `--background` warm-stone — dan dorong keluarga **soft-tint mint/sky/coral/lemon** untuk rasa playful. **Tidak** re-theme ke palet brand-doc (Nunito Rounded + sky-blue #256fd0). (Live `apps/web` authoritative karena landing ship dari sana.)
2. **Proses**: implementation plan detail dulu (dokumen ini) sebelum kode.
3. **Social proof**: owner punya sinyal trust nyata (kampus/pers/jumlah-user/award) → slot props owner-supplied + fallback kualitatif jujur. *(Owner perlu sebut nilai persisnya — lihat §9.)*

## 3. Realita arsitektur (penting saat menulis copy)

- Otak riset Astra (deep research, statistical verification, citation integrity, subagents) ada di **`apps/agents/src/`** (Claude Agent SDK service), bukan `packages/convex/convex/agent/*` yang lama.
- `BRAND-IDENTITY.md` menjual **Journal / Shared Journal / mentor review/edit** — **tidak ada di codebase**. Surface menulis asli = **BlockNote artifact editor** di workspace. **Jangan** iklankan fitur yang belum dibangun.
- Brand melarang fear language ("zero halusinasi", "sitasi terjamin"); framing integritas = tenang/menolong (dicek/diverifikasi/belum ditemukan).

## 4. Fitur unggulan (6 flagship, semua high-evidence + tested)

1. **Astra deep research (`/deep`)** — multi-fase paralel → laporan ber-sitasi.
2. **Citation integrity check** — tiap referensi dicek ke Crossref/OpenAlex/arXiv. *(Cerita kepercayaan paling kuat & ownable.)*
3. **Statistical verification engine** — hitung ulang p-value/GRIM/power di dalam paper.
4. **Jelajahi discovery feed** — feed personalized Untukmu/Teratas/Topik + cek-fakta.
5. **Source Library + PDF reader in-app** — satu rumah rapi untuk paper & artifact.
6. **Astra chat (run-progress) + `@workspace` mentions** — menulis dengan AI yang membaca sumbermu, langkah demi langkah.

## 5. Struktur baru: narasi "alur kerja mahasiswa" bernomor (12 seksi)

| # | Seksi | Tujuan & visual inti |
|---|---|---|
| 1 | **Header** | Nav tugas-mahasiswa Bahasa (Jelajahi · Workspace · Astra · Harga) + Sheet mobile + brand mark "blok-A". |
| 2 | **Hero** | H1 outcome **"Riset rapi, tulisan siap-review — tanpa kekacauan tab."** + tagline *"Ideas, neatly linked."* Visual = mock jawaban Astra asli (run timeline → paragraf ber-sitasi → chip "Terverifikasi" → kartu "Simpan ke workspace"), kartu Jelajahi mengintip. **Console gelap dibuang.** |
| 3 | **Trust strip** | Kredibilitas tenang di bawah hero: 3 chip (Crossref/OpenAlex/arXiv · verifikasi statistik · feed personal) + slot sinyal owner. Tanpa fear/angka palsu. |
| 4 | **01 · Jelajahi** | Mosaic editorial asli: hero card + grid 3-up (1 ClaimCard + VerdictBadge) + DiscoveryAside donut + ModeNav. Contoh query relatable (**bukan RAG**). |
| 5 | **02 · Workspace** | Board LibraryArtifactCard + folder + WorkspacePicker + inset PDF reader (sitasi `[26]` tersorot lemon). |
| 6 | **03 · Tanya Astra** | Composer dengan pill `@Skripsi`/`@ws:paper` + activity timeline (cari→baca→tulis) → jawaban ber-sitasi → artifact card. |
| 7 | **04 · Riset mendalam yang bisa dipercaya** | **Klimaks.** Rail 5-fase menyala berurutan + plan-gate + subagent paralel + kartu "Laporan verifikasi" + daftar referensi dengan status chip tenang. |
| 8 | **05 · Tulis** | Document editor BlockNote (judul + prosa + chip sitasi) + kipas 3 artifact (draf/tabel/diagram Mermaid ter-render) + sub-beat tab "Bisa dari sumber apa pun". |
| 9 | **Social proof + onboarding** | Glimpse onboarding (InterestChip) + dinding testimoni beratribusi. Degrade jujur kalau quote belum ada. |
| 10 | **Pricing** | **Pertahankan** data wiring + IDR + hover gradient; re-skin copy ke Bahasa + manfaat mahasiswa per limit. |
| 11 | **Final CTA** | Penutup optimis **"Mulai dari satu ide."** + motif blok-tertaut. Crosshair frame dibuang. |
| 12 | **Footer** | Footer Bahasa lengkap: Produk · Bantuan · Legal. |

## 6. Sistem visual, motion & copy

- **Kanvas warm off-white** + soft-tint **bermakna**: `mint`=tertaut/tersimpan/terverifikasi, `sky`=sumber/sitasi eksternal, `coral`=warning lembut/bukti tandingan, `lemon`=highlight, `lavender`=tag tersier (hemat).
- **Motif "blok tertaut"**: brand mark blok-A + dot mint + garis link mint tipis yang menghubungkan chip sumber → chip sitasi (hero/chat/penutup).
- **Semua visual = re-skin statis komponen produk asli** (zero Convex). Tanpa kode/terminal/JSON/crosshair. Tanpa kartu-di-dalam-kartu.
- **Chapter bernomor 01–05** (`font-heading muted/40`) → cadence "sistem nyata" ala Linear.
- **Motion**: pakai ulang kosakata `motion/react` (clipPath wipe, fade+blur+y, pathLength line-draw, spring micro-lift), **one-shot whileInView**, semua di-gate `useReducedMotion`. **Drop tilt 3D console** di hero.
- **Copy**: Bahasa Indonesia, sentence case (tagline English satu-satunya pengecualian), pimpin dengan outcome, heading = pekerjaan selesai + contoh relatable, trust **ditunjukkan** lewat chip status, CTA pakai kata kerja mahasiswa ("Mulai menulis"). **Dilarang**: fear/accusation, logo kampus/angka palsu, jargon "RAG".

## 7. Strategi mock (zero-Convex)

Per-komponen, 3 strategi berdasarkan rating `staticMockable` + `dataDependencies` (hasil ekstraksi API: **40 pure-props, 15 needs-light-wrapper, 5 needs-heavy-stub**):

- **(A) Fixture-prop komponen asli** (impor apa adanya, handler no-op): DiscoveryHeroCard/StandardCard/ClaimCard, VerdictBadge/StanceTally/Sparkline/Donut, DiscoveryAside, DiscoveryModeNav, ConsensusMeter, NodeStatusIcon/NodeLine/ToolRow/SubagentCard/Shimmer, UserMessageBubble, AnswerSources/SourceLinkRow, ContextMentionPalette, LibraryArtifactCard, DocumentTitleEditor, CitationIntegritySummary, ResearchPlanReviewCard, HitlQuestionCard, InterestChip/InterestsStep, ArtifactReadingColumn (csv/json/url/plain_text).
- **(B) Extract presentational core**: hanya komponen `needs-light-wrapper` dengan coupling yang bisa di-bypass via prop/branch.
- **(C) Rebuild static lookalike** (5 heavy stubs — **jangan impor**): **StaticArtifactCard** (ChatArtifactCard memanggil `useConvexMutationState` tanpa syarat), **StaticPdfReaderFragment** (react-pdf/pdfjs), **StaticBlocknoteProse** (BlockNote/prosemirror berat), **StaticMermaid** (mermaid async → SVG pra-render), **StaticWorkspacePicker** + **SaveToWorkspaceButton rebuild** (api.workspaces/artifacts). **ComposerMentionsProvider tak pernah di-mount** (2× `useConvexQueryData`) — hanya reuse class pill.

**Invariant zero-Convex**: tipe `DiscoveryItem` di-import **type-only** dari `@aqsha/convex/feed`; fixtures hidup di `features/marketing/_mocks/`; popover Save di discovery cards tetap inert (tak fetch sampai diklik). Rail deep-research 5-fase **digambar dari nol** (tak ada komponen rail tunggal) meminjam glyph dari `run-progress.tsx`.

## 8. Directory layout

```
apps/web/features/marketing/
  components/
    landing-page.tsx                 (REFACTOR — komposisi 12-seksi)
    landing-header.tsx               (REFACTOR — nav Bahasa + Sheet + block-A)
    landing-hero-section.tsx         (REFACTOR — mock Astra statis)
    trust-strip-section.tsx          (NEW)
    feature-jelajahi-section.tsx     (NEW — 01)
    feature-workspace-section.tsx    (NEW — 02)
    feature-astra-chat-section.tsx   (NEW — 03)
    feature-deep-verify-section.tsx  (NEW — 04 climax)
    feature-tulis-section.tsx        (NEW — 05)
    social-proof-section.tsx         (NEW)
    pricing-section.tsx              (REFACTOR — copy Bahasa + header)
    final-cta-section.tsx            (RENAME dari bottom-cta-section.tsx)
    landing-footer.tsx               (REFACTOR — Bantuan + Legal)
    shared/
      block-a-mark.tsx · linked-block-motif.tsx · chapter-heading.tsx · mock-shell.tsx
      static-artifact-card.tsx · static-workspace-picker.tsx
      static-pdf-reader-fragment.tsx · static-blocknote-prose.tsx
  _mocks/
    noop-handlers.ts · discovery-fixtures.ts · astra-fixtures.ts
    deep-research-fixtures.ts · library-fixtures.ts · tulis-fixtures.ts
    trust-signals.ts · testimonials.ts
```
Offender dihapus: `landing-demo-session-preview`, `landing-demo-section`, `demo-feature-grid`, `integration-harness-section`, `workflow-section`, `workflow-code-panel`, `workflow-copy-block`, `workflow-diagram`, `bottom-cta-section` (rename), `technical-crosshair-frame`.

## 9. Fase implementasi (executable, file-by-file)

**Fase 0 — Foundation & cleanup.** Hapus 8 offender; bangun `block-a-mark` + `linked-block-motif` + `mock-shell` + `noop-handlers`; bersihkan keyframe demo di `globals.css` (`.landing-demo-*`, `@keyframes aqsha-demo-cycle*`); setel `landing-page.tsx` ke kerangka 12-seksi (stub sementara). *Done:* grep landing-demo/workflow-code = 0; lint+typecheck hijau. *(Jangan hapus `technical-crosshair-frame` di sini — masih dipakai `bottom-cta`.)*

**Fase 1 — Header + hero + trust strip (above-the-fold, ship duluan).** Refactor header (nav Bahasa + Sheet + block-A); rebuild hero (mock Astra statis: UserMessageBubble + run-progress + AnswerSources + StaticArtifactCard + DiscoveryHeroCard peeking) + outcome H1 + tagline, drop rotateX/skewY; trust strip 3-chip + slot owner. Buat `static-artifact-card.tsx`, `astra-fixtures.ts`, `trust-signals.ts`. *Done:* tak ada bg-foreground/font-mono/'workspace-rag'; tak ada provider Convex.

**Fase 2 — Mock toolkit + Chapter 01 Jelajahi.** `chapter-heading.tsx` + `feature-jelajahi-section.tsx` + `discovery-fixtures.ts`. Mosaik penuh (ModeNav + hero + 3-up grid + ClaimCard + DiscoveryAside) di `MockShell` (`@container/feed`). *Done:* split 2-kolom aktif; ClaimCard tampil VerdictBadge; caption query relatable bukan RAG.

**Fase 3 — Chapter 02 Workspace + 03 Astra chat.** `static-workspace-picker.tsx`, `static-pdf-reader-fragment.tsx`, `feature-workspace-section.tsx` (board + folder + reader inset), `feature-astra-chat-section.tsx` (composer @mention + activity turn), `library-fixtures.ts`. *Done:* reader tanpa react-pdf; ContextMentionPalette tanpa provider; pakai StaticArtifactCard.

**Fase 4 — Chapter 04 deep-research climax (spike dulu).** `feature-deep-verify-section.tsx` (rail 5-fase digambar manual + plan-gate ResearchPlanReviewCard + SubagentCard fan + verification report card + CitationIntegritySummary + opsional ConsensusMeter) + `deep-research-fixtures.ts`. *Done:* chip integritas tenang (mint/amber/neutral, no red); copy calm-only.

**Fase 5 — Chapter 05 Tulis.** `static-blocknote-prose.tsx`, `feature-tulis-section.tsx` (DocumentTitleEditor + prose + artifact fan markdown/table/Mermaid-SVG + sub-beat 4-tab) + `tulis-fixtures.ts`. *Done:* tanpa BlockNote/mermaid runtime; SaveToWorkspaceButton rebuild.

**Fase 6 — Social proof + onboarding.** `social-proof-section.tsx` (InterestChip glimpse + testimonial Card wall) + `testimonials.ts`. *Done:* data owner-supplied; degrade jujur tanpa nama/metrik fiktif.

**Fase 7 — Pricing re-skin + final CTA + footer.** Refactor `pricing-section.tsx` (header visible + benefit per limit + CTA Bahasa, **pertahankan** PLAN_CATALOG + IDR + hover gradient); `final-cta-section.tsx` (rename, lepas crosshair, motif blok-tertaut); refactor `landing-footer.tsx` (Bantuan + Legal). **Hapus** `bottom-cta-section.tsx` + `technical-crosshair-frame.tsx`. *Done:* grep technical-crosshair = 0.

**Fase 8 — Polish & QA.** Audit reduced-motion (semua entrance `initial={reduce ? false : ...}` + static fallback); mobile (Sheet, stacked rows, single-column); grep `uppercase`/`lucide-react`/`RAG`/`workspace-rag` = 0; grep Convex coupling di `_mocks` = 0; `bun run lint + typecheck + build:app`.

## 10. Cross-cutting

Reduced-motion gating wajib · mobile (Sheet + stack) · sentence-case/no-uppercase (kecuali tagline) · icons via `@aqsha/ui/icons` saja · no code/terminal/RAG · a11y heading hierarchy + aria-hidden ornamen · perf (hindari mount BlockNote/react-pdf/mermaid; `next/image unoptimized` aman) · trust honesty (flag `hasReal*` + fallback) · invariant zero-Convex.

## 11. Risk register (ringkas)

| Risk | Mitigasi |
|---|---|
| Hapus `technical-crosshair-frame` dini pecah build (dipakai bottom-cta) | Hapus hanya di Fase 7 setelah final-CTA lepas frame |
| Hero showcase + keyframe `globals.css` saling bergantung | Fase 0 hapus keyframe + Fase 1 ganti hero dalam satu alur; grep = 0 |
| ChatArtifactCard `useConvexMutationState` tanpa syarat → crash | Rebuild StaticArtifactCard; larang import; grep Fase 8 |
| DiscoveryHeroCard butuh ancestor `@container/feed` | MockShell selalu sertakan; dokumentasi di `mock-shell.tsx` |
| react-pdf/BlockNote/mermaid berat & flash-prone | Rebuild lookalike statis; pilih payload non-pdf/non-mermaid |
| Trust/testimonial belum tersedia | Slot props + flag + fallback kualitatif; tidak fabrikasi |
| DiscoveryItem type drift | Import type-only; fixture field required saja; typecheck |

## 12. Open questions (perlu konfirmasi owner)

1. **Sinyal trust nyata** yang di-front-load (kampus/pers/jumlah-user/award) — nilai + sourceUrl per slot?
2. **Testimoni** mahasiswa/dosen Indonesia beratribusi nyata tersedia, atau honest-degrade?
3. **Pricing gloss**: wording student-benefit untuk "kredit", "riset mendalam" (Deep Research), "item pustaka"?
4. **Hero language**: pertahankan "Ideas, neatly linked." (default) atau lokalkan ke "Ide kamu, tertaut rapi."?
5. Screenshot produk nyata diinginkan di mana pun (mis. halaman PDF), atau re-skin statis cukup untuk launch?
6. Retune hover gradient pricing ke mint/sky/coral, atau biarkan 3 gradien hex existing?
7. Grouping seksi 09 (onboarding + social proof digabung) vs dipisah?
8. Climax deep-research tetap SATU seksi dedicated (default) vs dilipat jadi tab di seksi chat?
