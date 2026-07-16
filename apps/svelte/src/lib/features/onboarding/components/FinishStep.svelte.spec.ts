import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { OnboardingAnswers } from '../lib/onboarding-machine';
import FinishStep from './FinishStep.svelte';

const answers: OnboardingAnswers = {
	background: 'mahasiswa_s1',
	interests: ['ai_cs', 'pendidikan', 'psikologi', 'hukum'],
	source: 'teman',
	sourceOther: ''
};

describe('FinishStep', () => {
	it('reflects background and selected interest labels without raw ids', async () => {
		const { container } = render(FinishStep, { answers });
		await expect
			.element(
				page.getByRole('heading', {
					level: 1,
					name: 'Rasa penasaranmu sekarang punya arah.'
				})
			)
			.toBeInTheDocument();
		expect(container.textContent).toContain('Mahasiswa S1');
		expect(container.textContent).toContain('Kecerdasan buatan & ilmu komputer');
		expect(container.textContent).toContain('Pendidikan');
		expect(container.textContent).toContain('Psikologi');
		expect(container.textContent).toContain('+1 bidang lain');
		expect(container.textContent).not.toContain('mahasiswa_s1');
		expect(container.textContent).not.toContain('ai_cs');
	});

	it('omits the starting-point milestone when no display label exists', () => {
		const { container } = render(FinishStep, {
			answers: { ...answers, background: 'unknown' }
		});
		expect(container.textContent).not.toContain('unknown');
		expect(container.textContent).toContain('Kecerdasan buatan & ilmu komputer');
	});
});
