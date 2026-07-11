# ADR: Parser bibliografi + CSL engine untuk Citation Manager

> Status: **DIPUTUSKAN** — 2026-07-11. Hasil spike Fase 0 dari `docs/citation-manager-mendeley-plan.md` §6.3.

## Konteks

Citation Manager workspace membutuhkan (1) parser BibTeX/RIS untuk import hasil ekspor Mendeley/Zotero, (2) representasi canonical CSL-JSON, dan (3) renderer multi-style (APA 7, IEEE, Vancouver, Chicago Author-Date). Preseden repo: dependensi GPL ditolak (factor-analyzer di-drop; openpls diisolasi via subprocess). Engine hanya boleh berjalan server-side (API/services) — tidak masuk bundle `apps/web`.

## Keputusan

1. **Parser + konversi: `@citation-js/core` + `@citation-js/plugin-bibtex` + `@citation-js/plugin-ris` (v0.8.1, lisensi MIT).**
   Tervalidasi terhadap fixture ekspor nyata Mendeley dan Zotero (`packages/services/test/fixtures/citations/`): LaTeX escape (`M{\"u}ller` → Müller), non-ASCII (CJK, Islandia), corporate author, multi-author 8 nama, thesis/edition/publisher-place, entry tanpa DOI/tahun — semua menjadi CSL-JSON benar tanpa mengarang data. Entry malformed menghasilkan diagnostic per-entry, bukan gagal total (dipaksa lewat parsing per-entry di `CitationImportService`).
2. **CSL engine: `citeproc` v2.4.x (citeproc-js) via `@citation-js/plugin-csl`, dielekukan di bawah lisensi CPAL-1.0** dari dual-license `CPAL-1.0 OR AGPL-1.0`.
   - CPAL berbasis MPL: copyleft file-level pada source citeproc itu sendiri (tidak kami modifikasi) + kewajiban attribution notice. **Bukan GPL/AGPL** — tidak menular ke kode Aqsha.
   - Kewajiban attribution dipenuhi dengan mencantumkan atribusi citeproc-js (Frank Bennett, https://github.com/Juris-M/citeproc-js) pada halaman legal/kredit produk saat fitur rilis publik, dan header lisensi file vendor tidak dihapus.
   - Engine hanya di `packages/services` (server-side); tidak pernah di-import `apps/web`.
   - Alternatif yang ditolak: menulis formatter manual multi-style (preseden `research/references.ts` — author cap 3, satu style, tidak sebanding dengan cakupan CSL); citeproc-rs (tidak dirawat).
3. **Style CSL di-vendor sebagai modul TS** di `packages/services/src/citations/styles/` (string export, aman untuk tsup/dist tanpa loader asset):
   - `apa.csl` (APA 7th edition), `ieee.csl`, `chicago-author-date.csl`, dan **`nlm-citation-sequence.csl` sebagai style "Vancouver"** — file `vancouver.csl` sudah di-rename di repo resmi CSL menjadi `nlm-citation-sequence` ("NLM/Vancouver: Citing Medicine 2nd edition (citation-sequence)"); dependent style `vancouver-nlm` menunjuk parent ini.
   - Locale `locales-en-US.xml` dari repo resmi locales.
   - Lisensi style/locale: CC BY-SA 3.0 — header atribusi dalam file dipertahankan.
   - ID style internal: `apa-7`, `ieee`, `vancouver`, `chicago-author-date` (default workspace: `apa-7`).
4. **RIS**: tetap pakai `@citation-js/plugin-ris` (bukan parser tulis-sendiri) — hasil spike menunjukkan mapping `TY/T2/A2/DA/SP-EP/SN` benar termasuk chapter+editor.
5. **EndNote XML: di luar scope v1** (keputusan terbuka #1 plan — ditutup; `.bib`/`.ris` sudah melayani jalur ekspor Mendeley dan Zotero).

## Konsekuensi

- `packages/services` menambah dependencies `@citation-js/core`, `@citation-js/plugin-bibtex`, `@citation-js/plugin-ris`, `@citation-js/plugin-csl` (transitif `citeproc` CPAL-1.0).
- Snapshot test render 4 style menjadi guard determinisme (`packages/services/test/citations-format.test.ts`).
- Upgrade file style CSL = penggantian file vendor + review snapshot diff.
