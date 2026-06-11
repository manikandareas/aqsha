import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { buildResumeRagContextHandler } from "../convex/agent/context/resumeContext";

// Slice R2 (AUD-08): the pure contextHandler that re-injects RAG on HITL resume.
// Asserts placement (after recent, before the resolution turn) + idempotence
// (empty block is a no-op) + non-reordering of search/recent.

const fakeCtx = {} as never;

function msg(role: ModelMessage["role"], text: string): ModelMessage {
  return { role, content: text } as ModelMessage;
}

const search = [msg("user", "search-1")];
const recent = [msg("user", "recent-1"), msg("assistant", "recent-2")];
const inputMessages: ModelMessage[] = [];
const inputPrompt = [msg("tool", "hitl-resolution")];
const existingResponses = [msg("assistant", "tool-call")];
const allMessages = [...search, ...recent, ...inputMessages, ...inputPrompt, ...existingResponses];

const handlerArgs = {
  allMessages,
  search,
  recent,
  inputMessages,
  inputPrompt,
  existingResponses,
  userId: "u1",
  threadId: "t1",
} as never;

describe("buildResumeRagContextHandler", () => {
  it("inserts the RAG system message after recent and before the resolution turn", async () => {
    const handler = buildResumeRagContextHandler("<retrieved_document_context>doc</retrieved_document_context>");
    const out = (await handler(fakeCtx, handlerArgs)) as ModelMessage[];
    // search + recent (3) then the synthetic RAG message, then prompt + responses.
    expect(out).toHaveLength(allMessages.length + 1);
    const ragIndex = out.findIndex((m) => m.role === "system");
    expect(ragIndex).toBe(search.length + recent.length); // right after recent
    expect(out[ragIndex].content).toContain("retrieved_document_context");
    // Resolution turn stays after the injection, in order.
    expect(out[ragIndex + 1].content).toBe("hitl-resolution");
    expect(out[ragIndex + 2].content).toBe("tool-call");
    // search/recent untouched and first.
    expect(out.slice(0, 3).map((m) => m.content)).toEqual(["search-1", "recent-1", "recent-2"]);
  });

  it("is a no-op for an empty / whitespace block (returns the default order)", async () => {
    for (const block of ["", "   ", "\n"]) {
      const out = (await buildResumeRagContextHandler(block)(fakeCtx, handlerArgs)) as ModelMessage[];
      expect(out).toBe(allMessages);
    }
  });
});
