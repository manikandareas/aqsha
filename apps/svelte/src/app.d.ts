/// <reference types="svelte-clerk/env" />
// `svelte-clerk/env` augments `App.Locals` with `auth: (opts?) => SessionAuthObject`
// (userId, sessionId, getToken, …) populated by `withClerkHandler` in hooks.server.ts.

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// Normalized error payload (plan §"Error handling"): `code` menyertai `message` untuk
		// `+error.svelte` & branch UI. Diisi `error(status, {message, code})` (expected) atau
		// `handleError` (unexpected). Selaras bentuk appError `{ message, code, severity?, field? }`.
		interface Error {
			message: string;
			code?: string;
		}
		// interface Locals {}  ← provided by svelte-clerk/env
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
