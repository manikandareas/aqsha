import { toast } from 'svelte-sonner';
import { readableApiErrorMessage } from '$lib/errors/api-error';
import type {
	AcceptProposalResult,
	DecideHunkResult,
	PendingProposalView,
	ProposalHunk
} from '$lib/features/document/api';
import { proposalHunkLabel } from '$lib/features/document/lib/proposal-hunk-label';
import type { ProposalDiffState } from '$lib/features/document/lib/proposal-diff-extension';
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
	decideHunk: (
		input: { proposalId: string; hunkIndex: number; decision: 'accept' | 'reject' },
		handlers: { onSuccess: (result: DecideHunkResult) => void; onError: (error: unknown) => void }
	) => void;
	reload: () => void;
	onSettled: () => void;
};

/** Owns per-hunk proposal decisions and the bulk accept/reject/resubmit paths for the project surface. */
export class ProjectProposalController {
	readonly #options: ProjectProposalControllerOptions;
	#busyIndex = $state<number | null>(null);
	#hunkErrors = $state<Record<number, string[]>>({});

	constructor(options: ProjectProposalControllerOptions) {
		this.#options = options;
	}

	get remainingHunks(): ProposalHunk[] {
		return this.#options.getProposal()?.remainingHunks ?? [];
	}

	/** Badge on the Editor toggle counts what is still open, not the proposal's original size. */
	get hunkCount(): number {
		return this.remainingHunks.length;
	}

	get diffState(): ProposalDiffState | null {
		const proposal = this.#options.getProposal();
		if (!proposal || proposal.isStale || proposal.remainingHunks.length === 0) return null;
		return {
			hunks: proposal.remainingHunks,
			labelFor: (hunk) => proposalHunkLabel(proposal.currentSource, hunk),
			busyIndex: this.#busyIndex,
			errors: this.#hunkErrors,
			onDecide: this.decide
		};
	}

	syncInteraction(): void {
		const proposal = this.#options.getProposal();
		this.#options.interactions.set(
			proposal
				? {
						proposalId: proposal.id,
						hunkCount: proposal.remainingHunks.length,
						review: this.openEditor
					}
				: null
		);
	}

	openEditor = (): void => {
		this.#options.selectMode('editor');
	};

	decide = (hunkIndex: number, decision: 'accept' | 'reject'): void => {
		const proposal = this.#options.getProposal();
		if (!proposal || this.#busyIndex !== null) return;
		this.#busyIndex = hunkIndex;
		this.#options.decideHunk(
			{ proposalId: proposal.id, hunkIndex, decision },
			{
				onSuccess: (result) => {
					this.#busyIndex = null;
					if (result.status === 'compile_error') {
						// Urutan penerimaan bisa berarti: hunk ini tetap terbuka sampai gabungannya sah.
						this.#hunkErrors = {
							...this.#hunkErrors,
							[hunkIndex]: result.compileErrors.map((e) =>
								e.line > 0 ? `baris ${e.line}: ${e.message}` : e.message
							)
						};
						return;
					}
					this.#hunkErrors = {};
					if (result.status === 'stale') {
						toast.warning('Sumber sudah berubah — usulan dibatalkan. Minta Astra menyusun ulang.');
					} else if (result.closed) {
						toast.success('Seluruh usulan sudah diputuskan.');
					}
					this.#options.reload();
					this.#options.onSettled();
				},
				onError: (error) => {
					this.#busyIndex = null;
					toast.error(readableApiErrorMessage(error, 'Gagal menyimpan keputusan.'));
				}
			}
		);
	};

	/** Bulk accept of everything still open — the same server path as a per-hunk accept run to the end. */
	acceptRest = (): void => {
		const proposal = this.#options.getProposal();
		if (!proposal || this.#busyIndex !== null) return;
		this.#hunkErrors = {};
		this.#options.accept(
			{ proposalId: proposal.id },
			{
				onSuccess: (result) => {
					if (result.status === 'accepted') {
						this.#options.interactions.set(null);
						toast.success('Suntingan diterapkan.');
						this.#options.reload();
						this.#options.onSettled();
					} else if (result.status === 'compile_error') {
						toast.warning('Sisa usulan gagal compile. Putuskan per bagian atau tolak sisanya.');
					} else {
						toast.warning('Sumber sudah berubah — usulan dibatalkan. Minta Astra menyusun ulang.');
					}
				},
				onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menerapkan usulan.'))
			}
		);
	};

	rejectRest = (): void => {
		const proposal = this.#options.getProposal();
		if (!proposal) return;
		this.#hunkErrors = {};
		this.#options.reject(proposal.id, {
			onSuccess: () => {
				this.#options.interactions.set(null);
				this.#options.reload();
				this.#options.onSettled();
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
				this.#hunkErrors = {};
				this.#options.mentions.setComposerDraft(proposal.resubmitInstruction || proposal.summary);
				this.#options.selectMode('chat');
			},
			onError: (error) =>
				toast.error(readableApiErrorMessage(error, 'Gagal menyiapkan usulan ulang.'))
		});
	};

	agentSettled = (): void => {
		this.#hunkErrors = {};
		this.#options.onSettled();
	};
}
