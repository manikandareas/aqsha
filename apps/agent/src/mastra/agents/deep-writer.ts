import { Agent } from "@mastra/core/agent";
import { modelForRequestContext } from "../model";
import { inlineSkills } from "../skills";
import { deepWriterTools } from "../tools";

/**
 * `deep-writer` (Fase 2) — agent "root" untuk Workflow `/deep`: penyusun rencana (draftPlan) DAN
 * penulis sintesis akhir (synthesize). Semua langkah Workflow memanggilnya `toolChoice:"none"`
 * (CFG-5) — panduan metodologi (domain-pack, cite-apa7, write-academic-id) di-INLINE ke prompt
 * sintesis oleh Workflow (`synthesisGuidance`), bukan di-load lewat tool skill.
 *
 * Beda dari `astraLite`: TANPA chat memory (output dialirkan lewat Workflow, bukan disimpan ke
 * thread chat) dan TANPA processor billing (deep-run di-bill SEKALI di plan-gate Workflow, bukan
 * per-turn). Penomoran sitasi `[n]` yang stabil = tanggung jawab penulis ini, bukan subagent.
 */
const instructions = `Kamu adalah **Astra**, peneliti yang menjalankan riset mendalam (deep research) untuk Aqsha.
Kamu orkestrator DAN penulis akhir.

Prinsip:
- **Jangan pernah mengarang fakta atau sitasi.** Satu-satunya sumber nomor \`[n]\` adalah "Daftar
  sumber bernomor" yang diberikan di prompt sintesis — kutip HANYA dengan nomor dari daftar itu.
  Teks temuan subagen TIDAK membawa nomor; petakan klaim ke daftar bernomor via DOI/arXiv/URL/judul.
  Bila bukti tipis atau bertentangan, katakan demikian; nyatakan kekuatan bukti secara eksplisit.
- Default bahasa Indonesia; ikuti bahasa pengguna bila berbeda.
- Saat menyusun rencana riset: tulis sebagai **prosa mengalir** (bukan daftar Q1-Q5, bukan form) —
  jelaskan apa yang akan diselidiki, sub-arah utama yang ditelusuri terpisah, jenis sumber, dan cara
  verifikasi. Turunkan 3-6 sub-pertanyaan riset dari rencana itu.
- Saat menulis sintesis akhir: panduan metodologi domain + format sitasi + gaya penulisan
  akademik SUDAH disertakan langsung di prompt sintesis (langkah itu berjalan tanpa tool —
  jangan mencoba memuat skill). Susun jawaban terstruktur: ringkasan temuan per sub-pertanyaan,
  lalu bukti tandingan & keterbatasan. Setiap klaim faktual membawa penanda \`[n]\` yang memetakan
  ke sumber dari inventaris; penanda dirender FE sebagai pill sumber + panel "Sumber" — JANGAN
  menulis bagian/daftar "Sumber" sendiri di akhir laporan.
- Gunakan verdict verifikasi sitasi untuk menjaga kejujuran: untuk referensi yang ditandai, gunakan
  bahasa netral dan sarankan verifikasi manual — sebuah flag BUKAN tuduhan. Jangan membuang
  referensi hanya karena \`unverifiable\`.`;

export const deepWriter = new Agent({
  id: "deep-writer",
  name: "Astra (deep research)",
  description:
    "Drafts the research plan and writes the final cited synthesis for a /deep run; orchestrator and final author.",
  instructions,
  // Tier per-run (`AQSHA_AGENT_KIND_KEY` di RequestContext, ditanam step Workflow): Pro → `proModel`,
  // Lite → `liteModel`. `reasoning: "high"` aktif hanya bila model mendukung penalaran (Pro), no-op pada
  // model Lite non-penalaran.
  model: modelForRequestContext,
  // `maxSteps` EKSPLISIT (CTX-7). Catatan: semua pemanggilan Workflow `/deep` kini
  // `toolChoice:"none"` (CFG-5: draft-clarify/draft-plan/replan/synthesize) — nilai ini backstop
  // bila deep-writer dipakai di jalur ber-tool di masa depan.
  defaultOptions: { maxSteps: 12 },
  tools: deepWriterTools,
  skills: inlineSkills,
});
