/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

const OWNER = "owner-rag-test";

// listRagTargetsForThread now derives targets purely from live `artifacts`
// (thread uploads + passed message attachments) — the retired
// threadContextArtifacts pinned-context table is gone.
describe("listRagTargetsForThread", () => {
  it("returns indexed thread uploads + passed attachments; excludes non-indexed/url; gates on ownership", async () => {
    const t = convexTest(schema, modules);
    const { indexedUpload, workspaceAttachment } = await t.run(async (ctx) => {
      await ctx.db.insert("chatThreads", {
        threadId: "thr_rag",
        ownerUserId: OWNER,
        status: "idle",
        agentKind: "lite",
        lastActivityAt: 0,
        messageCount: 0,
      });
      const indexedUpload = await ctx.db.insert("artifacts", {
        ownerUserId: OWNER,
        threadId: "thr_rag",
        source: "upload",
        artifactType: "pdf",
        title: "Indexed.pdf",
        status: "active",
        ragEntryId: "rag-1",
        indexingStatus: "ready",
        createdAt: 0,
        updatedAt: 0,
      });
      // Uploaded but not indexed → excluded.
      await ctx.db.insert("artifacts", {
        ownerUserId: OWNER,
        threadId: "thr_rag",
        source: "upload",
        artifactType: "pdf",
        title: "Pending.pdf",
        status: "active",
        indexingStatus: "pending",
        createdAt: 0,
        updatedAt: 0,
      });
      // URL artifact → excluded even when indexed.
      await ctx.db.insert("artifacts", {
        ownerUserId: OWNER,
        threadId: "thr_rag",
        source: "upload",
        artifactType: "url",
        title: "Link",
        status: "active",
        ragEntryId: "rag-url",
        indexingStatus: "ready",
        createdAt: 0,
        updatedAt: 0,
      });
      // A workspace artifact passed explicitly as a message attachment.
      const workspaceId = await ctx.db.insert("workspaces", {
        ownerUserId: OWNER,
        name: "WS",
        status: "active",
        createdAt: 0,
        updatedAt: 0,
      });
      const workspaceAttachment = await ctx.db.insert("artifacts", {
        ownerUserId: OWNER,
        workspaceId,
        source: "upload",
        artifactType: "pdf",
        title: "WS doc.pdf",
        status: "active",
        ragEntryId: "rag-ws",
        indexingStatus: "ready",
        createdAt: 0,
        updatedAt: 0,
      });
      return { indexedUpload, workspaceAttachment };
    });

    const targets = await t.query(
      internal.agent.context.threadContext.listRagTargetsForThread,
      {
        ownerUserId: OWNER,
        threadId: "thr_rag",
        messageAttachmentArtifactIds: [workspaceAttachment],
      },
    );
    expect(targets.map((x) => x.artifactId).sort()).toEqual(
      [indexedUpload, workspaceAttachment].sort(),
    );

    // Ownership gate: a different owner sees nothing.
    const none = await t.query(
      internal.agent.context.threadContext.listRagTargetsForThread,
      { ownerUserId: "someone-else", threadId: "thr_rag" },
    );
    expect(none).toEqual([]);
  });
});
