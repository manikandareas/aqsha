import { describe, expect, it } from 'vitest';
import { MIN_INTERESTS, SOURCE_OTHER } from './onboarding-options';
import {
	ADVANCE_TARGET,
	BACK_TARGET,
	buildCompletePayload,
	EMPTY_ANSWERS,
	isQuestionStep,
	isStepValid,
	type OnboardingAnswers,
	PRIMARY_LABEL,
	questionIndexOf,
	QUESTION_STEPS,
	toggleInterest
} from './onboarding-machine';

const answers = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
	...EMPTY_ANSWERS,
	...over
});

describe('onboarding step machine — question steps + progress', () => {
	it('QUESTION_STEPS = background/interests/source in order', () => {
		expect(QUESTION_STEPS).toEqual(['background', 'interests', 'source']);
	});

	it('questionIndexOf → 0-based index, -1 for welcome/finish', () => {
		expect(questionIndexOf('background')).toBe(0);
		expect(questionIndexOf('interests')).toBe(1);
		expect(questionIndexOf('source')).toBe(2);
		expect(questionIndexOf('welcome')).toBe(-1);
		expect(questionIndexOf('finish')).toBe(-1);
	});

	it('isQuestionStep only for the three question steps', () => {
		expect(isQuestionStep('welcome')).toBe(false);
		expect(isQuestionStep('background')).toBe(true);
		expect(isQuestionStep('finish')).toBe(false);
	});
});

describe('onboarding transitions', () => {
	it('ADVANCE_TARGET chains welcome→background→interests→source', () => {
		expect(ADVANCE_TARGET.welcome).toBe('background');
		expect(ADVANCE_TARGET.background).toBe('interests');
		expect(ADVANCE_TARGET.interests).toBe('source');
		// source advances via submit, not ADVANCE_TARGET
		expect(ADVANCE_TARGET.source).toBeUndefined();
	});

	it('BACK_TARGET mirrors the forward chain in reverse', () => {
		expect(BACK_TARGET.background).toBe('welcome');
		expect(BACK_TARGET.interests).toBe('background');
		expect(BACK_TARGET.source).toBe('interests');
		expect(BACK_TARGET.welcome).toBeUndefined();
		expect(BACK_TARGET.finish).toBeUndefined();
	});

	it('primary labels match web copy', () => {
		expect(PRIMARY_LABEL.welcome).toBe('Mulai');
		expect(PRIMARY_LABEL.source).toBe('Selesai');
		expect(PRIMARY_LABEL.finish).toBe('Mulai jelajah');
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

	it('omits heardAboutOther unless source is "lainnya"', () => {
		expect(
			buildCompletePayload(
				answers({ background: 'dosen', source: 'teman', interests: ['a'], sourceOther: 'x' })
			)
		).toEqual({
			background: 'dosen',
			interests: ['a'],
			heardAboutSource: 'teman',
			heardAboutOther: undefined
		});
	});

	it('trims heardAboutOther for source = "lainnya"', () => {
		expect(
			buildCompletePayload(
				answers({ background: 'dosen', source: SOURCE_OTHER.id, sourceOther: '  seminar  ' })
			)
		).toEqual({
			background: 'dosen',
			interests: [],
			heardAboutSource: SOURCE_OTHER.id,
			heardAboutOther: 'seminar'
		});
	});
});
