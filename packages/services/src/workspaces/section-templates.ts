import type { WorkspaceKind } from "@aqsha/db";

export type SectionTemplate = { title: string; role: "bibliography" | null };

const BIBLIOGRAPHY: SectionTemplate = { title: "Daftar Pustaka", role: "bibliography" };

/**
 * Kerangka bab awal per jenis karya tulis. Hanya seed saat proyek dibuat —
 * setelah itu sections milik user penuh. Judul bahasa Indonesia karena menjadi
 * konten milik user (bukan enum sistem).
 */
export const SECTION_TEMPLATES: Record<WorkspaceKind, SectionTemplate[]> = {
  undergraduate_thesis: [
    { title: "Bab 1 — Pendahuluan", role: null },
    { title: "Bab 2 — Tinjauan Pustaka", role: null },
    { title: "Bab 3 — Metodologi Penelitian", role: null },
    { title: "Bab 4 — Hasil dan Pembahasan", role: null },
    { title: "Bab 5 — Penutup", role: null },
    BIBLIOGRAPHY,
  ],
  masters_thesis: [
    { title: "Bab 1 — Pendahuluan", role: null },
    { title: "Bab 2 — Kajian Pustaka", role: null },
    { title: "Bab 3 — Metodologi Penelitian", role: null },
    { title: "Bab 4 — Hasil dan Pembahasan", role: null },
    { title: "Bab 5 — Kesimpulan dan Saran", role: null },
    BIBLIOGRAPHY,
  ],
  dissertation: [
    { title: "Bab 1 — Pendahuluan", role: null },
    { title: "Bab 2 — Kajian Pustaka", role: null },
    { title: "Bab 3 — Kerangka Konseptual dan Hipotesis", role: null },
    { title: "Bab 4 — Metodologi Penelitian", role: null },
    { title: "Bab 5 — Hasil dan Pembahasan", role: null },
    { title: "Bab 6 — Kesimpulan dan Implikasi", role: null },
    BIBLIOGRAPHY,
  ],
  journal_article: [
    { title: "Pendahuluan", role: null },
    { title: "Metode", role: null },
    { title: "Hasil", role: null },
    { title: "Pembahasan", role: null },
    { title: "Kesimpulan", role: null },
    BIBLIOGRAPHY,
  ],
  proposal: [
    { title: "Pendahuluan", role: null },
    { title: "Tinjauan Pustaka", role: null },
    { title: "Metodologi Penelitian", role: null },
    { title: "Jadwal Penelitian", role: null },
    BIBLIOGRAPHY,
  ],
  paper: [
    { title: "Pendahuluan", role: null },
    { title: "Pembahasan", role: null },
    { title: "Penutup", role: null },
    BIBLIOGRAPHY,
  ],
  freeform: [],
};
