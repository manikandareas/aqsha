/**
 * Katalog plan publik — kontrak data MURNI, browser-safe.
 *
 * Browser must not import `@aqsha/services`: subpath `@aqsha/services/plan` di-bundle tsup
 * ke shared chunk yang menarik kode lain, jadi bukan boundary-safe. Nilai + copy duplikat
 * di sini; drift dijaga `catalog.spec.ts` (invariant internal).
 *
 * Cakupan = HANYA yang dibutuhkan surface browser (marketing plan cards + JSON-LD): katalog +
 * selektor pure. Logika server-only (estimateCredits, billing status, admin env allowlist) SENGAJA
 * tidak dibawa — itu tetap di `@aqsha/services/plan` dan hanya dipanggil backend.
 */

export type PlanKey = 'free' | 'starter' | 'plus' | 'ultra' | 'admin';
export type PublicPlanKey = Exclude<PlanKey, 'admin'>;
export type PaidPlanKey = Exclude<PlanKey, 'free' | 'admin'>;
export type BillingInterval = 'month' | 'year';
export type ProductKey =
	| 'starterMonthly'
	| 'starterYearly'
	| 'plusMonthly'
	| 'plusYearly'
	| 'ultraMonthly'
	| 'ultraYearly';

export type PlanDefinition = {
	key: PlanKey;
	label: string;
	monthlyPriceIdr: number;
	annualPriceIdr: number;
	monthlyCredits: number;
	deepResearchRuns: number;
	workspaceLimit: number;
	libraryItemLimit: number;
	providerSpendCeilingCents: number;
	features: string[];
};

/** Batas tak-terhingga (admin + Ultra non-credit). Sentinel must match `@aqsha/services/plan`. */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const PLAN_ORDER: Record<PlanKey, number> = {
	free: 0,
	starter: 1,
	plus: 2,
	ultra: 3,
	admin: 4
};

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
	free: {
		key: 'free',
		label: 'Free',
		monthlyPriceIdr: 0,
		annualPriceIdr: 0,
		monthlyCredits: 150,
		deepResearchRuns: 2,
		workspaceLimit: 1,
		libraryItemLimit: 25,
		providerSpendCeilingCents: 0,
		features: [
			'Astra Lite',
			'150 credits per bulan',
			'2 Deep Research (Lite) per bulan',
			'1 workspace',
			'25 library items'
		]
	},
	starter: {
		key: 'starter',
		label: 'Starter',
		monthlyPriceIdr: 49_000,
		annualPriceIdr: 490_000,
		monthlyCredits: 500,
		deepResearchRuns: 3,
		workspaceLimit: 5,
		libraryItemLimit: 250,
		providerSpendCeilingCents: 125,
		features: [
			'Astra Lite + Astra Pro',
			'500 credits per bulan',
			'3 Deep Research (Pro) per bulan',
			'5 workspaces',
			'250 library items'
		]
	},
	plus: {
		key: 'plus',
		label: 'Plus',
		monthlyPriceIdr: 99_000,
		annualPriceIdr: 990_000,
		monthlyCredits: 1_500,
		deepResearchRuns: 12,
		workspaceLimit: 20,
		libraryItemLimit: 1_000,
		providerSpendCeilingCents: 400,
		features: [
			'Astra Lite + Astra Pro',
			'1.500 credits per bulan',
			'12 Deep Research per bulan',
			'20 workspaces',
			'1.000 library items'
		]
	},
	ultra: {
		key: 'ultra',
		label: 'Ultra',
		monthlyPriceIdr: 349_000,
		annualPriceIdr: 3_490_000,
		monthlyCredits: 10_000,
		deepResearchRuns: UNLIMITED,
		workspaceLimit: UNLIMITED,
		libraryItemLimit: UNLIMITED,
		providerSpendCeilingCents: 2_000,
		features: [
			'Astra Lite + Astra Pro',
			'10.000 credits per bulan',
			'Deep Research tanpa batas (fair-use)',
			'Workspace tanpa batas',
			'Library tanpa batas'
		]
	},
	admin: {
		key: 'admin',
		label: 'Admin',
		monthlyPriceIdr: 0,
		annualPriceIdr: 0,
		monthlyCredits: UNLIMITED,
		deepResearchRuns: UNLIMITED,
		workspaceLimit: UNLIMITED,
		libraryItemLimit: UNLIMITED,
		providerSpendCeilingCents: UNLIMITED,
		features: [
			'Unlimited internal credits',
			'Unlimited Deep Research',
			'Unlimited workspace dan library',
			'Usage tetap tercatat',
			'Global/provider rate limit tetap aktif'
		]
	}
};

export const PRODUCT_CATALOG: Record<
	ProductKey,
	{ key: ProductKey; planKey: PaidPlanKey; interval: BillingInterval; displayPriceIdr: number }
> = {
	starterMonthly: {
		key: 'starterMonthly',
		planKey: 'starter',
		interval: 'month',
		displayPriceIdr: 49_000
	},
	starterYearly: {
		key: 'starterYearly',
		planKey: 'starter',
		interval: 'year',
		displayPriceIdr: 490_000
	},
	plusMonthly: { key: 'plusMonthly', planKey: 'plus', interval: 'month', displayPriceIdr: 99_000 },
	plusYearly: { key: 'plusYearly', planKey: 'plus', interval: 'year', displayPriceIdr: 990_000 },
	ultraMonthly: {
		key: 'ultraMonthly',
		planKey: 'ultra',
		interval: 'month',
		displayPriceIdr: 349_000
	},
	ultraYearly: {
		key: 'ultraYearly',
		planKey: 'ultra',
		interval: 'year',
		displayPriceIdr: 3_490_000
	}
};

export const PRODUCT_KEYS = Object.keys(PRODUCT_CATALOG) as ProductKey[];
export const PUBLIC_PLAN_KEYS: PublicPlanKey[] = ['free', 'starter', 'plus', 'ultra'];

export function planForProductKey(productKey: string | undefined): PlanKey {
	if (!productKey) return 'free';
	return PRODUCT_CATALOG[productKey as ProductKey]?.planKey ?? 'free';
}

export function intervalForProductKey(productKey: string | undefined): BillingInterval | null {
	if (!productKey) return null;
	return PRODUCT_CATALOG[productKey as ProductKey]?.interval ?? null;
}

export function isPlanAtLeast(current: PlanKey, required: PlanKey): boolean {
	return PLAN_ORDER[current] >= PLAN_ORDER[required];
}
