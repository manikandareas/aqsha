import type { ContextRef } from '@aqsha/chat-core';
import { createContext } from '$lib/context';
import type { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
import type { ProjectChatPhase } from '../lib/project-chat-session.svelte';

export type ProjectChatRuntime = {
	readonly workspaceId: string;
	readonly phase: ProjectChatPhase;
	readonly activeThreadId: string | null;
	readonly threadId: string;
	readonly threadAgentKind: 'lite' | 'pro';
	readonly agent: ThreadAgent | null;
	/** True hanya di phase `ready` — gates sources/stats/artifacts. */
	readonly threadPersisted: boolean;
	selectThread(threadId: string): void;
	startNewThread(): void;
	retryRestore(): void;
	onTurnSent(threadId: string, sentContextRefs: ContextRef[]): void;
};

const projectChatRuntimeContext = createContext<ProjectChatRuntime>('project-chat-runtime');

export const setProjectChatRuntime = (runtime: ProjectChatRuntime): ProjectChatRuntime =>
	projectChatRuntimeContext.set(runtime);

export const getProjectChatRuntime = (): ProjectChatRuntime => projectChatRuntimeContext.get();
