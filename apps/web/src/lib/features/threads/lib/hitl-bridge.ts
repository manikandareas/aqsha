import type { AgentKind, AskQuestionsResumeData } from '@aqsha/chat-core';
import { readableApiErrorMessage } from '$lib/errors';
import type { ThreadAgentClient } from './mastra-thread-client';
import {
	settleAssistantTurn,
	type MastraAskGate,
	type MastraTimelineState
} from './mastra-timeline';

type HitlBridgeOptions = {
	threadId: string;
	getResourceId: () => string | null | undefined;
	getAgentKind: () => AgentKind;
	getAgent: (kind: AgentKind) => ThreadAgentClient;
	apply: (update: (state: MastraTimelineState) => MastraTimelineState) => void;
};

/** Bridges tool approval and chat clarification gates to the narrow Mastra transport. */
export class HitlBridge {
	readonly #options: HitlBridgeOptions;

	constructor(options: HitlBridgeOptions) {
		this.#options = options;
	}

	async respond(toolCallId: string, approved: boolean): Promise<void> {
		const resourceId = this.#options.getResourceId();
		if (!resourceId) return;
		this.#options.apply((state) => ({
			...state,
			approvals: state.approvals.filter((approval) => approval.toolCallId !== toolCallId)
		}));
		try {
			await this.#agent().sendToolApproval({
				resourceId,
				threadId: this.#options.threadId,
				toolCallId,
				approved
			});
		} catch (error) {
			this.#options.apply((state) => ({
				...state,
				error: readableApiErrorMessage(error, 'Gagal memproses persetujuan.')
			}));
		}
	}

	async resolveChatAsk(gate: MastraAskGate, resume: AskQuestionsResumeData): Promise<void> {
		const resourceId = this.#options.getResourceId();
		if (!resourceId || !gate.toolCallId) {
			this.#options.apply((state) => ({
				...settleAssistantTurn(state),
				error:
					'Gagal mengirim jawaban klarifikasi (sesi tidak lengkap). Coba mulai ulang pertanyaanmu.'
			}));
			return;
		}
		try {
			await this.#agent().sendToolApproval({
				resourceId,
				threadId: this.#options.threadId,
				toolCallId: gate.toolCallId,
				approved: true,
				resumeData: resume
			});
		} catch (error) {
			this.#options.apply((state) => ({
				...settleAssistantTurn(state),
				error: readableApiErrorMessage(error, 'Gagal mengirim jawaban.')
			}));
		}
	}

	#agent(): ThreadAgentClient {
		return this.#options.getAgent(this.#options.getAgentKind());
	}
}
