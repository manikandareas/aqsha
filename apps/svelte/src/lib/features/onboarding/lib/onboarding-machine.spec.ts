import { describe, expect, it } from 'vitest';
import { MIN_INTERESTS, SOURCE_OTHER } from './onboarding-options';
import {
	advanceStep,
	backStep,
	buildCompletePayload,
	canPrimary,
	EMPTY_ANSWERS,
	HOME_AFTER_ONBOARDING,
	isAnswersComplete,
	isQuestionStep,
	isStepValid,
	type OnboardingAnswers,
	PRIMARY_LABEL,
	primaryIntent,
	toggleInterest
} from './onboarding-machine';

const answers = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
	...EMPTY_ANSWERS,
	...over
});

const completeAnswers = (): OnboardingAnswers =>
	answers({
		background: 'dosen',
		interests: ['a', 'b', 'c'],
		source: 'teman'
	});

describe('onboarding step machine — question steps', () => {
	it('isQuestionStep only for steps that require a valid answer', () => {
		expect(isQuestionStep('welcome')).toBe(false);
		expect(isQuestionStep('background')).toBe(true);
		expect(isQuestionStep('interests')).toBe(true);
		expect(isQuestionStep('source')).toBe(true);
		expect(isQuestionStep('finish')).toBe(false);
	});
});

describe('onboarding transitions', () => {
	it('advanceStep chains welcome→background→interests→source→finish', () => {
		expect(advanceStep('welcome')).toBe('background');
		expect(advanceStep('background')).toBe('interests');
		expect(advanceStep('interests')).toBe('source');
		expect(advanceStep('source')).toBe('finish');
		expect(advanceStep('finish')).toBeUndefined();
	});

	it('backStep mirrors the forward chain in reverse', () => {
		expect(backStep('background')).toBe('welcome');
		expect(backStep('interests')).toBe('background');
		expect(backStep('source')).toBe('interests');
		expect(backStep('finish')).toBe('source');
		expect(backStep('welcome')).toBeUndefined();
	});

	it('primaryIntent advances every step and submits only on finish', () => {
		expect(primaryIntent('welcome')).toEqual({ type: 'advance', step: 'background' });
		expect(primaryIntent('background')).toEqual({ type: 'advance', step: 'interests' });
		expect(primaryIntent('interests')).toEqual({ type: 'advance', step: 'source' });
		expect(primaryIntent('source')).toEqual({ type: 'advance', step: 'finish' });
		expect(primaryIntent('finish')).toEqual({ type: 'submit' });
	});

	it('uses the approved onboarding destination and journey CTAs', () => {
		expect(HOME_AFTER_ONBOARDING).toBe('/app');
		expect(PRIMARY_LABEL.welcome).toBe('Mulai dari satu ide');
		expect(PRIMARY_LABEL.source).toBe('Lanjut');
		expect(PRIMARY_LABEL.finish).toBe('Mulai research');
	});
});

describe('isAnswersComplete', () => {
	it('requires every question step to be valid', () => {
		expect(isAnswersComplete(EMPTY_ANSWERS)).toBe(false);
		expect(isAnswersComplete(answers({ background: 'dosen' }))).toBe(false);
		expect(
			isAnswersComplete(answers({ background: 'dosen', interests: ['a', 'b', 'c'] }))
		).toBe(false);
		expect(isAnswersComplete(completeAnswers())).toBe(true);
		expect(
			isAnswersComplete(
				answers({
					background: 'dosen',
					interests: ['a', 'b', 'c'],
					source: SOURCE_OTHER.id,
					sourceOther: 'seminar'
				})
			)
		).toBe(true);
	});
});

describe('canPrimary', () => {
	it('blocks while submitting and when the current question is invalid', () => {
		expect(canPrimary('welcome', EMPTY_ANSWERS, false)).toBe(true);
		expect(canPrimary('welcome', EMPTY_ANSWERS, true)).toBe(false);
		expect(canPrimary('background', EMPTY_ANSWERS, false)).toBe(false);
		expect(canPrimary('background', answers({ background: 'mahasiswa_s1' }), false)).toBe(true);
	});

	it('finish requires complete answers even though it is not a question step', () => {
		expect(canPrimary('finish', EMPTY_ANSWERS, false)).toBe(false);
		expect(canPrimary('finish', completeAnswers(), false)).toBe(true);
	});
});

describe('isStepValid', () => {
	it('non-question steps are always valid', () => {
		expect(isStepValid('welcome', EMPTY_ANSWERS)).toBe(true);
		expect(isStepValid('finish', EMPTY_ANSWERS)).toBe(true);
	});

	it('background requires a selection', () => {
		expect(isStepValid('background', answers())).toBe(false);
		expect(isStepValid('background', answers({ background: 'mahasiswa_s1' }))).toBe(true);
	});

	it(`interests requires at least ${MIN_INTERESTS}`, () => {
		expect(isStepValid('interests', answers({ interests: ['a', 'b'] }))).toBe(false);
		expect(isStepValid('interests', answers({ interests: ['a', 'b', 'c'] }))).toBe(true);
	});

	it('source requires a selection; "lainnya" requires non-empty free text', () => {
		expect(isStepValid('source', answers())).toBe(false);
		expect(isStepValid('source', answers({ source: 'teman' }))).toBe(true);
		expect(isStepValid('source', answers({ source: SOURCE_OTHER.id, sourceOther: '  ' }))).toBe(
			false
		);
		expect(
			isStepValid('source', answers({ source: SOURCE_OTHER.id, sourceOther: 'seminar' }))
		).toBe(true);
	});
});

describe('toggleInterest', () => {
	it('adds then removes an id, preserving others', () => {
		expect(toggleInterest([], 'a')).toEqual(['a']);
		expect(toggleInterest(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
		expect(toggleInterest(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
	});
});

describe('buildCompletePayload', () => {
	it('returns null when required single-selects are missing', () => {
		expect(buildCompletePayload(answers({ background: null, source: 'teman' }))).toBeNull();
		expect(buildCompletePayload(answers({ background: 'dosen', source: null }))).toBeNull();
	});

	it('returns null when interests are below MIN_INTERESTS', () => {
		expect(
			buildCompletePayload(
				answers({ background: 'dosen', source: 'teman', interests: ['a', 'b'] })
			)
		).toBeNull();
	});

	it('returns null when source is "lainnya" without free text', () => {
		expect(
			buildCompletePayload(
				answers({
					background: 'dosen',
					interests: ['a', 'b', 'c'],
					source: SOURCE_OTHER.id,
					sourceOther: '  '
				})
			)
		).toBeNull();
	});

	it('omits heardAboutOther unless source is "lainnya"', () => {
		expect(
			buildCompletePayload(
				answers({
					background: 'dosen',
					source: 'teman',
					interests: ['a', 'b', 'c'],
					sourceOther: 'x'
				})
			)
		).toEqual({
			background: 'dosen',
			interests: ['a', 'b', 'c'],
			heardAboutSource: 'teman',
			heardAboutOther: undefined
		});
	});

	it('trims heardAboutOther for source = "lainnya"', () => {
		expect(
			buildCompletePayload(
				answers({
					background: 'dosen',
					source: SOURCE_OTHER.id,
					interests: ['a', 'b', 'c'],
					sourceOther: '  seminar  '
				})
			)
		).toEqual({
			background: 'dosen',
			interests: ['a', 'b', 'c'],
			heardAboutSource: SOURCE_OTHER.id,
			heardAboutOther: 'seminar'
		});
	});
});
