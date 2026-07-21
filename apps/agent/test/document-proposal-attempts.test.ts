import { describe, expect, test } from 'bun:test';
import { nextDocumentProposalAttempt } from '../src/mastra/tools/document-proposal-attempts';

describe('nextDocumentProposalAttempt', () => {
  test('allows exactly three calls then blocks the fourth', () => {
    const state = { attempts: 0 };
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: true, attempt: 1 });
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: true, attempt: 2 });
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: true, attempt: 3 });
    expect(nextDocumentProposalAttempt(state)).toEqual({ ok: false, attempts: 3 });
  });
});
