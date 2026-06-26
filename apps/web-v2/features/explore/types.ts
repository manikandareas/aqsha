// Tipe view-model halaman Explore (redesign editorial 4-zona). Zona feed (Zona 4)
// memakai FeedItem dari features/discovery; tipe di sini hanya untuk zona
// visual/prototype (globe, pulse, gap, tension) yang datanya masih dummy —
// lihat plan §7 untuk path data nyata.

import type { FeedTopic } from "@/features/discovery/types";

// ── Trust signal (lapisan verification-first, lihat PRD §7) ────────────────
export type TrustStatus = "peer-reviewed" | "preprint" | "corrected" | "retracted";
export type CitationStance = "mostly-supported" | "mostly-disputed" | "mixed" | "unknown";

// ── Hero — interest pills + trending ───────────────────────────────────────
// Pill = FeedTopic asli sehingga klik pill men-scope feed Zona 4 (perilaku nyata).
export type InterestPill = { id: FeedTopic | null; label: string };
export type TrendingTopic = { topic: string; pct: number };

// ── Globe (Mapbox) ─────────────────────────────────────────────────────────
export type GlobeNode = { lat: number; lon: number; label: string; emerging: boolean };
export type GlobeArc = [number, number]; // pasangan index ke daftar node

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
