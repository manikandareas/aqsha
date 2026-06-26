// Matematika neraca Tension Map (pure). Beam berputar `tilt` derajat; tilt > 0
// = sisi "Membantah" (kanan) lebih berat → kanan turun. Lihat tension-map.tsx.
// ponytail: invarian — |tilt| ≤ maxDeg, seimbang (support==dispute) → 0.

import type { TensionClaim } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function sumWeights(claims: TensionClaim[]): number {
  return claims.reduce((acc, c) => acc + (c.weight ?? 1), 0);
}

/** Derajat kemiringan dari bobot dukung vs bantah. Positif = condong membantah. */
export function deriveTilt(support: number, dispute: number, maxDeg = 13): number {
  const total = support + dispute;
  if (total === 0) return 0;
  return clamp(((dispute - support) / total) * maxDeg, -maxDeg, maxDeg);
}

export type Lean = "support" | "dispute" | "balanced";

export function leanFromTilt(tilt: number, eps = 0.5): Lean {
  if (tilt < -eps) return "support";
  if (tilt > eps) return "dispute";
  return "balanced";
}

export function leanLabel(tilt: number): string {
  const lean = leanFromTilt(tilt);
  return lean === "support" ? "Mendukung" : lean === "dispute" ? "Membantah" : "Seimbang";
}

// CSS color var untuk label lean.
export function leanColorVar(tilt: number): string {
  const lean = leanFromTilt(tilt);
  if (lean === "support") return "var(--mint-foreground)";
  if (lean === "dispute") return "var(--coral-foreground)";
  return "var(--primary)";
}
