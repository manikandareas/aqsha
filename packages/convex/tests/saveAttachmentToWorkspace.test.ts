/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

// `requireCurrentUser` in a mutation ctx requires a synced users row keyed by
// ownerUserId (= identity.tokenIdentifier).
const OWNER = "owner-attach-test";
const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

async function seedUser(ctx: any, ownerUserId: string) {
  await ctx.db.insert("users", {
    ownerUserId,
    clerkUserId: ownerUserId,
    createdAt: 0,
    updatedAt: 0,
  });
}

async function seedAttachment(
  ctx: any,
  args: { ownerUserId: string; threadId: string },
) {
  const artifactId = await ctx.db.insert("artifacts", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    source: "upload",
    artifactType: "pdf",
    title: "Attachment.pdf",
    status: "active",
    createdAt: 0,
    updatedAt: 0,
  });
  await ctx.db.insert("artifactContents", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    artifactId,
    plainText: "hello",
    createdAt: 0,
    updatedAt: 0,
  });
  return artifactId;
}

describe("saveAttachmentToWorkspace (chatThreads-bound workspace)", () => {
  let t: ReturnType<typeof convexTest>;
  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("files the attachment under the workspace its thread is bound to via chatThreads", async () => {
    const { workspaceId, artifactId } = await t.run(async (ctx) => {
      await seedUser(ctx, OWNER);
      const workspaceId = await ctx.db.insert("workspaces", {
        ownerUserId: OWNER,
        name: "Bound workspace",
        status: "active",
        createdAt: 0,
        updatedAt: 0,
      });
      // The thread's "filed under" workspace now lives on chatThreads
      // (formerly threadMetadata.workspaceId).
      await ctx.db.insert("chatThreads", {
        threadId: "thr_bound",
        ownerUserId: OWNER,
        workspaceId,
        status: "idle",
        agentKind: "lite",
        lastActivityAt: 0,
        messageCount: 0,
      });
      const artifactId = await seedAttachment(ctx, {
        ownerUserId: OWNER,
        threadId: "thr_bound",
      });
      return { workspaceId, artifactId };
    });

    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.artifacts.saveAttachmentToWorkspace, { artifactId });

    expect(result.workspaceId).toBe(workspaceId);
    expect(result.artifactId).toBe(artifactId);

    await t.run(async (ctx) => {
      const artifact = await ctx.db.get("artifacts", artifactId);
      expect(artifact?.workspaceId).toBe(workspaceId);
      expect(artifact?.threadId).toBeUndefined();
    });
  });

  it("ignores a chatThreads row owned by another user and falls back to the caller's workspace", async () => {
    const { ownWorkspaceId, artifactId } = await t.run(async (ctx) => {
      await seedUser(ctx, OWNER);
      // A thread bound to a workspace owned by someone else must never leak.
      const foreignWorkspaceId = await ctx.db.insert("workspaces", {
        ownerUserId: "someone-else",
        name: "Foreign",
        status: "active",
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("chatThreads", {
        threadId: "thr_foreign",
        ownerUserId: "someone-else",
        workspaceId: foreignWorkspaceId,
        status: "idle",
        agentKind: "lite",
        lastActivityAt: 0,
        messageCount: 0,
      });
      const ownWorkspaceId = await ctx.db.insert("workspaces", {
        ownerUserId: OWNER,
        name: "Mine",
        status: "active",
        createdAt: 0,
        updatedAt: 0,
      });
      const artifactId = await seedAttachment(ctx, {
        ownerUserId: OWNER,
        threadId: "thr_foreign",
      });
      return { ownWorkspaceId, artifactId };
    });

    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.artifacts.saveAttachmentToWorkspace, { artifactId });

    // boundWorkspaceId is undefined (foreign-owned thread) → falls back to the
    // caller's single active workspace, never the foreign one.
    expect(result.workspaceId).toBe(ownWorkspaceId);
  });
});
