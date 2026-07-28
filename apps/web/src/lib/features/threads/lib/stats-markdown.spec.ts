import { describe, expect, it } from 'vitest';
import { statsMarkersInText } from './stats-markdown';
import { statsNextStepsFor } from './stats-next-steps';
import {
	datasetProfileSummary,
	statsArgsSummary,
	statsDetailFromResult,
	statsRunDetailFromArgs
} from './stats-run-detail';

// Contract tests for the stats transforms: marker parse + run-detail builders + profile parse.

describe('statsMarkersInText', () => {
	it('extracts runKeys in document order', () => {
		const markers = statsMarkersInText('Hasil {{stats:run-abc}} lalu {{stats:run-2}}.');
		expect(markers.map((m) => m.runKey)).toEqual(['run-abc', 'run-2']);
	});
	it('ignores malformed markers and is stateless', () => {
		expect(statsMarkersInText('no marker {{stats:}} {{other:x}}')).toEqual([]);
		const t = '{{stats:a}}';
		expect(statsMarkersInText(t)).toHaveLength(1);
		expect(statsMarkersInText(t)).toHaveLength(1);
	});
});

describe('statsRunDetailFromArgs', () => {
	it('builds an analysis detail for run_analysis with a runKey and catalog title', () => {
		const d = statsRunDetailFromArgs('run_analysis', 'call-1', {
			analysis: 'descriptive',
			artifactId: 'art'
		});
		expect(d).toMatchObject({ kind: 'analysis', analysis: 'descriptive', artifactId: 'art' });
		expect(d?.runKey).toBeTruthy();
	});
	it('handles run_python_analysis (custom) with a fallback title', () => {
		const d = statsRunDetailFromArgs('run_python_analysis', 'call-2', {});
		expect(d).toMatchObject({ kind: 'analysis', analysis: 'custom' });
	});
	it('returns undefined for non-stats tools', () => {
		expect(statsRunDetailFromArgs('search_web', 'c', {})).toBeUndefined();
	});
});

describe('statsDetailFromResult', () => {
	it('marks a run as failed with the tool note on ok:false', () => {
		const prev = statsRunDetailFromArgs('run_analysis', 'c', { analysis: 'descriptive' });
		const d = statsDetailFromResult('run_analysis', 'c', prev, { ok: false, note: 'Kredit habis' });
		expect(d).toMatchObject({ kind: 'analysis', failed: true, note: 'Kredit habis' });
	});
	it('builds a dataset-profile detail for a successful profile_dataset', () => {
		const result = {
			ok: true,
			profile: {
				tables: [
					{
						id: 'profile',
						columns: ['Kolom', 'Tipe', 'Missing', 'Likert'],
						rows: [['X1', 'numeric', 0, '1-5']]
					}
				],
				meta: { n: 120 }
			}
		};
		const d = statsDetailFromResult('profile_dataset', 'c', undefined, result, 'art');
		expect(d).toMatchObject({ kind: 'dataset-profile', artifactId: 'art' });
		if (d?.kind === 'dataset-profile') {
			expect(d.profile.rowCount).toBe(120);
			expect(d.profile.columns[0]).toMatchObject({ name: 'X1', type: 'numeric', likert: '1-5' });
		}
	});
});

describe('statsArgsSummary', () => {
	it('summarizes scalar + latent maps, capping length', () => {
		const s = statsArgsSummary({ method: 'pearson', latents: { X1: ['X1.1', 'X1.2', 'X1.3'] } });
		expect(s).toContain('method: pearson');
		expect(s).toContain('X1: X1.1–X1.3');
	});
	it('returns undefined for empty/unreadable args', () => {
		expect(statsArgsSummary(null)).toBeUndefined();
	});
});

describe('datasetProfileSummary', () => {
	it('returns undefined when the profile table is absent', () => {
		expect(datasetProfileSummary({ tables: [] })).toBeUndefined();
	});
});

describe('statsNextStepsFor', () => {
	it('returns the mapped follow-ups', () => {
		expect(statsNextStepsFor('descriptive').map((x) => x.label)).toEqual(['Uji validitas']);
	});
	it('returns [] for tests with no defined follow-up', () => {
		expect(statsNextStepsFor('custom')).toEqual([]);
		expect(statsNextStepsFor('unknown_test')).toEqual([]);
	});
});
