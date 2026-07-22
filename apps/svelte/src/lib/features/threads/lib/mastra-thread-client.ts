import type { MastraClient } from '@mastra/client-js';
import type { AgentKind, AskQuestionsResumeData } from '@aqsha/chat-core';
import type { DeepRun, DeepRunSnapshot } from './deep-workflow';
import { agentIdFor } from './mastra-client';

export type ThreadSubscription = {
	processDataStream(options: {
		onChunk: (chunk: unknown) => void;
		reconnect?: boolean | { maxRetries?: number; delayMs?: number };
	}): Promise<void>;
	abort(): Promise<boolean>;
	unsubscribe(): void;
};

export type AgentSendInput = {
	message: string;
	resourceId: string;
	threadId: string;
	requestContext?: Record<string, string>;
	ifIdle?: { streamOptions: { context: Array<{ role: 'user'; content: string }> } };
};

export type ThreadAgentClient = {
	subscribeToThread(input: { threadId: string; resourceId: string }): Promise<ThreadSubscription>;
	sendMessage(input: AgentSendInput): Promise<unknown>;
	queueMessage(input: {
		runId: string;
		message: string;
		resourceId: string;
		threadId: string;
		requestContext?: Record<string, string>;
	}): Promise<{ runId?: string }>;
	sendToolApproval(input: {
		resourceId: string;
		threadId: string;
		toolCallId: string;
		approved: boolean;
		resumeData?: AskQuestionsResumeData;
	}): Promise<unknown>;
};

export type WorkflowClient = {
	createRun(input: { runId?: string; resourceId: string }): Promise<DeepRun>;
	runById(runId: string): Promise<DeepRunSnapshot>;
};

export type MemoryMessage = { id: string; role?: string };

export type MemoryThreadClient = {
	listMessages(): Promise<{ messages?: MemoryMessage[] }>;
	deleteMessages(ids: string[]): Promise<unknown>;
};

type MastraClientSurface = {
	getAgent(id: string): ThreadAgentClient;
	getWorkflow(id: string): WorkflowClient;
	getMemoryThread(input: { threadId: string; agentId: string }): MemoryThreadClient;
};

/** Narrow typed boundary for client-js methods that are present at runtime but incomplete in 1.28 typings. */
export class MastraThreadClient {
	readonly #getClient: () => MastraClient;

	constructor(getClient: () => MastraClient) {
		this.#getClient = getClient;
	}

	get raw(): MastraClient {
		return this.#getClient();
	}

	agent(kind: AgentKind): ThreadAgentClient {
		return this.#surface().getAgent(agentIdFor(kind));
	}

	workflow(workflowId: string): WorkflowClient {
		return this.#surface().getWorkflow(workflowId);
	}

	memoryThread(threadId: string, kind: AgentKind): MemoryThreadClient {
		return this.#surface().getMemoryThread({ threadId, agentId: agentIdFor(kind) });
	}

	#surface(): MastraClientSurface {
		return this.#getClient() as unknown as MastraClientSurface;
	}
}
