import { describe, expect, it } from 'vitest';
import type { OnboardingAnswers } from './onboarding-machine';
import { buildFinishReflection, FEYNMAN_QUOTE, ONBOARDING_COPY } from './onboarding-content';

const answers = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
	background: 'mahasiswa_s1',
	interests: ['ai_cs', 'pendidikan', 'psikologi'],
	source: 'teman',
	sourceOther: '',
	...over
});

describe('onboarding journey content', () => {
	it('keeps the verified English Feynman quote and approved product claims', () => {
		expect(FEYNMAN_QUOTE).toEqual({
			text: 'The first principle is that you must not fool yourself—and you are the easiest person to fool.',
			attribution: 'Richard Feynman',
			sourceUrl: 'https://magazine.caltech.edu/post/feynman-at-100',
			interpretation:
				'Sesuatu yang terdengar meyakinkan belum tentu benar. Aqsha membantu mencari dan memeriksa; kamu tetap menentukan apa yang layak dipercaya.'
		});
		expect(ONBOARDING_COPY.interests.description).toContain('sekitar 320 juta karya ilmiah');
		expect(ONBOARDING_COPY.interests.description).not.toContain('akses penuh');
	});

	it('maps background and up to three interests to human labels', () => {
		expect(buildFinishReflection(answers())).toEqual({
			backgroundLabel: 'Mahasiswa S1',
			visibleInterestLabels: ['Kecerdasan buatan & ilmu komputer', 'Pendidikan', 'Psikologi'],
			remainingInterestCount: 0,
			interestSummary: 'Kecerdasan buatan & ilmu komputer, Pendidikan, dan Psikologi'
		});
	});

	it('summarizes interests after the first three labels', () => {
		const reflection = buildFinishReflection(
			answers({
				interests: ['ai_cs', 'pendidikan', 'psikologi', 'hukum', 'fisika']
			})
		);
		expect(reflection.visibleInterestLabels).toHaveLength(3);
		expect(reflection.remainingInterestCount).toBe(2);
		expect(reflection.interestSummary).toBe(
			'Kecerdasan buatan & ilmu komputer, Pendidikan, Psikologi, dan 2 bidang lain'
		);
	});

	it('omits unknown background and ignores unknown interests without crashing', () => {
		expect(
			buildFinishReflection(
				answers({
					background: 'unknown',
					interests: ['unknown-a', 'unknown-b', 'unknown-c']
				})
			)
		).toEqual({
			backgroundLabel: null,
			visibleInterestLabels: [],
			remainingInterestCount: 0,
			interestSummary: 'bidang yang kamu pilih'
		});
	});
});
