import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { throwAppError } from "../lib/appError";

// Thread ownership helpers for the SDK backend. The legacy thread CRUD
// queries (api.agent.threads.*) and the @convex-dev/agent component reads are
// gone after the Step 6 cutover; these two helpers now resolve ownership against
// the first-party `chatThreads` table. `artifacts.generateUploadUrl` is the
// remaining caller (thread-scoped uploads).

type ThreadCtx = QueryCtx | MutationCtx;

export async function tryAssertThreadOwner(
  ctx: ThreadCtx,
  threadId: string,
): Promise<Doc<"chatThreads"> | null> {
  const user = await requireCurrentUser(ctx);
  const thread = await ctx.db
    .query("chatThreads")
    .withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
    .unique();
  if (!thread || thread.ownerUserId !== user._id) {
    return null;
  }
  return thread;
}

export async function assertThreadOwner(
  ctx: ThreadCtx,
  threadId: string,
): Promise<Doc<"chatThreads">> {
  const thread = await tryAssertThreadOwner(ctx, threadId);
  if (!thread) {
    throwAppError({ message: "Thread not found", code: "thread_not_found" });
  }
  return thread;
}
