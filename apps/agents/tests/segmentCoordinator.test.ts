import { describe, expect, it } from "vitest";
import { SegmentCoordinator } from "../src/agent/segmentCoordinator";

describe("SegmentCoordinator", () => {
  it("resolves the await when the bridge releases AFTER the hook starts waiting (EAGER)", async () => {
    const coordinator = new SegmentCoordinator();
    let resolved = false;
    const waiting = coordinator
      .awaitSegmentClosed("tu_1", 10_000)
      .then(() => {
        resolved = true;
      });
    // The hook is parked until the bridge closes the preceding segment.
    await Promise.resolve();
    expect(resolved).toBe(false);
    coordinator.release("tu_1");
    await waiting;
    expect(resolved).toBe(true);
  });

  it("resolves immediately when the bridge released BEFORE the hook waits (LAZY)", async () => {
    const coordinator = new SegmentCoordinator();
    coordinator.release("tu_2");
    // Should not hang even with a tiny timeout — the barrier is already open.
    await coordinator.awaitSegmentClosed("tu_2", 5);
    expect(true).toBe(true);
  });

  it("never waits when there is no toolUseId to correlate", async () => {
    const coordinator = new SegmentCoordinator();
    await coordinator.awaitSegmentClosed(undefined, 5);
    expect(true).toBe(true);
  });

  it("falls back via timeout if the barrier is never released", async () => {
    const coordinator = new SegmentCoordinator();
    const start = Date.now();
    await coordinator.awaitSegmentClosed("tu_never", 20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it("release is idempotent", () => {
    const coordinator = new SegmentCoordinator();
    coordinator.release("tu_3");
    expect(() => coordinator.release("tu_3")).not.toThrow();
  });

  it("bails early on an aborted signal instead of waiting out the timeout", async () => {
    const coordinator = new SegmentCoordinator();
    const controller = new AbortController();
    const start = Date.now();
    const waiting = coordinator.awaitSegmentClosed("tu_cancel", 10_000, controller.signal);
    controller.abort();
    await waiting;
    expect(Date.now() - start).toBeLessThan(1_000);
  });

  it("returns immediately if the signal is already aborted", async () => {
    const coordinator = new SegmentCoordinator();
    const controller = new AbortController();
    controller.abort();
    await coordinator.awaitSegmentClosed("tu_pre", 10_000, controller.signal);
    expect(true).toBe(true);
  });
});
