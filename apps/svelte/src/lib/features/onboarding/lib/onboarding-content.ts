// Journey copy + finish-reflection model for onboarding. Pure module (no runes) so copy contracts
// and label mapping stay unit-testable; components render from here instead of inlining prose.

import { BACKGROUND_OPTIONS, INTEREST_OPTIONS, MIN_INTERESTS } from './onboarding-options';
import type { OnboardingAnswers, OnboardingStep } from './onboarding-machine';

type JourneyStepCopy = Readonly<{
	title: string;
	description: string;
}>;

type JourneyQuote = Readonly<{
	text: string;
	attribution: string;
}>;

// Quote stays in its original English (1974 Caltech commencement); the interpretation is Aqsha's
// framing, not a translation.
export const FEYNMAN_QUOTE = {
	text: 'The first principle is that you must not fool yourself—and you are the easiest person to fool.',
	attribution: 'Richard Feynman',
	sourceUrl: 'https://magazine.caltech.edu/post/feynman-at-100',
	interpretation:
		'Sesuatu yang terdengar meyakinkan belum tentu benar. Aqsha membantu mencari dan memeriksa; kamu tetap menentukan apa yang layak dipercaya.'
} as const satisfies JourneyQuote & {
	sourceUrl: string;
	interpretation: string;
};

export const EINSTEIN_QUOTE = {
	text: 'Imagination is more important than knowledge.',
	attribution: 'Albert Einstein'
} as const satisfies JourneyQuote;

// The catalog claim must stay "sekitar 320 juta karya ilmiah" — OpenAlex counts scholarly works,
// not universally available full text.
export const ONBOARDING_COPY = {
	welcome: {
		title: 'Kamu nggak harus tahu semuanya untuk mulai.',
		description:
			'Bawa satu ide yang masih mentah. Kita akan mencari pertanyaan, sumber, dan arah berikutnya bersama.'
	},
	background: {
		title: 'Kamu saat ini...',
		description: 'Setiap perjalanan research punya titik berangkat yang berbeda.'
	},
	interests: {
		title: 'Apa yang membuatmu terus penasaran?',
		description: `Pilih minimal ${MIN_INTERESTS}. Di antara sekitar 320 juta karya ilmiah, mari mulai dari hal yang benar-benar berarti buatmu.`
	},
	source: {
		title: 'Dari mana kamu menemukan Aqsha?',
		description: 'Sebelum kita mulai, bantu kami memahami bagaimana perjalananmu sampai ke sini.'
	},
	finish: {
		title: 'Rasa penasaranmu sekarang punya arah.',
		description: 'Aqsha siap membantu mencari dan memeriksa; keputusan akhirnya tetap milikmu.'
	}
} satisfies Record<OnboardingStep, JourneyStepCopy>;

/** Decorative hand-written margin note per step (JourneyOrnaments). */
export const STEP_HAND_NOTE: Record<OnboardingStep, string> = {
	welcome: 'mulai dari ide mentah',
	background: 'tandai titik berangkatmu',
	interests: 'nyalakan bintangmu',
	source: 'salam kenal!',
	finish: 'perjalananmu dimulai'
};

/** Chapter accent tokens inked onto margin doodles via --journey-accent / --journey-accent-ink. */
export const STEP_ACCENT: Record<OnboardingStep, { accent: string; ink: string }> = {
	welcome: { accent: 'var(--lemon)', ink: 'var(--lemon-foreground)' },
	background: { accent: 'var(--coral)', ink: 'var(--coral-foreground)' },
	interests: { accent: 'var(--mint)', ink: 'var(--mint-foreground)' },
	source: { accent: 'var(--lavender)', ink: 'var(--lavender-foreground)' },
	finish: { accent: 'var(--mint)', ink: 'var(--mint-foreground)' }
};

export type FinishReflection = Readonly<{
	backgroundLabel: string | null;
	visibleInterestLabels: string[];
	remainingInterestCount: number;
}>;

const labelById = (options: ReadonlyArray<{ id: string; label: string }>, id: string | null) =>
	id ? (options.find((option) => option.id === id)?.label ?? null) : null;

/**
 * Reflect explicit answers back as human labels: at most three interests named, the rest counted.
 * Unknown IDs are dropped rather than rendered raw, so a stale option list can never leak IDs.
 */
export function buildFinishReflection(answers: OnboardingAnswers): FinishReflection {
	const interestLabels = answers.interests
		.map((id) => labelById(INTEREST_OPTIONS, id))
		.filter((label): label is string => label !== null);
	const visibleInterestLabels = interestLabels.slice(0, 3);
	const remainingInterestCount = Math.max(0, interestLabels.length - visibleInterestLabels.length);

	return {
		backgroundLabel: labelById(BACKGROUND_OPTIONS, answers.background),
		visibleInterestLabels,
		remainingInterestCount
	};
}
