import { normalizeAskQuestions } from '@aqsha/chat-core';
import type { MastraClient } from '@mastra/client-js';
import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query';
import {
	activeHeavyDeepStep,
	DANGLING_TURN_ERROR,
	DEEP_HEAVY_STALL_MS,
	DEEP_HEAVY_STEP_MESSAGE,
	DEEP_STALL_MESSAGE,
	DEEP_STALL_MS,
	discoverDeepRunId,
	getDeepRunId,
	setDeepRunId,
	type DeepRun,
	type DeepRunSnapshot,
	type WorkflowStepsSnapshot
} from '../lib/deep-workflow';
import type { WorkflowClient } from '../lib/mastra-thread-client';
import {
	seedWorkflowProgress,
	settleAssistantTurn,
	settleWorkflowTurn,
	type MastraTimelineState
} from '../lib/mastra-timeline';
import type { TimelineMessage } from '../lib/timeline-types';

type PollToken = { cancelled: boolean };

type DeepRunControllerOptions = {
	threadId: string;
	getResourceId: () => string | null | undefined;
	getClient: () => MastraClient;
	getMessages: () => readonly TimelineMessage[];
	getStatus: () => MastraTimelineState['status'];
	getRun: () => DeepRun | null;
	setRun: (run: DeepRun | null) => void;
	setStalled: (message: string | null) => void;
	workflow: () => WorkflowClient;
	fetchRun: (runId: string) => Promise<DeepRunSnapshot | null>;
	apply: (update: (state: MastraTimelineState) => MastraTimelineState) => void;
	applyTerminal: (
		runId: string,
		status: string,
		steps: WorkflowStepsSnapshot,
		result?: unknown
	) => void;
	queryClient: QueryClient;
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Re-attaches detached `/deep` runs and projects their durable snapshot back into the timeline. */
export class DeepRunController {
	readonly #options: DeepRunControllerOptions;
	#token: PollToken | null = null;

	constructor(options: DeepRunControllerOptions) {
		this.#options = options;
	}

	destroy(): void {
		if (this.#token) this.#token.cancelled = true;
		this.#token = null;
	}

	schedule(): void {
		this.destroy();
		const token: PollToken = { cancelled: false };
		this.#token = token;
		void this.#poll(token);
	}

	async #poll(token: PollToken): Promise<void> {
		const resourceId = this.#options.getResourceId();
		if (!resourceId) return;
		let runId = getDeepRunId(this.#options.threadId);
		if (!runId) {
			const messages = this.#options.getMessages();
			const last = messages[messages.length - 1];
			if (!last || last.role !== 'user') return;
			runId = await discoverDeepRunId(
				this.#options.getClient(),
				this.#options.threadId,
				resourceId
			);
			if (token.cancelled) return;
			if (!runId) {
				setTimeout(() => {
					if (token.cancelled) return;
					const current = this.#options.getMessages();
					const tail = current[current.length - 1];
					if (this.#options.getStatus() !== 'ready' || !tail || tail.role !== 'user') return;
					this.#options.apply((state) =>
						state.status === 'ready' && !state.error
							? { ...state, error: DANGLING_TURN_ERROR }
							: state
					);
				}, 5000);
				return;
			}
			setDeepRunId(this.#options.threadId, runId);
		}

		this.#options.apply((state) => {
			if (state.status !== 'ready') return state;
			const last = state.messages[state.messages.length - 1];
			return last?.role === 'user' ? { ...state, status: 'submitted' } : state;
		});

		const durableRunId = runId;
		const workflow = this.#options.workflow();
		let errors = 0;
		let sourcesSeeded = false;
		let sourcesRefreshed = false;
		let progressSignature = '';
		let progressAt = Date.now();

		while (!token.cancelled) {
			const snapshot = await this.#options.fetchRun(durableRunId);
			if (token.cancelled) return;
			if (!snapshot) {
				errors += 1;
				if (errors >= 8) {
					this.#options.apply((state) => settleAssistantTurn(state));
					return;
				}
				await delay(2500);
				continue;
			}

			errors = 0;
			const status = snapshot.status;
			const steps = snapshot.steps ?? {};
			if (status === 'suspended') {
				this.#options.setStalled(null);
				if (this.#options.getRun() === null) {
					this.#options.setRun(await workflow.createRun({ runId: durableRunId, resourceId }));
				}
				const clarify = steps['clarify'];
				if (clarify?.status === 'suspended' && clarify.suspendPayload) {
					const questions = normalizeAskQuestions(clarify.suspendPayload.questions);
					if (questions.length === 0) {
						this.#options.apply((state) =>
							settleWorkflowTurn(seedWorkflowProgress(state, durableRunId, steps), durableRunId)
						);
						return;
					}
					const findings = clarify.suspendPayload.findings;
					this.#options.apply((state) => ({
						...seedWorkflowProgress(state, durableRunId, steps),
						askGate: {
							source: 'workflow',
							questions,
							...(typeof findings === 'string' && findings ? { findings } : {}),
							runId: durableRunId
						}
					}));
					return;
				}
				const payload = steps['approve-plan']?.suspendPayload ?? {};
				const subQuestions = Array.isArray(payload.subQuestions)
					? payload.subQuestions.filter((value): value is string => typeof value === 'string')
					: [];
				this.#options.apply((state) => ({
					...seedWorkflowProgress(state, durableRunId, steps),
					planGate: {
						plan: typeof payload.plan === 'string' ? payload.plan : '',
						subQuestions
					}
				}));
				return;
			}

			if (status === 'success' || status === 'failed' || status === 'canceled') {
				this.#options.applyTerminal(durableRunId, status, steps, snapshot.result);
				return;
			}
			if (getDeepRunId(this.#options.threadId) !== durableRunId) {
				this.#options.setStalled(null);
				this.#options.apply((state) => settleWorkflowTurn(state, durableRunId));
				return;
			}

			this.#options.apply((state) => seedWorkflowProgress(state, durableRunId, steps));
			const signature = `${status}|${Object.entries(steps)
				.map(([id, step]) => `${id}:${String(step?.status ?? '')}`)
				.sort()
				.join(',')}`;
			if (signature !== progressSignature) {
				progressSignature = signature;
				progressAt = Date.now();
				this.#options.setStalled(null);
			} else if (status === 'running' || status === 'waiting' || status === 'pending') {
				const heavyStep = activeHeavyDeepStep(steps);
				if (Date.now() - progressAt >= (heavyStep ? DEEP_HEAVY_STALL_MS : DEEP_STALL_MS)) {
					this.#options.setStalled(
						(heavyStep && DEEP_HEAVY_STEP_MESSAGE[heavyStep]) || DEEP_STALL_MESSAGE
					);
				}
			}

			if (!sourcesSeeded && steps['search-literature']) {
				sourcesSeeded = true;
				void this.#options.queryClient.invalidateQueries({
					queryKey: queryKeys.threads.sources(this.#options.threadId)
				});
			}
			if (!sourcesRefreshed && steps['search-literature']?.status === 'success') {
				sourcesRefreshed = true;
				void this.#options.queryClient.invalidateQueries({
					queryKey: queryKeys.threads.sources(this.#options.threadId)
				});
			}
			await delay(2500);
		}
	}
}
