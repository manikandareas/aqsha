// Client-side auth facade (plan §Phase 2 task 2). Server facade lives in `$lib/server/auth`.
export { clerkTokenGetter, type TokenGetter } from './token';
export { getAuthState, getAuthToken, getClerk, type AuthState } from './context.svelte';
export { ViewerIdentityState, viewerContext } from './viewer.svelte';
export {
	pickClerkDisplayName,
	resolveViewer,
	viewerDisplay,
	viewerInitials,
	type ClerkUserLike,
	type ViewerDisplay,
	type ViewerIdentity
} from './viewer-identity';
export { default as UserSync } from './UserSync.svelte';
