export type DocumentProposalAttemptState = { attempts: number };

export function nextDocumentProposalAttempt(
  state: DocumentProposalAttemptState,
): { ok: true; attempt: number } | { ok: false; attempts: number } {
  if (state.attempts >= 3) return { ok: false, attempts: state.attempts };
  state.attempts += 1;
  return { ok: true, attempt: state.attempts };
}
