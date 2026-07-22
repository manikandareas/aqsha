import { toast } from 'svelte-sonner';
import { readableApiErrorMessage } from '$lib/errors/api-error';
import type {
	AcceptProposalResult,
	PendingProposalView,
	TypstCompileError
} from '$lib/features/document/api';
import type { ProposalReviewInteractions } from '$lib/features/document/lib/proposal-review-interactions.svelte';
import type { ComposerMentions } from '$lib/features/threads/state/composer-mentions.svelte';

type ProjectProposalControllerOptions = {
	getProposal: () => PendingProposalView;
	interactions: ProposalReviewInteractions;
	mentions: ComposerMentions;
	selectMode: (mode: 'chat' | 'editor') => void;
	accept: (
		input: { proposalId: string; acceptedHunkIndexes?: number[] },
		handlers: {
			onSuccess: (result: AcceptProposalResult) => void;
			onError: (error: unknown) => void;
		}
	) => void;
	reject: (
		proposalId: string,
		handlers: { onSuccess: () => void; onError: (error: unknown) => void }
	) => void;
	reload: () => void;
	onSettled: () => void;
};

/** Owns proposal review state and accept/reject/resubmit orchestration for the project surface. */
export class ProjectProposalController {
	readonly #options: ProjectProposalControllerOptions;
	#acceptErrors = $state<TypstCompileError[] | null>(null);
	#reviewingId = $state<string | null>(null);

	constructor(options: ProjectProposalControllerOptions) {
		this.#options = options;
	}

	get acceptErrors(): TypstCompileError[] | null {
		return this.#acceptErrors;
	}

	get hunkCount(): number {
		return this.#options.getProposal()?.hunks.length ?? 0;
	}

	get reviewing(): boolean {
		return this.#reviewingId !== null && this.#reviewingId === this.#options.getProposal()?.id;
	}

	syncInteraction(): void {
		const proposal = this.#options.getProposal();
		this.#options.interactions.set(
			proposal
				? { proposalId: proposal.id, hunkCount: proposal.hunks.length, review: this.beginReview }
				: null
		);
	}

	beginReview = (): void => {
		const proposal = this.#options.getProposal();
		if (!proposal) return;
		this.#reviewingId = proposal.id;
		this.#options.selectMode('editor');
	};

	exitReview = (): void => {
		this.#reviewingId = null;
		this.#acceptErrors = null;
	};

	accept = (acceptedHunkIndexes: number[] | undefined): void => {
		const proposal = this.#options.getProposal();
		if (!proposal) return;
		this.#acceptErrors = null;
		this.#options.accept(
			{ proposalId: proposal.id, acceptedHunkIndexes },
			{
				onSuccess: (result) => {
					if (result.status === 'accepted') {
						this.#options.interactions.set(null);
						toast.success('Suntingan diterapkan.');
						this.exitReview();
						this.#options.reload();
					} else if (result.status === 'compile_error') {
						this.#acceptErrors = result.compileErrors;
						toast.warning('Hasil pilihan hunk gagal compile. Ubah pilihan atau tolak.');
					} else {
						toast.warning('Sumber sudah berubah — usulan dibatalkan. Minta Astra menyusun ulang.');
					}
				},
				onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menerapkan usulan.'))
			}
		);
	};

	reject = (): void => {
		const proposal = this.#options.getProposal();
		if (!proposal) return;
		this.#acceptErrors = null;
		this.#options.reject(proposal.id, {
			onSuccess: () => {
				this.#options.interactions.set(null);
				this.exitReview();
			},
			onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menolak usulan.'))
		});
	};

	resubmit = (): void => {
		const proposal = this.#options.getProposal();
		if (!proposal) return;
		this.#options.reject(proposal.id, {
			onSuccess: () => {
				this.#options.interactions.set(null);
				this.exitReview();
				this.#options.mentions.setComposerDraft(proposal.resubmitInstruction || proposal.summary);
				this.#options.selectMode('chat');
			},
			onError: (error) =>
				toast.error(readableApiErrorMessage(error, 'Gagal menyiapkan usulan ulang.'))
		});
	};

	agentSettled = (): void => {
		this.#acceptErrors = null;
		this.#options.onSettled();
	};
}
