import { describe, expect, it } from "vitest";
import { promptCommands } from "@aqsha/convex/prompt-commands";
import {
  buildComposerSubmission,
  getComposerAvailability,
  restoreComposerContentAfterBlockedSend,
} from "./composer-model";
import type { ResearchRun } from "../types";

function activeDeepRun(): ResearchRun {
  return {
    _id: "run-1",
    mode: "deep",
    executionKind: "workflow",
    status: "running",
    retryable: true,
    steps: [],
    events: [],
  };
}

describe("thread composer model", () => {
  it("turns the /deep command into a Deep submission", () => {
    const submission = buildComposerSubmission({
      content: "/deep Bandingkan bukti",
      selectedCommand: null,
      mode: "normal",
    });

    expect(submission).toEqual({
      content: "/deep Bandingkan bukti",
      mode: "deep",
      commandId: "deep-research",
    });
  });

  it("restores content after rate-limited or billing-blocked sends", () => {
    const deepCommand = promptCommands.find((command) => command.id === "deep-research") ?? null;

    expect(
      restoreComposerContentAfterBlockedSend("/deep Bandingkan bukti", null),
    ).toBe("/deep Bandingkan bukti");
    expect(
      restoreComposerContentAfterBlockedSend("/deep Bandingkan bukti", deepCommand),
    ).toBe("Bandingkan bukti");
  });

  it("turns the /artifact command into a normal submission with artifact command id", () => {
    const submission = buildComposerSubmission({
      content: "/artifact cerita rakyat",
      selectedCommand: null,
      mode: "deep",
    });

    expect(submission).toEqual({
      content: "/artifact cerita rakyat",
      mode: "normal",
      commandId: "artifact",
    });
  });

  it("disables input submission and exposes stop behavior for active Deep runs", () => {
    const availability = getComposerAvailability({
      visibleContent: "follow up",
      disabled: false,
      isSending: false,
      isRateLimited: false,
      activeRun: activeDeepRun(),
    });

    expect(availability).toEqual({
      isDeepActive: true,
      canSend: false,
      stopRunId: "run-1",
    });
  });

  it("blocks composer send while HITL cards are pending", () => {
    const availability = getComposerAvailability({
      visibleContent: "follow up",
      disabled: false,
      isSending: false,
      isRateLimited: false,
      hitlBlocking: true,
    });

    expect(availability.canSend).toBe(false);
    expect(availability.isDeepActive).toBe(false);
  });
});
