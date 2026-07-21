import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ComposerSuggestionList from './ComposerSuggestionList.svelte';

it('shows four academic suggestions and forwards the selected prompt', async () => {
	const onSelectSuggestion = vi.fn();
	render(ComposerSuggestionList, { landing: true, onSelectSuggestion });

	const sourceSuggestion = page.getByRole('button', {
		name: 'Gunakan suggestion: Cari sumber akademik'
	});
	const outlineSuggestion = page.getByRole('button', {
		name: 'Gunakan suggestion: Buat outline tulisan'
	});

	await expect.element(sourceSuggestion).toBeVisible();
	await expect.element(outlineSuggestion).toBeVisible();
	await sourceSuggestion.click();

	expect(onSelectSuggestion).toHaveBeenCalledWith(
		'Cari sumber akademik terbaru tentang dampak AI pada pembelajaran mandiri.'
	);
});
