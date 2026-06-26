// Referensi statis Gap Finder (BUKAN data dummy hasil). Globe/Pulse/Gap/Tension kini
// memakai data nyata dari /explore/facets & /explore/analysis (OpenAlex + LLM). Yang
// tersisa di sini hanya: contoh kueri seed + helper label novelty.

export const GAP_EXAMPLES = [
  "Apa yang belum diteliti soal agentic RAG?",
  "Celah di evaluasi LLM agent?",
  "Irisan on-device LLM × retrieval terverifikasi?",
  "Reproduktibilitas benchmark agen?",
];

/** Label kualitatif dari skor novelty (dipakai Gap Finder). */
export function noveltyTag(novelty: number): string {
  if (novelty >= 90) return "celah langka";
  if (novelty >= 80) return "jarang dibahas";
  return "mulai dilirik";
}
