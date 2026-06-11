/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

// Slice R2 (AUD-08): startInlineRun stashes the visible recall query + pinned
// attachments so a HITL resume can rebuild RAG; getRunRecallContext reads them
// back (owner-scoped, null for non-owner / pre-R2 runs).

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-recall";
const THREAD = "thread-recall";

describe("inline-run recall snapshot", () => {
  it("persists visiblePrompt + attachment ids and reads them back", async () => {
    const t = convexTest(schema, modules);
    const artifactId = await t.run((ctx) =>
      ctx.db.insert("artifacts", {
        ownerUserId: OWNER,
        threadId: THREAD,
        title: "Pinned paper",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const runId = await t.mutation(internal.agent.messages.startInlineRun, {
      ownerUserId: OWNER,
      threadId: THREAD,
      promptMessageId: "m1",
      prompt: "<context>...</context>\n\nWhat does the paper say?",
      agentKind: "lite",
      visiblePrompt: "What does the paper say?",
      messageAttachmentArtifactIds: [artifactId],
    });
    const recall = await t.query(internal.agent.messages.getRunRecallContext, {
      runId,
      ownerUserId: OWNER,
    });
    expect(recall).toEqual({
      visiblePrompt: "What does the paper say?",
      attachmentArtifactIds: [artifactId],
    });
  });

  it("returns null for a non-owner read", async () => {
    const t = convexTest(schema, modules);
    const runId = await t.mutation(internal.agent.messages.startInlineRun, {
      ownerUserId: OWNER,
      threadId: THREAD,
      promptMessageId: "m1",
      prompt: "p",
      agentKind: "lite",
      visiblePrompt: "q",
    });
    const recall = await t.query(internal.agent.messages.getRunRecallContext, {
      runId,
      ownerUserId: "someone-else",
    });
    expect(recall).toBeNull();
  });

  it("omits the snapshot when not provided (pre-R2 / no recall query)", async () => {
    const t = convexTest(schema, modules);
    const runId = await t.mutation(internal.agent.messages.startInlineRun, {
      ownerUserId: OWNER,
      threadId: THREAD,
      promptMessageId: "m1",
      prompt: "p",
      agentKind: "lite",
    });
    const recall = await t.query(internal.agent.messages.getRunRecallContext, {
      runId,
      ownerUserId: OWNER,
    });
    expect(recall).toEqual({ visiblePrompt: undefined, attachmentArtifactIds: undefined });
  });
});
