import { createContext } from '$lib/context';
import type { ThreadAgent } from './thread-agent.svelte';

/**
 * Per-tree context for the durable thread agent (§3.5 — `createContext`, not module-level state, so a
 * ThreadAgent never leaks across users under SSR). The thread shell sets it; message/composer/panel
 * components read it. Phase 6 exposes the seam; Phase 7 wires the full thread surface onto it.
 */
export const threadAgentContext = createContext<ThreadAgent>('thread-agent');

export const setThreadAgent = (agent: ThreadAgent): ThreadAgent => threadAgentContext.set(agent);
export const getThreadAgent = (): ThreadAgent => threadAgentContext.get();
export const getThreadAgentOptional = (): ThreadAgent | undefined =>
	threadAgentContext.getOptional();
