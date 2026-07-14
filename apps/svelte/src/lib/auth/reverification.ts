/**
 * Reverification handler — Svelte port of `@clerk/shared`'s `createReverificationHandler`
 * (the engine behind React's `useReverification`). `svelte-clerk@1.1.10` ships no
 * `useReverification`, so we replicate the essential loop: run the operation; if Clerk
 * signals that step-up verification is required, open Clerk's built-in reverification modal
 * via `clerk.__internal_openReverification` (the same internal method React wires as
 * `openUIComponent`), wait for the user to verify (or cancel), then retry the operation once.
 *
 * Sensitive user actions (`updatePassword`, `createTOTP`, `disableTOTP`, …) go through this so
 * they mirror web's `useReverification(...)` wrapping. If the Clerk instance does not require
 * reverification for an operation, this is a transparent passthrough.
 *
 * Pure (takes the clerk instance as an argument) → no runes, unit-reasonable. The runes-scoped
 * facade that captures the clerk context lives in `context.svelte.ts` (`getReverification`).
 */

/**
 * Minimal shape we depend on from the clerk-js instance (avoids importing internal Clerk types).
 * The props object is a subset of Clerk's `__internal_UserVerificationModalProps` (all its fields
 * optional), so the real clerk-js method is assignable to this looser signature.
 */
type ReverifiableClerk = {
	__internal_openReverification?: (props?: {
		afterVerification?: () => void;
		afterVerificationCancelled?: () => void;
	}) => void;
} | null;

/** Thrown when the user dismisses the reverification modal (mirror Clerk's cancel path). */
export class ReverificationCancelledError extends Error {
	readonly code = 'reverification_cancelled';
	constructor() {
		super('User cancelled attempted verification');
		this.name = 'ReverificationCancelledError';
	}
}

export function isReverificationCancelledError(
	error: unknown
): error is ReverificationCancelledError {
	return (
		error instanceof ReverificationCancelledError ||
		(typeof error === 'object' &&
			error !== null &&
			(error as { code?: unknown }).code === 'reverification_cancelled')
	);
}

/**
 * Duck-typed detection of a "reverification required" signal from clerk-js. Handles both the
 * thrown `ClerkAPIResponseError` shape (`{ errors: [{ code }] }`) and the reverification-hint
 * shape (`{ clerk_error: { reason } }`) so we cover however clerk-js surfaces it.
 */
export function isReverificationHint(result: unknown): boolean {
	if (!result || typeof result !== 'object') return false;
	const hint = (result as { clerk_error?: { reason?: string } }).clerk_error;
	if (hint?.reason === 'reverification-error') return true;
	const errors = (result as { errors?: Array<{ code?: string }> }).errors;
	const code = Array.isArray(errors) ? errors[0]?.code : (result as { code?: string }).code;
	return typeof code === 'string' && code.includes('reverification');
}

/**
 * Run `op`; on a reverification signal, open Clerk's modal and retry once. Rejections that are
 * not reverification signals (and cancellations) propagate to the caller unchanged.
 */
export async function runWithReverification<T>(
	clerk: ReverifiableClerk,
	op: () => Promise<T>
): Promise<T> {
	try {
		return await op();
	} catch (error) {
		if (!clerk?.__internal_openReverification || !isReverificationHint(error)) {
			throw error;
		}
		await new Promise<void>((resolve, reject) => {
			clerk.__internal_openReverification!({
				afterVerification: () => resolve(),
				afterVerificationCancelled: () => reject(new ReverificationCancelledError())
			});
		});
		// Verified: retry the original request one more time (parity with @clerk/shared).
		return await op();
	}
}
