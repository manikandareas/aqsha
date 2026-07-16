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
		const session = sessionStub({ step: 'source' });
		const onSubmit = vi.fn();
		const actions = journeyActionsOf(session, onSubmit);

		actions.primary();
		expect(session.steps).toEqual(['finish']);
		expect(onSubmit).not.toHaveBeenCalled();

		actions.primary();
		await Promise.resolve();
		expect(onSubmit).toHaveBeenCalledOnce();
	});

	it('backs via BACK_TARGET', () => {
		const session = sessionStub({ step: 'interests' });
		journeyActionsOf(session, vi.fn()).back();
		expect(session.steps).toEqual(['background']);
	});
});
