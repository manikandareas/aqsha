// Stats detail builder for the timeline adapter: tool part `run_analysis`/`run_python_analysis` →
// `analysis` detail (run card), `profile_dataset` success → `dataset-profile` detail (dataset card).
// Pure FE — numbers/verdicts still come from DB blocks (`statsGroupsByToolCallId`); this detail is
// only identity + args + friendly status.

import { statsAnalysisMeta, toRunKey } from '@aqsha/chat-core/stats-viz';
import type { DatasetProfileColumn, DatasetProfileSummary, DeepStepDetail } from './timeline-types';

type AnalysisDetail = Extract<DeepStepDetail, { kind: 'analysis' }>;

/** Long-running sandbox stats tools → their generic row gets a ticking elapsed timer. */
export const STATS_SANDBOX_TOOLS = new Set([
	'run_analysis',
	'run_python_analysis',
	'profile_dataset'
]);

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}
function asRecord(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** "X1.1–X1.5" for long column lists; ≤2 items written as-is. */
function listSummary(value: unknown): string | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.filter((x): x is string => typeof x === 'string' && x.length > 0);
	if (items.length === 0) return undefined;
	return items.length <= 2 ? items.join(', ') : `${items[0]}–${items[items.length - 1]}`;
}

/** Args-summary cap on the card (single line fits; full value not needed — this is identity). */
const ARGS_SUMMARY_MAX = 140;

/**
 * Column-mapping summary of `run_analysis` (`args.args`), best-effort: scalar as-is, column lists
 * summarized first–last, latent→item objects (latents/groups) split per latent. Empty/unreadable →
 * undefined (card hides the row).
 */
export function statsArgsSummary(rawArgs: unknown): string | undefined {
	const args = asRecord(rawArgs);
	const parts: string[] = [];
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === 'string' && value) parts.push(`${key}: ${value}`);
		else if (typeof value === 'number' && Number.isFinite(value)) parts.push(`${key}: ${value}`);
		else if (typeof value === 'boolean') parts.push(`${key}: ${value ? 'ya' : 'tidak'}`);
		else if (Array.isArray(value)) {
			const summary = listSummary(value);
			if (summary) parts.push(`${key}: ${summary}`);
		} else if (value && typeof value === 'object') {
			// Latent → item map (latents/groups): show per latent, the outer key is uninformative.
			for (const [latent, items] of Object.entries(value as Record<string, unknown>)) {
				const summary = listSummary(items);
				if (summary) parts.push(`${latent}: ${summary}`);
			}
		}
	}
	if (parts.length === 0) return undefined;
	const joined = parts.join(' · ');
	return joined.length > ARGS_SUMMARY_MAX ? `${joined.slice(0, ARGS_SUMMARY_MAX - 1)}…` : joined;
}

/**
 * `analysis` detail from tool INPUT (chunk `tool-call` / parsed delta / rehydrate args). Tolerant of
 * partial args (streaming): analysis id not yet present → fallback title + credits 0, next delta
 * overwrites. Not a stats run tool → undefined.
 */
export function statsRunDetailFromArgs(
	toolName: string,
	toolCallId: string,
	rawArgs: unknown
): AnalysisDetail | undefined {
	const args = asRecord(rawArgs);
	const artifactId = str(args.artifactId);
	if (toolName === 'run_analysis') {
		const analysis = str(args.analysis);
		const meta = statsAnalysisMeta(analysis);
		const argsSummary = statsArgsSummary(args.args);
		return {
			kind: 'analysis',
			analysis,
			// Id outside the catalog (model typo) → show the raw id; the tool itself returns ok:false.
			title: meta?.label ?? (analysis || 'Analisis statistik'),
			...(argsSummary ? { argsSummary } : {}),
			...(artifactId ? { artifactId } : {}),
			credits: meta?.credits ?? 0,
			runKey: toRunKey(toolCallId)
		};
	}
	if (toolName === 'run_python_analysis') {
		const meta = statsAnalysisMeta('custom');
		return {
			kind: 'analysis',
			analysis: 'custom',
			title: str(args.title) || meta?.label || 'Analisis kustom',
			...(artifactId ? { artifactId } : {}),
			credits: meta?.credits ?? 10,
			runKey: toRunKey(toolCallId)
		};
	}
	return undefined;
}

