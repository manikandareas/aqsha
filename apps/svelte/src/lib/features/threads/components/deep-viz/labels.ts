// Shared labels + colors + icons for the `/deep` evidence viz components. Stance colors = CSS token
// `--viz-stance-*` (globals.css, dataviz-validated per light/dark mode) — components DON'T write hex
// themselves. Copy in sentence case (no-uppercase copywriting rule). Icons are glyph DATA via `$lib/icons`.

import {
	DEEP_VIZ_STANCES,
	type DeepVizDesignBucket,
	type DeepVizStance,
	type DeepVizStudyDesign
} from '@aqsha/chat-core/deep-viz';
import {
	BookOpenIcon,
	ChartColumnIcon,
	EyeIcon,
	FileTextIcon,
	FlaskConicalIcon,
	SearchIcon,
	type IconSvgElement
} from '$lib/icons';

export const STANCE_ORDER: readonly DeepVizStance[] = DEEP_VIZ_STANCES;

export const STANCE_LABELS: Record<DeepVizStance, string> = {
	yes: 'Ya',
	possibly: 'Mungkin',
	mixed: 'Campuran',
	no: 'Tidak'
};

/** Stance color via CSS var token (adaptive light/dark) — used as `style.background`. */
export const STANCE_COLORS: Record<DeepVizStance, string> = {
	yes: 'var(--viz-stance-yes)',
	possibly: 'var(--viz-stance-possibly)',
	mixed: 'var(--viz-stance-mixed)',
	no: 'var(--viz-stance-no)'
};

export const DESIGN_LABELS: Record<DeepVizStudyDesign, string> = {
	meta_analysis: 'meta-analisis',
	systematic_review: 'tinjauan sistematis',
	rct: 'RCT',
	observational: 'observasional',
	review: 'review',
	other: 'lainnya'
};

/** Consensus-style design badge glyph (small chip in the meter legend) — from `$lib/icons`. */
export const DESIGN_ICONS: Record<DeepVizStudyDesign, IconSvgElement> = {
	meta_analysis: ChartColumnIcon,
	systematic_review: SearchIcon,
	rct: FlaskConicalIcon,
	observational: EyeIcon,
	review: BookOpenIcon,
	other: FileTextIcon
};

export const DESIGN_BUCKET_LABELS: Record<DeepVizDesignBucket, string> = {
	meta_sysrev: 'Meta/tinjauan sistematis',
	rct: 'RCT',
	observational: 'Observasional',
	other: 'Lainnya'
};

export const CLAIM_LABELS: Record<'strong' | 'moderate' | 'limited', string> = {
	strong: 'Kuat',
	moderate: 'Sedang',
	limited: 'Terbatas'
};

/** Claim-strength meter fill color: strong=green, moderate=yellow (stance token), limited=neutral. */
export const CLAIM_COLORS: Record<'strong' | 'moderate' | 'limited', string> = {
	strong: 'var(--viz-stance-yes)',
	moderate: 'var(--viz-stance-possibly)',
	limited: 'var(--muted-foreground)'
};

/**
 * Track (unfilled segment) of the strength meter = a lighter step of its fill color ramp (dataviz
 * meter spec: state readable along the whole bar, not just the filled part).
 */
export const CLAIM_TRACK_COLORS: Record<'strong' | 'moderate' | 'limited', string> = {
	strong: 'color-mix(in oklab, var(--viz-stance-yes) 22%, var(--muted))',
	moderate: 'color-mix(in oklab, var(--viz-stance-possibly) 22%, var(--muted))',
	limited: 'color-mix(in oklab, var(--muted-foreground) 18%, var(--muted))'
};
