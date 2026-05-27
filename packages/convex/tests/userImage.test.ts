import { describe, expect, it } from "vitest";
import { AVATAR_STORAGE_PREFIX } from "../convex/lib/userImage";

describe("user image helpers", () => {
  it("uses a stable storage prefix for avatar references", () => {
    expect(`${AVATAR_STORAGE_PREFIX}abc123`).toBe("storage:abc123");
  });
});