/**
 * Stats detail when the tool SETTLES (chunk `tool-result` / rehydrate `state==='result'`): analysis
 * run `ok:false` → mark `failed` + friendly tool note (blocked credit / column mapping);
 * `profile_dataset` `ok:true` → `dataset-profile` detail. `prev` = detail from args (may be absent
 * if a mid-stream re-attach missed `tool-call` — rebuilt minimally from the result).
 */
export function statsDetailFromResult(
	toolName: string,
	toolCallId: string,
	prev: DeepStepDetail | undefined,
	result: unknown,
	artifactId?: string
): DeepStepDetail | undefined {
	const r = asRecord(result);
	if (toolName === 'run_analysis' || toolName === 'run_python_analysis') {
		const base =
			prev?.kind === 'analysis' ? prev : statsRunDetailFromArgs(toolName, toolCallId, {});
		if (!base) return undefined;
		if (r.ok === false) {
			const note = str(r.note);
			return { ...base, failed: true, ...(note ? { note } : {}) };
		}
		// ok:true — fill the analysis id from the result if args weren't read in time (re-attach).
		const analysis = str(r.analysis) || base.analysis;
		const meta = statsAnalysisMeta(analysis);
		return {
			...base,
			analysis,
			title: base.analysis ? base.title : (meta?.label ?? base.title),
			credits: base.analysis ? base.credits : (meta?.credits ?? base.credits)
		};
	}
	if (toolName === 'profile_dataset' && r.ok === true) {
		const profile = datasetProfileSummary(r.profile);
		if (!profile) return undefined;
		return { kind: 'dataset-profile', artifactId: artifactId ?? '', profile };
	}
	return undefined;
}

/**
 * Defensive parse of the `profile` analysis output (`aqsha_stats/analyses/profile.py`): the table
 * with id `profile` is read BY column NAME (not fixed index), `meta.n` = row count. Unknown shape /
 * absent table → undefined (card not rendered, generic tool-row still shows).
 */
export function datasetProfileSummary(profile: unknown): DatasetProfileSummary | undefined {
	const p = asRecord(profile);
	const tables = Array.isArray(p.tables) ? p.tables : [];
	const profileTable = tables.map(asRecord).find((t) => t.id === 'profile');
	if (!profileTable) return undefined;
	const header = Array.isArray(profileTable.columns) ? profileTable.columns.map(String) : [];
	const iName = header.indexOf('Kolom');
	const iType = header.indexOf('Tipe');
	const iMissing = header.indexOf('Missing');
	const iLikert = header.indexOf('Likert');
	if (iName < 0) return undefined;

	const columns: DatasetProfileColumn[] = [];
	for (const raw of Array.isArray(profileTable.rows) ? profileTable.rows : []) {
		if (!Array.isArray(raw)) continue;
		const name = str(raw[iName]);
		if (!name) continue;
		const type = iType >= 0 ? str(raw[iType]) || 'unknown' : 'unknown';
		const missingRaw = iMissing >= 0 ? raw[iMissing] : 0;
		const missing =
			typeof missingRaw === 'number' && Number.isFinite(missingRaw) && missingRaw > 0
				? Math.floor(missingRaw)
				: 0;
		const likertRaw = iLikert >= 0 ? str(raw[iLikert]) : '';
		columns.push({
			name,
			type,
			missing,
			...(likertRaw && likertRaw !== '-' ? { likert: likertRaw } : {})
		});
	}
	if (columns.length === 0) return undefined;

	const meta = asRecord(p.meta);
	const rowCount =
		typeof meta.n === 'number' && Number.isFinite(meta.n) && meta.n >= 0 ? meta.n : undefined;
	return { ...(rowCount !== undefined ? { rowCount } : {}), columns };
}
