import { describe, expect, it } from "vitest";
import { shouldKeepThreadContextAfterWorkspaceMove } from "../convex/workspaceMoveModel";
import type { Id } from "../convex/_generated/dataModel";

const workspaceA = "workspace-a" as Id<"workspaces">;
const workspaceB = "workspace-b" as Id<"workspaces">;

describe("workspace move model", () => {
  it("keeps global thread context when an artifact moves workspaces", () => {
    expect(
      shouldKeepThreadContextAfterWorkspaceMove({
        targetWorkspaceId: workspaceB,
      }),
    ).toBe(true);
  });

  it("keeps context for threads bound to the target workspace", () => {
    expect(
      shouldKeepThreadContextAfterWorkspaceMove({
        threadWorkspaceId: workspaceB,
        targetWorkspaceId: workspaceB,
      }),
    ).toBe(true);
  });

  it("drops context for threads bound to the previous workspace", () => {
    expect(
      shouldKeepThreadContextAfterWorkspaceMove({
        threadWorkspaceId: workspaceA,
        targetWorkspaceId: workspaceB,
      }),
    ).toBe(false);
  });
});
