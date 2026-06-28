// Tipe view-model halaman Explore (redesign editorial 4-zona). Zona feed (Zona 4)
// memakai FeedItem dari features/discovery; tipe di sini untuk zona visual
// (constellation, pulse, gap, tension). Leaf type di-reuse oleh ./api (sumber tunggal).

import type { FeedTopic } from "@/features/discovery/types";

// ── Trust signal (lapisan verification-first, lihat PRD §7) ────────────────
export type TrustStatus = "peer-reviewed" | "preprint" | "corrected" | "retracted";
export type CitationStance = "mostly-supported" | "mostly-disputed" | "mixed" | "unknown";

// ── Hero — interest pills ──────────────────────────────────────────────────
// Pill = FeedTopic asli sehingga klik pill men-scope feed Zona 4 (perilaku nyata).
export type InterestPill = { id: FeedTopic | null; label: string };

// ── Constellation (force-directed paper graph) ─────────────────────────────
// Node = paper NYATA, relevan-secara-makna ke minat user / `q`. Edge = kemiripan makna
// (related_works ∪ tumpang-tindih topik). Data dari /explore/facets (OpenAlex `search.semantic`).
export type PaperNode = {
  key: string; // key kanonik → /app/explore/[paperRef]
  title: string;
  field: string; // primary_topic.field — grup warna
  year?: number;
  citedBy?: number;
  score?: number; // relevansi/topik 0..1
};
export type PaperEdge = [number, number, number]; // [indexA, indexB, weight 0..1]
export type ConstellationData = { nodes: PaperNode[]; edges: PaperEdge[] };

// ── Pulse (streamgraph) ────────────────────────────────────────────────────
export type PulseSeries = { name: string; values: number[] };
export type PulseData = { years: number[]; series: PulseSeries[] };

// ── Gap Finder ─────────────────────────────────────────────────────────────
export type GapResult = {
  num: string;
  question: string;
  citeA: string; // sitasi pendukung sisi A
  citeB: string; // sitasi pendukung sisi B
  novelty: number; // 0..100
};

// ── Tension Map (neraca) ───────────────────────────────────────────────────
export type TensionClaim = { label: string; weight?: number };
export type TensionData = {
  question: string;
  support: TensionClaim[];
  dispute: TensionClaim[];
};
