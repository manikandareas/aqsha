// Dummy realistis untuk zona prototype Explore (globe, pulse, gap, tension,
// trending). Sesuai PRD §11 — prototype memakai konten dummy yang hidup. Path
// data nyata per zona didokumentasikan di plan §7 (OpenAlex group_by/geo untuk
// pulse & globe; agent untuk gap; scite/LLM untuk tension). Konten bertema
// Computer Science / AI agents agar konsisten dengan referensi desain.

import type {
  GapResult,
  GlobeArc,
  GlobeNode,
  PulseData,
  TensionData,
  TrendingTopic,
} from "../types";

export const GLOBE_NODES: GlobeNode[] = [
  { lat: 37, lon: -122, label: "Stanford", emerging: false },
  { lat: 40, lon: 116, label: "Tsinghua", emerging: true },
  { lat: 51, lon: -1, label: "Oxford", emerging: false },
  { lat: 45, lon: -73, label: "MILA", emerging: false },
  { lat: 1, lon: 103, label: "NUS", emerging: true },
  { lat: 47, lon: 8, label: "ETH", emerging: false },
  { lat: 36, lon: 127, label: "KAIST", emerging: false },
  { lat: 51, lon: 0, label: "UCL", emerging: false },
  { lat: -6, lon: 106, label: "UI Jakarta", emerging: true },
];

export const GLOBE_ARCS: GlobeArc[] = [
  [0, 1],
  [0, 3],
  [1, 6],
  [4, 8],
  [2, 5],
  [4, 1],
];

export const PULSE_DATA: PulseData = {
  years: [2019, 2020, 2021, 2022, 2023, 2024, 2025],
  series: [
    { name: "agentic RAG", values: [2, 4, 7, 12, 20, 38, 52] },
    { name: "tool-use", values: [10, 14, 18, 22, 26, 30, 33] },
    { name: "grounding", values: [4, 6, 9, 12, 16, 21, 27] },
    { name: "memory", values: [6, 8, 11, 13, 15, 16, 18] },
  ],
};

export const TRENDING: TrendingTopic[] = [
  { topic: "Retrieval-augmented agents", pct: 38 },
  { topic: "On-device LLM", pct: 21 },
  { topic: "Eval reproducibility", pct: 17 },
  { topic: "Verified tool-use", pct: 12 },
];

export const GAP_EXAMPLES = [
  "Apa yang belum diteliti soal agentic RAG?",
  "Celah di evaluasi LLM agent?",
  "Irisan on-device LLM × retrieval terverifikasi?",
  "Reproduktibilitas benchmark agen?",
];

export const GAP_RESULTS: GapResult[] = [
  {
    num: "01",
    question: "Bagaimana agentic RAG menjaga kalibrasi ketidakpastian ketika retrieval gagal total?",
    citeA: "Chen 2025 · limitations",
    citeB: "Park 2024 · future work",
    novelty: 92,
  },
  {
    num: "02",
    question: "Apa dampak paper ter-retraksi terhadap grounding di pipeline RAG berbasis agen?",
    citeA: "Adeyemi 2025 · retracted",
    citeB: "Novak 2025 · corrected",
    novelty: 84,
  },
  {
    num: "03",
    question: "Irisan on-device LLM × verified retrieval — feasible di perangkat memori terbatas?",
    citeA: "Haryanto 2025",
    citeB: "Liu 2025",
    novelty: 77,
  },
];

export const TENSION_DATA: TensionData = {
  question: "Apakah benchmark tool-use mencerminkan kemampuan agen di dunia nyata?",
  // bobot ringan agar default condong tipis ke "Mendukung" (mirip referensi desain)
  support: [
    { label: "Tool-use benchmarks — Liu 2025", weight: 1.2 },
    { label: "Multi-hop w/ verified tools — Costa 2024", weight: 1.2 },
  ],
  dispute: [
    { label: "Agentic eval pitfalls — Park 2024", weight: 1 },
    { label: "Reproducibility gaps — Novak 2025", weight: 1 },
  ],
};

// Pertanyaan novelty-tag derivasi (dipakai Gap Finder).
export function noveltyTag(novelty: number): string {
  if (novelty >= 90) return "celah langka";
  if (novelty >= 80) return "jarang dibahas";
  return "mulai dilirik";
}
