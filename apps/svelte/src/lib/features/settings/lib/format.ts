// Pure billing/usage formatters — extracted from apps/web/features/settings/components/bits.tsx
// (the format functions; CreditMeter/UsageChart become .svelte components). Unit-testable,
// no DOM. id-ID currency grouping uses NBSP → stripped for the plain "Rp49.000" form.

const IDR = new Intl.NumberFormat('id-ID');

export function formatIdr(value: number): string {
	return value === 0 ? 'Gratis' : `Rp${IDR.format(value)}`;
}

export function formatCredits(value: number, unlimited: boolean): string {
	if (unlimited) return '∞';
	return IDR.format(value);
}

export function formatResetDate(epochMs: number): string {
	return new Date(epochMs).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

/** Grouped integer (id-ID) — used by the usage chart total. */
export function formatCount(value: number): string {
	return IDR.format(value);
}
