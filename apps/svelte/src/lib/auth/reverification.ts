/**
 * Step-up reverification for sensitive Clerk operations (`updatePassword`, `createTOTP`,
 * `disableTOTP`, …). Run the operation; if clerk-js signals that reverification is required,
 * open Clerk's built-in modal via `clerk.__internal_openReverification`, wait for the user to
 * verify (or cancel), then retry the operation once. If Clerk does not require reverification,
 * this is a transparent passthrough.
 *
 * Pure (takes the clerk instance as an argument) — no runes, unit-testable. The runes-scoped
 * facade lives in `context.svelte.ts` (`getReverification`).
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

/** Thrown when the user dismisses the reverification modal. */
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
		return await op();
	}
}
