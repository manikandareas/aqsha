import { createContext } from '$lib/context';

export type ProposalReviewInteraction = {
	proposalId: string;
	hunkCount: number;
	review: () => void;
};

export class ProposalReviewInteractions {
	#current = $state<ProposalReviewInteraction | null>(null);

	get current(): ProposalReviewInteraction | null {
		return this.#current;
	}

	set(current: ProposalReviewInteraction | null): void {
		this.#current = current;
	}
}

const context = createContext<ProposalReviewInteractions>('proposal-review-interactions');

export const setProposalReviewInteractions = (value: ProposalReviewInteractions): ProposalReviewInteractions =>
	context.set(value);

export const getProposalReviewInteractions = (): ProposalReviewInteractions =>
	context.getOptional() ?? new ProposalReviewInteractions();
