import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import WelcomeStep from './WelcomeStep.svelte';
import BackgroundStep from './BackgroundStep.svelte';
import InterestsStep from './InterestsStep.svelte';
import SourceStep from './SourceStep.svelte';

describe('onboarding journey steps', () => {
	it('opens with the English Feynman quote and Indonesian interpretation', async () => {
		const { container } = render(WelcomeStep);
		await expect
			.element(
				page.getByRole('heading', {
					level: 1,
					name: 'Kamu lagi nulis apa?'
				})
			)
			.toBeInTheDocument();
		expect(container.querySelector('blockquote')?.textContent).toContain(
			'The first principle is that you must not fool yourself'
		);
		expect(container.textContent).toContain('Sesuatu yang terdengar meyakinkan belum tentu benar');
	});

	it('frames background as the user starting point and preserves selection semantics', async () => {
		render(BackgroundStep, { value: 'mahasiswa_s1', onselect: vi.fn() });
		await expect
			.element(page.getByText('Setiap perjalanan research punya titik berangkat yang berbeda.'))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Mahasiswa S1' }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('states the bounded OpenAlex catalog claim and minimum selection count', async () => {
		render(InterestsStep, {
			value: ['ai_cs', 'pendidikan', 'psikologi'],
			ontoggle: vi.fn()
		});
		await expect.element(page.getByText(/sekitar 320 juta karya ilmiah/)).toBeInTheDocument();
		await expect.element(page.getByText('3 dipilih')).toBeInTheDocument();
	});

	it('keeps the attribution question direct and renders every source option', async () => {
		render(SourceStep, {
			value: null,
			other: '',
			onselect: vi.fn(),
			onotherchange: vi.fn()
		});
		await expect
			.element(
				page.getByRole('heading', {
					level: 1,
					name: 'Dari mana kamu menemukan Aqsha?'
				})
			)
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Lainnya' })).toBeInTheDocument();
	});
});
