# Peta konteks brainstorm/plan per fase (research-first)

Tanggal: 2026-07-18
Tujuan: daftar dokumen + kode + skill yang **di-load sebagai konteks** sebelum brainstorm/plan
tiap fase repositioning research-first (arah LaTeX/PDF agen-first). Bukan spec fase itu sendiri —
ini indeks konteks. Roadmap: **8 fase**; Fase 1–5 selesai, 6–8 belum.

Konvensi: spec/plan fase baru WAJIB lanjut penomoran `YYYY-MM-DD-research-first-phaseN-<slug>`
(spec dulu → plan → implement). Brainstorm & planning **bahasa Indonesia**; istilah teknis Inggris.

---

## Baseline — selalu relevan (semua fase)

| Dokumen | Kenapa |
|---|---|
| `docs/superpowers/specs/2026-07-17-research-first-repositioning-design.md` | **Master**: keputusan produk, data model (`workspaces`/`workspace_sections`/`citations`/link/`chat_threads`), IA & routing, user flow, roadmap 8 fase. Sudah diselaraskan ke pivot LaTeX. |
| `docs/superpowers/specs/2026-07-18-research-first-phase4-latex-foundation-design.md` | **Otoritatif pivot**: rasional SuperDoc→LaTeX, §"Peta fase lanjutan" (definisi Fase 4–8), arsitektur sistem (2 surface di atas sumber LaTeX), §"Ditunda ke fase berikutnya". Titik-mulai tiap brainstorm 5–8. |
| `docs/superpowers/specs/2026-07-18-research-first-phase4-latex-gate-report.md` | **Kontrak & batas terbukti**: `LatexCompileService` (input `mainTex`/`bib`/`extraFiles`, output PDF/synctex/`errors[]`/intermediates), error codes, limit keamanan (`--untrusted` tak sandbox FS read → butuh OS sandbox), biber 2.17, cold-start, env knob. |
| `apps/svelte/PRODUCT.md` + `apps/svelte/DESIGN.md` | Positioning (student researcher, agen-first) + sistem visual (skill Impeccable). Untuk fase ber-UI (6–8). |
| `docs/architecture/00-overview.md`…`06-implementation-phases.md` | Blueprint stack. Terutama `04-service-layer.md` + `05-api-contracts.md` (Fase 5), `03-architecture.md`. |
| `CLAUDE.md` + `AGENTS.md` + `docs/README.md` | Konvensi repo: service = object-literal + `db` arg pertama, `throwAppError`, Eden Treaty, bun-only, ikon `@aqsha/ui/icons`, komentar why-only. |

**SUPERSEDED — jangan dipakai sebagai konteks maju** (historis, sudah di-pivot):
`…-phase4-editor.md` (plan) + `…-phase4-editor-design.md` (spec) = editor SuperDoc, gerbang NO-GO.
Baca hanya bila perlu memahami keputusan lama.

---

## Fase 5 — Model dokumen LaTeX kanonik + assembly + storage ✅ selesai

Ganti storage byte-DOCX per bab → sumber LaTeX teks; rakit preamble/thesis-class + body per-bab +
komposisi `.bib`; autosave/versioning teks.

> ✅ **selesai** — impl di `2026-07-18-research-first-phase5-latex-document-model-design.md` (spec)
> + `docs/superpowers/plans/2026-07-18-research-first-phase5-latex-document-model.md` (plan). Sumber
> LaTeX inline ber-CAS + `document_revisions` + `latex_builds` (latest-only), `bib_key` persisten,
> assembly per-bab/full, endpoint compile/build. Backend-only; UI viewer/editor = Fase 6/7.

- **Definisi**: latex-foundation-design §"Peta fase" baris 5 + §"Ditunda" (model kanonik & storage).
- **Data model**: master spec §"`workspace_sections`" (`document_artifact_id`, `role='bibliography'`)
  + §"Perpustakaan global" (link) → bentuk final storage sumber LaTeX.
- **Kontrak compile** (konsumen storage): gate report + kode `packages/services/src/latex/compile.service.ts`
  (kontrak `main.tex`/`refs.bib`/`extraFiles`) + `citation-bib.ts` (`buildBibliographyFile`, `exportBib`).
