import { describe, expect, it } from "vitest";
import { deriveRateStatus, deriveSelectedThread } from "./thread-experience-model";

const cachedThread = {
  id: "thr_prev",
  title: "Previous user's thread",
  workspaceId: "ws_prev",
  status: "idle" as const,
};

const cachedSendStatus = { canSend: true, reason: undefined, retryAt: undefined };

describe("deriveSelectedThread", () => {
  it("exposes the thread when auth is ready and data is present", () => {
    expect(
      deriveSelectedThread({
        threadId: "thr_prev",
        authReady: true,
        isLoading: false,
        data: cachedThread,
      }),
    ).toEqual({
      threadId: "thr_prev",
      title: "Previous user's thread",
      workspaceId: "ws_prev",
      status: "idle",
    });
  });

  it("does NOT expose cached data after sign-out while threadId lingers", () => {
    // Regression: a disabled query keeps the previous user's cached thread; without the
    // auth gate this would render that thread across sign-out / account switch.
    expect(
      deriveSelectedThread({
        threadId: "thr_prev",
        authReady: false,
        isLoading: false,
        data: cachedThread,
      }),
    ).toBeUndefined();
  });

  it("falls back to a placeholder title when the thread has none", () => {
    expect(
      deriveSelectedThread({
        threadId: "thr_prev",
        authReady: true,
        isLoading: false,
        data: { ...cachedThread, title: "   " },
      })?.title,
    ).toBe("Percakapan baru");
  });

  it("returns null for a resolved-but-missing thread", () => {
    expect(
      deriveSelectedThread({
        threadId: "thr_x",
        authReady: true,
        isLoading: false,
        data: null,
      }),
    ).toBeNull();
  });

  it("returns undefined (not null) while loading", () => {
    expect(
      deriveSelectedThread({
        threadId: "thr_x",
        authReady: true,
        isLoading: true,
        data: null,
      }),
    ).toBeUndefined();
  });

  it("returns undefined when no thread is selected", () => {
    expect(
      deriveSelectedThread({
        threadId: undefined,
        authReady: true,
        isLoading: false,
        data: cachedThread,
      }),
    ).toBeUndefined();
  });
});

describe("deriveRateStatus", () => {
  it("maps send-status when auth is ready", () => {
    expect(deriveRateStatus(true, cachedSendStatus)).toEqual({
      ok: true,
      serverTime: 0,
      canSend: true,
      reason: undefined,
      retryAt: undefined,
    });
  });

  it("does NOT expose cached send-status after sign-out", () => {
    // Regression: same auth gate — stale send-status must not leak across sign-out.
    expect(deriveRateStatus(false, cachedSendStatus)).toBeUndefined();
  });
});
