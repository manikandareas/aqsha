import { createContext } from '$lib/context';
import type { ThreadAgent } from './thread-agent.svelte';

/**
 * Per-tree context for the durable thread agent (`createContext`, not module-level state, so a
 * ThreadAgent never leaks across users under SSR). The thread shell sets it; message/composer/panel
 * components read it.
 */
export const threadAgentContext = createContext<ThreadAgent>('thread-agent');

export const setThreadAgent = (agent: ThreadAgent): ThreadAgent => threadAgentContext.set(agent);
export const getThreadAgent = (): ThreadAgent => threadAgentContext.get();
export const getThreadAgentOptional = (): ThreadAgent | undefined =>
	threadAgentContext.getOptional();
