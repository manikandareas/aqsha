import { describe, expect, it, vi } from 'vitest';
import { EMPTY_ANSWERS, type OnboardingAnswers, type OnboardingStep } from './onboarding-machine';
import { journeyActionsOf, journeyModelOf, type JourneySession } from './journey-driver';

function sessionStub(init: {
	step?: OnboardingStep;
	answers?: OnboardingAnswers;
	isSubmitting?: boolean;
}): JourneySession & { steps: OnboardingStep[] } {
	let step = init.step ?? ('welcome' as OnboardingStep);
	let answers = init.answers ?? { ...EMPTY_ANSWERS };
	const steps: OnboardingStep[] = [];
	return {
		steps,
		get step() {
			return step;
		},
		setStep(next) {
			step = next;
			steps.push(next);
		},
		get answers() {
			return answers;
		},
		setBackground(id) {
			answers = { ...answers, background: id };
		},
		toggleInterest() {},
		setSource() {},
		setSourceOther() {},
		get isSubmitting() {
			return init.isSubmitting ?? false;
		},
		get errorMessage() {
			return null;
		}
	};
}

describe('journey driver', () => {
	it('builds a view model from the session', () => {
		const session = sessionStub({
			step: 'background',
			answers: { ...EMPTY_ANSWERS, background: 'dosen' }
		});
		expect(journeyModelOf(session)).toEqual({
			step: 'background',
			answers: session.answers,
			isSubmitting: false,
			errorMessage: null,
			canPrimary: true
		});
	});

	it('advances on primary and only calls onSubmit at finish', async () => {
		const session = sessionStub({
			step: 'source',
			answers: {
				...EMPTY_ANSWERS,
				background: 'dosen',
				interests: ['a', 'b', 'c'],
				source: 'teman'
			}
		});
		const onSubmit = vi.fn();
		const actions = journeyActionsOf(session, onSubmit);

		actions.primary();
		expect(session.steps).toEqual(['finish']);
		expect(onSubmit).not.toHaveBeenCalled();

		actions.primary();
		await Promise.resolve();
		expect(onSubmit).toHaveBeenCalledOnce();
	});

	it('ignores primary when the current step is invalid', async () => {
		const session = sessionStub({ step: 'source' });
		const onSubmit = vi.fn();
		journeyActionsOf(session, onSubmit).primary();
		await Promise.resolve();
		expect(session.steps).toEqual([]);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('ignores primary while submitting', async () => {
		const session = sessionStub({
			step: 'finish',
			answers: {
				...EMPTY_ANSWERS,
				background: 'dosen',
				interests: ['a', 'b', 'c'],
				source: 'teman'
			},
			isSubmitting: true
		});
		const onSubmit = vi.fn();
		journeyActionsOf(session, onSubmit).primary();
		await Promise.resolve();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('backs via backStep', () => {
		const session = sessionStub({ step: 'interests' });
		journeyActionsOf(session, vi.fn()).back();
		expect(session.steps).toEqual(['background']);
	});
});
