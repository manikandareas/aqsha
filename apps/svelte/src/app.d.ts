/// <reference types="svelte-clerk/env" />
// `svelte-clerk/env` augments `App.Locals` with `auth: (opts?) => SessionAuthObject`
// (userId, sessionId, getToken, …) populated by `withClerkHandler` in hooks.server.ts.

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}  ← provided by svelte-clerk/env
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
