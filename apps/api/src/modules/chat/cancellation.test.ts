import { describe, expect, test } from "bun:test";

import { RunCancellationRegistry } from "./cancellation";

describe("RunCancellationRegistry", () => {
  test("propagates Run Cancellation to the active run signal", () => {
    const registry = new RunCancellationRegistry();
    const handle = registry.track("run_123");

    const boundaries = registry.cancel("run_123");

    expect(handle.signal.aborted).toBe(true);
    expect(handle.cancelRequested).toBe(true);
    expect(boundaries).toEqual({
      modelStream: "propagated",
      subagents: "propagated",
      sandbox: "unsupported",
      render: "unsupported",
      upload: "unsupported",
    });
  });

  test("reports already finished boundaries when no active handle exists", () => {
    const registry = new RunCancellationRegistry();

    expect(registry.cancel("run_123")).toEqual({
      modelStream: "already_finished",
      subagents: "already_finished",
      sandbox: "already_finished",
      render: "already_finished",
      upload: "already_finished",
    });
  });
});
