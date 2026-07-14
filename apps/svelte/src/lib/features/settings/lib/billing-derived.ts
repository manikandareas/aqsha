/**
 * Display derivations from the billing snapshot (`useBillingCurrent`) — ONE source of
 * truth so composer hint, sidebar card, and slash-palette badge don't each hardcode the
 * threshold & sentinel. `deepRunsLimit` unlimited is encoded by services as
 * `Number.MAX_SAFE_INTEGER` (see `UNLIMITED` in @aqsha/services `plan.ts`); the only place
 * the FE recognises that sentinel. Port 1:1 from apps/web/features/settings/lib/billing-derived.ts.
 */

/** "Low" threshold — credits are critical at ≤15% remaining (bar & number turn amber). */
export const LOW_CREDIT_RATIO = 0.15;

/** Unlimited sentinel for Deep Research run count (mirror `UNLIMITED` in services). */
const UNLIMITED_DEEP_RUNS = Number.MAX_SAFE_INTEGER;

type CreditFields = {
	isUnlimitedCredits: boolean;
	creditsLimit: number;
	creditsRemaining: number;
};

/** Credits low? Unlimited & limit 0 (no quota) are never considered low. */
export function isCreditsLow(data: CreditFields): boolean {
	return (
		!data.isUnlimitedCredits &&
		data.creditsLimit > 0 &&
		data.creditsRemaining / data.creditsLimit <= LOW_CREDIT_RATIO
	);
}

type DeepRunFields = { deepRunsUsed: number; deepRunsLimit: number };

/** Deep Research quota → { unlimited, remaining } (remaining clamped ≥ 0). */
export function deepRunsQuota(data: DeepRunFields): { unlimited: boolean; remaining: number } {
	if (data.deepRunsLimit >= UNLIMITED_DEEP_RUNS) {
		return { unlimited: true, remaining: Number.POSITIVE_INFINITY };
	}
	return { unlimited: false, remaining: Math.max(0, data.deepRunsLimit - data.deepRunsUsed) };
}
