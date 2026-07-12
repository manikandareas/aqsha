// Pure derivations for `useThreadExperienceData`, split out so the auth gate is
// unit-testable without rendering React hooks.
//
// The subtle bug these guard against: a TanStack Query that is *disabled*
// (`enabled: authReady === false`) still holds the PREVIOUS fetch's cached data.
// After sign-out or an account switch `threadId` can linger for a render, so reading
// `query.data` unconditionally would surface the previous user's thread / send-status.
// Both derivations therefore ignore cached data unless `authReady` is true.
import type { RateStatus } from "../types";

export type SelectedThreadSource = {
  id: string;
  title?: string | null;
  workspaceId?: string | null;
  status: unknown;
};

export type SelectedThread<TData extends SelectedThreadSource> = {
  threadId: string;
  title: string;
  workspaceId: string | undefined;
  status: TData["status"];
};

/**
 * Header quick-switcher card for the selected thread.
 * - `undefined` → nothing selected, or still resolving (render neutral, not "not found").
 * - `null`      → the id resolved to "not found / not yours".
 */
export function deriveSelectedThread<TData extends SelectedThreadSource>(params: {
  threadId: string | undefined;
  authReady: boolean;
  isLoading: boolean;
  data: TData | null | undefined;
}): SelectedThread<TData> | null | undefined {
  const { threadId, authReady, isLoading } = params;
  if (!threadId) return undefined;
  // Only trust cached query data once auth is ready — otherwise a signed-out or
  // account-switched session would render the previous user's thread.
  const data = authReady ? params.data : undefined;
  if (data) {
    return {
      threadId: data.id,
      title: data.title?.trim() ? data.title : "Percakapan baru",
      workspaceId: data.workspaceId ?? undefined,
      status: data.status,
    };
  }
  return isLoading || !authReady ? undefined : null;
}

export type SendStatusSource = {
  canSend: boolean;
  reason?: string;
  retryAt?: number;
};

/** Composer rate-limit pre-check. Same auth gate as {@link deriveSelectedThread}. */
export function deriveRateStatus(
  authReady: boolean,
  data: SendStatusSource | undefined,
): RateStatus | undefined {
  const trusted = authReady ? data : undefined;
  if (!trusted) return undefined;
  return {
    ok: trusted.canSend,
    serverTime: 0,
    canSend: trusted.canSend,
    reason: trusted.reason,
    retryAt: trusted.retryAt,
  };
}
