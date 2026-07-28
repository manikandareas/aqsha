/** Gate for Clerk-backed workspace list / prefill queries. */
export function isClerkSignedInQueryEnabled(
	isLoaded: boolean,
	userId: string | null | undefined
): boolean {
	return isLoaded && Boolean(userId);
}

/** Gate for optional workspace detail under an already-authenticated session. */
export function isWorkspaceDetailQueryEnabled(
	isSignedIn: boolean,
	workspaceId: string | null | undefined
): boolean {
	return isSignedIn && Boolean(workspaceId);
}
