import type { RequestHandler } from './$types';
import { serverEnv } from '$lib/server/env';
import { forwardToAgent } from './proxy';

/**
 * Streaming Mastra proxy (`/mastra-api/*`) → `@aqsha/agent`. Thin handler: origin from validated
 * `serverEnv`, forwarding in `./proxy` (`forwardToAgent`, unit-tested). Route is PUBLIC in
 * `hooks.server.ts` (excluded from Clerk gate) — auth is handled by the agent's `server.auth`.
 */
const proxy: RequestHandler = ({ request, url }) =>
	forwardToAgent(request, url, serverEnv.MASTRA_AGENT_ORIGIN);

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
