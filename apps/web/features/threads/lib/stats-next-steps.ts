/**
 * Peta next-step ritual analisis (fase C plan statistik-panel) — tuntunan urutan uji ala
 * `analisis-statistik/SKILL.md` (profil → deskriptif → validitas → reliabilitas → asumsi klasik →
 * regresi/korelasi). Tap chip = prefill composer dengan prompt bahasa natural (OQ3 default), TANPA
 * auto-send: agent tetap bebas menyimpang saat user mengetik sendiri. Deterministik & instan —
 * tanpa dependensi model.
 *
 * Hanya diisi untuk uji yang punya langkah lanjut yang jelas. `custom` (run_python_analysis) & uji
 * Tier 3 (SEM/faktor/mediasi/moderasi/beda lanjutan) SENGAJA kosong — jangan sok tahu arah risetnya.
 */
export type StatsNextStep = {
  /** Label chip ringkas (verba). */
  label: string;
  /** Prompt bahasa natural yang mengisi composer (terbaca sebelum dikirim). */
  prompt: string;
};

/** Lanjutan seragam sesudah tiap uji asumsi klasik: regresi (tujuan asumsi itu sendiri). */
const LANJUT_REGRESI: StatsNextStep = {
  label: "Lanjut regresi",
  prompt: "Asumsi klasik sudah terpenuhi. Lanjutkan dengan analisis regresi.",
};

/** Menutup pipeline: susun narasi Bab 4 dari seluruh hasil (bukan ekspor file — itu tombol panel). */
const NARASI_BAB4: StatsNextStep = {
  label: "Susun narasi Bab 4",
  prompt: "Tolong susunkan narasi Bab 4 dari seluruh hasil analisis di percakapan ini.",
};

const STATS_NEXT_STEPS: Record<string, StatsNextStep[]> = {
  descriptive: [
    { label: "Uji validitas", prompt: "Lanjutkan dengan uji validitas untuk setiap variabel." },
  ],
  uji_validitas: [
    {
      label: "Uji reliabilitas",
      prompt: "Lanjutkan dengan uji reliabilitas (Cronbach's Alpha) untuk setiap variabel.",
    },
  ],
  uji_reliabilitas: [
    {
      label: "Uji asumsi klasik",
      prompt:
        "Lanjutkan dengan uji asumsi klasik: normalitas, multikolinearitas, dan heteroskedastisitas.",
    },
    {
      label: "Statistik deskriptif",
      prompt: "Tampilkan statistik deskriptif untuk variabel penelitian.",
    },
  ],
  uji_normalitas: [LANJUT_REGRESI],
  uji_multikolinearitas: [LANJUT_REGRESI],
  uji_heteroskedastisitas: [LANJUT_REGRESI],
  uji_autokorelasi: [LANJUT_REGRESI],
  uji_linearitas: [LANJUT_REGRESI],
  regresi_linear: [
    { label: "Uji korelasi", prompt: "Lanjutkan dengan uji korelasi antar variabel." },
    NARASI_BAB4,
  ],
  korelasi: [NARASI_BAB4],
};

/** Langkah lanjut yang disarankan untuk satu analysis id — `[]` bila tak ada saran (jangan mengarang). */
export function statsNextStepsFor(analysis: string): StatsNextStep[] {
  return Object.hasOwn(STATS_NEXT_STEPS, analysis) ? STATS_NEXT_STEPS[analysis] : [];
}
