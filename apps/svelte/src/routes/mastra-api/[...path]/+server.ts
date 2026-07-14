import type { RequestHandler } from './$types';
import { serverEnv } from '$lib/server/env';
import { forwardToAgent } from './proxy';

/**
 * Streaming Mastra proxy (`/mastra-api/*`) → `@aqsha/agent`. Tipis: origin dari `serverEnv`
 * (tervalidasi, §3.7), forwarding di `./proxy` (`forwardToAgent`, unit-tested). Route ini PUBLIC di
 * `hooks.server.ts` (di-exclude dari gate Clerk) — auth ditangani `server.auth` agent.
 */
const proxy: RequestHandler = ({ request, url }) =>
	forwardToAgent(request, url, serverEnv.MASTRA_AGENT_ORIGIN);

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
