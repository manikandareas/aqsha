import type { ContextHandler } from "@convex-dev/agent";
import type { ModelMessage } from "ai";

// AUD-08: re-inject the RAG document-context block on a HITL resume turn.
//
// The problem: resumeGeneration continues from a saved tool-result /
// tool-approval-response message (promptMessageId) WITHOUT a string `prompt`, so
// the normal prepend-RAG-to-prompt path (runInlineGeneration) is skipped and the
// resumed turn loses the user's pinned document context. Passing the block via
// `prompt` is wrong: with promptMessageId set, a string prompt REPLACES the
// message at that id, clobbering the HITL resolution.
//
// The fix: a contextHandler. The agent's default ordering (fetchContextWithPrompt)
// is `[...search, ...recent, ...inputMessages, ...inputPrompt, ...existingResponses]`.
// We reproduce it with one synthetic system message carrying the retrieved block
// inserted after `recent` (thread history) and before the resolution turn
// (inputMessages / inputPrompt / existingResponses), leaving search/recent
// untouched. contextHandler output is used only for the model call and is never
// persisted, so no spurious user message is saved. Empty block → no-op.
export function buildResumeRagContextHandler(ragBlock: string): ContextHandler {
  const trimmed = ragBlock.trim();
  return (_ctx, args) => {
    if (!trimmed) {
      return args.allMessages;
    }
    const ragMessage: ModelMessage = { role: "system", content: trimmed };
    return [
      ...args.search,
      ...args.recent,
      ragMessage,
      ...args.inputMessages,
      ...args.inputPrompt,
      ...args.existingResponses,
    ];
  };
}
