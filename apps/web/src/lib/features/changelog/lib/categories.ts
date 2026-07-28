import { SparklesIcon, TrendingUpIcon, WrenchIcon, type IconSvgElement } from '$lib/icons';

import type { ChangelogCategory } from '../types';

type CategoryMeta = {
	label: string;
	/** Glyph Hugeicons (data, bukan komponen) — di-render `<Icon icon={meta.icon} />`. */
	icon: IconSvgElement;
	/** Kelas badge — pakai token soft (mint/sky) & muted, bukan warna hardcode. */
	className: string;
};

/**
 * Peta kategori → tampilan badge. Tiga kategori dibedakan lewat token semantik:
 * baru=mint (segar), peningkatan=sky (naik), perbaikan=netral (muted).
 */
export const CATEGORY_META: Record<ChangelogCategory, CategoryMeta> = {
	baru: {
		label: 'Baru',
		icon: SparklesIcon,
		className: 'bg-mint-soft text-mint-foreground border-mint-soft-border'
	},
	peningkatan: {
		label: 'Peningkatan',
		icon: TrendingUpIcon,
		className: 'bg-sky-soft text-sky-foreground border-sky-soft-border'
	},
	perbaikan: {
		label: 'Perbaikan',
		icon: WrenchIcon,
		className: 'bg-muted text-muted-foreground border-border'
	}
};