- **Precedent storage**: `packages/services/src/artifact.service.ts` (S3/MinIO, signed URL) + skema/migrasi
  `packages/db/` (pola migration + append-only) + `docs/superpowers/plans/2026-07-17-research-first-phase1-domain.md`
  (tabel sections dibuat di sini).
- **Skill/tool**: `superpowers:brainstorming` → `superpowers:writing-plans`; `find-docs`/context7 untuk lib.

## Fase 6 — Viewer PDF + lapisan anotasi + loop editing agen (UX inti; mungkin 6a/6b)

PDF.js + SyncTeX klik-ke-sumber; anotasi pinned + antrian; Astra sunting → diff → apply; loop
compile-validate + self-repair.

- **Definisi**: latex-foundation-design §"Peta fase" baris 6 + §"Arsitektur sistem" (surface PDF+anotasi).
- **SyncTeX**: kode `packages/services/src/latex/synctex.ts` (`parseSynctex`, `synctexInverseLookup`) +
  gate report kriteria 3.
- **Self-repair**: kontrak `errors[]` (line+pesan) di gate report + `log-parser.ts`.
- **PDF.js precedent**: pemakaian pdfjs eksisting di `apps/svelte` (thumbnail explore `PdfThumb`, viewer PDF
  Citation Manager) — pola render canvas.
- **Agen (loop co-writer)**: runtime Mastra `apps/agent/src/mastra/` (agents/tools/workflows) + **Mastra docs**
  (`.mcp.json` `@mastra/mcp-docs-server` / context7 `/mastra-ai/mastra`) — WAJIB verifikasi API vs `@mastra/core`.
- **Model anotasi**: skill `agentation` / `agentation-self-driving` (gaya toolbar anotasi) sebagai referensi UX.
- **Precedent chat/thread**: plan Fase 6–7 thread engine migrasi Svelte (memory) + `packages/chat-core`.
- **Skill/tool**: `superpowers:brainstorming` → `writing-plans`; `impeccable` (UX), `svelte-code-writer`,
  `shadcn-svelte`; `find-docs` (PDF.js/CodeMirror/Mastra).

## Fase 7 — Editor LaTeX opsional + tinjauan diff

CodeMirror LaTeX (opt-in, sekunder); surface diff Accept/Reject.

- **Definisi**: latex-foundation-design §"Peta fase" baris 7 + keputusan "editor opsional/opt-in".
- **Diff/apply**: keputusan loop diff Fase 6 (harus selaras) + precedent Accept/Reject BlockNote-AI
  (memory `blocknote-native-ai-astra` — pola apply/flush).
- **Editor precedent**: komponen editor `apps/svelte` (chapter-editor) + `svelte-code-writer` untuk komponen.
- **Skill/tool**: `find-docs` (CodeMirror 6 + bahasa LaTeX), `impeccable`, `svelte-code-writer`.

## Fase 8 — Thesis-class per-kampus + ekspor DOCX best-effort

Adopsi/sesuaikan `.cls` "persis pedoman kampus"; jaring pengaman kampus wajib-Word.

- **Definisi**: latex-foundation-design §"Peta fase" baris 8; master spec §risiko (DOCX best-effort).
- **Thesis-class**: preamble/assembly Fase 5 (titik sisip `.cls`) + gate report (bundle Tectonic = TeX Live
  2022; paket harus tercache offline).
- **Ekspor DOCX**: catatan gate — DOCX ditunda; opsi konverter (pandoc/`tex4ht`) diputuskan saat brainstorm ini.
- **Skill/tool**: `find-docs` (LaTeX `.cls`, pandoc), `firecrawl` (kumpul pedoman/template kampus nyata).

---

## Urutan pakai

1. Load **Baseline** (minimal: master spec + latex-foundation-design + gate report).
2. Load blok **fase target** + kode/rujukan yang disebut.
3. `superpowers:brainstorming` (bahasa Indonesia) → sepakati keputusan → `superpowers:writing-plans`
   → spec+plan `…-research-first-phaseN-<slug>` → eksekusi.
4. Prasyarat lintas-fase sebelum expose compiler ke user (Fase 5/6): **OS-level sandbox** (container
   read-only rootfs, no-network) — lihat gate report.
