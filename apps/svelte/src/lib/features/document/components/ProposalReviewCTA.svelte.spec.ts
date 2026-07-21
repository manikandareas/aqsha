import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ProposalReviewCTA from './ProposalReviewCTA.svelte';
import {
	ProposalReviewInteractions,
	setProposalReviewInteractions
} from '../lib/proposal-review-interactions.svelte';

describe('ProposalReviewCTA', () => {
	it('opens only its matching pending proposal', async () => {
		const review = vi.fn();
		const interactions = new ProposalReviewInteractions();
		interactions.set({ proposalId: 'proposal-1', hunkCount: 2, review });

		function WithInteractions(...args: Parameters<typeof ProposalReviewCTA>) {
			setProposalReviewInteractions(interactions);
			return ProposalReviewCTA(...args);
		}

		render(WithInteractions, { proposalId: 'proposal-1', summary: 'Perbaiki dua bagian' });

		await page.getByRole('button', { name: 'Tinjau usulan (2)' }).click();
		expect(review).toHaveBeenCalledOnce();

		interactions.set({ proposalId: 'proposal-2', hunkCount: 1, review });
		await expect.element(page.getByText('Usulan suntingan siap ditinjau')).not.toBeInTheDocument();
	});
});
