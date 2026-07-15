/**
 * Message from a Clerk frontend-SDK error. Shape: `{ errors: [{ longMessage, message }] }` (different
 * from the Eden error handled by `readableApiErrorMessage`). Duck-typed so no type-guard import is
 * needed. A user-cancelled reverification falls through to the silent fallback.
 */
export function clerkErrorMessage(error: unknown, fallback: string): string {
	if (error && typeof error === 'object' && 'errors' in error) {
		const first = (error as { errors?: Array<{ longMessage?: string; message?: string }> })
			.errors?.[0];
		const msg = first?.longMessage ?? first?.message;
		if (typeof msg === 'string' && msg.length > 0) return msg;
	}
	return fallback;
}
