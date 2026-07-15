import type { StatsVerdict } from '@aqsha/chat-core/stats-viz';

/**
 * Label + color class per verdict (light+dark, not color-alone — always has a text label). A
 * non-component module so the decision card (`stats-decision`) AND the aggregate verdict chip of the
 * run card (`analysis-run-card`) share one color source.
 */
export const STATS_VERDICT_META: Record<
	StatsVerdict,
	{ label: string; dot: string; chip: string }
> = {
	lolos: {
		label: 'Terpenuhi',
		dot: 'bg-emerald-500',
		chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
	},
	tidak_lolos: {
		label: 'Tidak terpenuhi',
		dot: 'bg-rose-500',
		chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
	},
	perhatian: {
		label: 'Perlu perhatian',
		dot: 'bg-amber-500',
		chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
	}
};
