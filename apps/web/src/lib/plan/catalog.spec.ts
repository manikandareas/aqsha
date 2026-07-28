import { describe, expect, it } from 'vitest';
import {
	PLAN_CATALOG,
	PLAN_ORDER,
	PRODUCT_CATALOG,
	PRODUCT_KEYS,
	PUBLIC_PLAN_KEYS,
	UNLIMITED,
	intervalForProductKey,
	isPlanAtLeast,
	planForProductKey,
	type PlanKey
} from './catalog';

// Kontrak katalog plan browser-safe. Test invariant internal → deteksi drift vs SoT
// `packages/services/src/plan.ts` tanpa mengimpor `@aqsha/services` ke bundle.
describe('plan catalog', () => {
	it('PLAN_ORDER menaik ketat free<starter<plus<ultra<admin', () => {
		expect(PLAN_ORDER.free).toBeLessThan(PLAN_ORDER.starter);
		expect(PLAN_ORDER.starter).toBeLessThan(PLAN_ORDER.plus);
		expect(PLAN_ORDER.plus).toBeLessThan(PLAN_ORDER.ultra);
		expect(PLAN_ORDER.ultra).toBeLessThan(PLAN_ORDER.admin);
	});

	it('PUBLIC_PLAN_KEYS = plan publik (tanpa admin) & tiap key ada di katalog', () => {
		expect(PUBLIC_PLAN_KEYS).toEqual(['free', 'starter', 'plus', 'ultra']);
		expect(PUBLIC_PLAN_KEYS).not.toContain('admin');
		for (const key of PUBLIC_PLAN_KEYS) {
			expect(PLAN_CATALOG[key].key).toBe(key);
		}
	});

	it('harga produk konsisten dgn PLAN_CATALOG (month=monthly, year=annual)', () => {
		expect(PRODUCT_KEYS).toHaveLength(6);
		for (const productKey of PRODUCT_KEYS) {
			const product = PRODUCT_CATALOG[productKey];
			const plan = PLAN_CATALOG[product.planKey];
			const expected = product.interval === 'month' ? plan.monthlyPriceIdr : plan.annualPriceIdr;
			expect(product.displayPriceIdr).toBe(expected);
		}
	});

	it('sentinel UNLIMITED = MAX_SAFE_INTEGER; ultra & admin memakainya', () => {
		expect(UNLIMITED).toBe(Number.MAX_SAFE_INTEGER);
		expect(PLAN_CATALOG.ultra.deepResearchRuns).toBe(UNLIMITED);
		expect(PLAN_CATALOG.ultra.workspaceLimit).toBe(UNLIMITED);
		expect(PLAN_CATALOG.admin.monthlyCredits).toBe(UNLIMITED);
		expect(PLAN_CATALOG.admin.libraryItemLimit).toBe(UNLIMITED);
	});

	it('isPlanAtLeast', () => {
		expect(isPlanAtLeast('plus', 'starter')).toBe(true);
		expect(isPlanAtLeast('starter', 'plus')).toBe(false);
		expect(isPlanAtLeast('free', 'free')).toBe(true);
	});

	it('planForProductKey / intervalForProductKey', () => {
		expect(planForProductKey('plusYearly')).toBe<PlanKey>('plus');
		expect(planForProductKey(undefined)).toBe<PlanKey>('free');
		expect(planForProductKey('bogus')).toBe<PlanKey>('free');
		expect(intervalForProductKey('starterMonthly')).toBe('month');
		expect(intervalForProductKey('ultraYearly')).toBe('year');
		expect(intervalForProductKey('bogus')).toBeNull();
	});
});
