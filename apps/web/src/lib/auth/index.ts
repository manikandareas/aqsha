// Client-side auth facade. Server facade lives in `$lib/server/auth`.
export { clerkTokenGetter, type TokenGetter } from './token';
export {
	getAuthState,
	getAuthToken,
	getClerk,
	getClerkUser,
	getReverification,
	getSignOut,
	type AuthState
} from './context.svelte';
export { ReverificationCancelledError, isReverificationCancelledError } from './reverification';
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
