/**
 * Pure pricing helpers for the landing page — separated for contract tests. Amounts derived from
 * `$lib/plan/catalog` (SSOT); do not duplicate catalog values here.
 */
import { PLAN_CATALOG, UNLIMITED, type PublicPlanKey } from '$lib/plan/catalog';

const idrFormatter = new Intl.NumberFormat('id-ID', {
	currency: 'IDR',
	maximumFractionDigits: 0,
	style: 'currency'
});
const idCountFormatter = new Intl.NumberFormat('id-ID');

export function formatIdr(value: number): string {
	return idrFormatter.format(value).replace(/\s+/g, '');
}

export function formatCount(value: number): string {
	return idCountFormatter.format(value);
}

export function planFeatureRows(planKey: PublicPlanKey): { label: string; value: string }[] {
	const plan = PLAN_CATALOG[planKey];
	return [
		{ label: 'Credits / bln', value: formatCount(plan.monthlyCredits) },
		{
			label: 'Deep Research',
			value:
				plan.deepResearchRuns === UNLIMITED
					? '∞'
					: plan.deepResearchRuns > 0
						? formatCount(plan.deepResearchRuns)
						: '—'
		},
		{
			label: 'Workspace',
			value: plan.workspaceLimit === UNLIMITED ? '∞' : formatCount(plan.workspaceLimit)
		},
		{
			label: 'Library items',
			value: plan.libraryItemLimit === UNLIMITED ? '∞' : formatCount(plan.libraryItemLimit)
		}
	];
}

/** Torn receipt bottom: zigzag teeth via clip-path (straight top, torn tail). */
export const receiptClipPath: string = (() => {
	const teeth = 22;
	const points: string[] = ['0% 0%', '100% 0%'];
	for (let i = 0; i <= teeth * 2; i++) {
		const x = 100 - (i / (teeth * 2)) * 100;
		const y = i % 2 === 0 ? '100%' : 'calc(100% - 8px)';
		points.push(`${x.toFixed(2)}% ${y}`);
	}
	return `polygon(${points.join(', ')})`;
})();

export type PlanPresentation = {
	href: string;
	cta: string;
	badge: string | null;
	includes: string | null;
};

export const planPresentation: Record<PublicPlanKey, PlanPresentation> = {
	free: { href: '/sign-up', cta: 'Mulai gratis', badge: null, includes: null },
	starter: {
		href: '/sign-up?plan=starter',
		cta: 'Pilih Starter',
		badge: 'populer',
		includes: 'semua di Free, plus'
	},
	plus: {
		href: '/sign-up?plan=plus',
		cta: 'Pilih Plus',
		badge: null,
		includes: 'semua di Starter, plus'
	},
	ultra: {
		href: '/sign-up?plan=ultra',
		cta: 'Pilih Ultra',
		badge: 'power',
		includes: 'semua di Plus, plus'
	}
};

export type Billing = 'monthly' | 'annual';

/** Label harga total sesuai periode billing (Gratis bila 0). */
export function priceLabel(planKey: PublicPlanKey, billing: Billing): string {
	const plan = PLAN_CATALOG[planKey];
	const raw = billing === 'monthly' ? plan.monthlyPriceIdr : plan.annualPriceIdr;
	return raw > 0 ? formatIdr(raw) : 'Gratis';
}

/** Footnote di bawah total. */
export function priceFootnote(planKey: PublicPlanKey, billing: Billing): string {
	const plan = PLAN_CATALOG[planKey];
	if (billing === 'monthly') {
		return plan.annualPriceIdr > 0 ? `tahunan: ${formatIdr(plan.annualPriceIdr)}` : 'tanpa kartu';
	}
	return plan.annualPriceIdr > 0 ? 'ditagih sekali setahun' : 'tanpa kartu';
}
