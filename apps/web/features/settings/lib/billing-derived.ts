/**
 * Turunan tampilan dari snapshot billing (`useBillingCurrent`) — SATU sumber kebenaran
 * agar composer hint, kartu sidebar, dan badge slash palette tak masing-masing meng-hardcode
 * ambang & sentinel. `deepRunsLimit` unlimited di-encode services sebagai `Number.MAX_SAFE_INTEGER`
 * (lihat `UNLIMITED` di `@aqsha/services` `plan.ts`); satu-satunya tempat FE mengenali sentinel itu.
 */

/** Ambang "menipis" — kredit dianggap kritis di ≤15% sisa (bar & angka jadi peringatan amber). */
export const LOW_CREDIT_RATIO = 0.15;

/** Sentinel unlimited untuk run count Deep Research (cermin `UNLIMITED` di services). */
const UNLIMITED_DEEP_RUNS = Number.MAX_SAFE_INTEGER;

type CreditFields = {
  isUnlimitedCredits: boolean;
  creditsLimit: number;
  creditsRemaining: number;
};

/** Kredit menipis? Unlimited & limit 0 (tak berkuota) tak pernah dianggap menipis. */
export function isCreditsLow(data: CreditFields): boolean {
  return (
    !data.isUnlimitedCredits &&
    data.creditsLimit > 0 &&
    data.creditsRemaining / data.creditsLimit <= LOW_CREDIT_RATIO
  );
}

type DeepRunFields = { deepRunsUsed: number; deepRunsLimit: number };

/** Kuota Deep Research → { unlimited, remaining } (remaining di-clamp ≥ 0). */
export function deepRunsQuota(data: DeepRunFields): { unlimited: boolean; remaining: number } {
  if (data.deepRunsLimit >= UNLIMITED_DEEP_RUNS) {
    return { unlimited: true, remaining: Number.POSITIVE_INFINITY };
  }
  return { unlimited: false, remaining: Math.max(0, data.deepRunsLimit - data.deepRunsUsed) };
}
