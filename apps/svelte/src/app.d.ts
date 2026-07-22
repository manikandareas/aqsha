/// <reference types="svelte-clerk/env" />
// `svelte-clerk/env` augments `App.Locals` with `auth: (opts?) => SessionAuthObject`
// (userId, sessionId, getToken, …) populated by `withClerkHandler` in hooks.server.ts.

declare global {
	namespace App {
		// Normalized error payload: `code` accompanies `message` for `+error.svelte` & UI branches.
		// Set via `error(status, {message, code})` (expected) or `handleError` (unexpected).
		// Matches appError shape `{ message, code, severity?, field? }`.
		interface Error {
			message: string;
			code?: string;
		}

		interface PageData {
			bootstrap?: import('$lib/query').QueryBootstrap;
		}
	}
}

export {};
