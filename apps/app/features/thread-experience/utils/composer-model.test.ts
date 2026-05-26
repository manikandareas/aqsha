import { describe, expect, it } from "vitest";
import { promptCommands } from "@aqsha/convex/prompt-commands";
import {
  buildComposerSubmission,
  filterPromptCommandsBySlashQuery,
  getComposerAvailability,
  getSlashFilterQuery,
  restoreComposerContentAfterBlockedSend,
  resolvePrimaryCommand,
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
      visibleContent: "/deep Bandingkan bukti",
      commands: [],
      mode: "normal",
    });

    expect(submission).toEqual({
      content: "/deep Bandingkan bukti",
      mode: "deep",
      commandId: "deep-research",
    });
  });

  it("restores visible content after rate-limited or billing-blocked sends", () => {
    expect(restoreComposerContentAfterBlockedSend("/deep Bandingkan bukti")).toBe(
      "/deep Bandingkan bukti",
    );
  });

  it("turns the /artifact command into a normal submission with artifact command id", () => {
    const artifact = promptCommands.find((command) => command.id === "artifact");
    expect(artifact).toBeTruthy();

    const submission = buildComposerSubmission({
      visibleContent: "/artifact cerita rakyat",
      commands: artifact ? [artifact] : [],
      mode: "deep",
    });

    expect(submission).toEqual({
      content: "/artifact cerita rakyat",
      mode: "normal",
      commandId: "artifact",
    });
  });

  it("supports multiple inline commands without forcing a single command id", () => {
    const outline = promptCommands.find((command) => command.id === "outline");
    const expand = promptCommands.find((command) => command.id === "expand");
    expect(outline && expand).toBeTruthy();
    if (!outline || !expand) {
      return;
    }

    const submission = buildComposerSubmission({
      visibleContent: `${outline.slug} ringkas ${expand.slug} detail`,
      commands: [outline, expand],
      mode: "normal",
    });

    expect(submission.commandId).toBeUndefined();
    expect(submission.mode).toBe("normal");
    expect(submission.content).toContain(outline.slug);
    expect(submission.content).toContain(expand.slug);
  });

  it("uses the only inline command as the primary command id", () => {
    const outline = promptCommands.find((command) => command.id === "outline");
    expect(outline).toBeTruthy();
    if (!outline) {
      return;
    }

    expect(resolvePrimaryCommand([outline], `${outline.slug} judul`)).toEqual(outline);
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

  it("detects slash filter mode only before the first space", () => {
    expect(getSlashFilterQuery("/outline")).toBe("outline");
    expect(getSlashFilterQuery("/")).toBe("");
    expect(getSlashFilterQuery("/deep follow up")).toBeNull();
    expect(getSlashFilterQuery("hello /outline")).toBeNull();
  });

  it("filters slash commands by partial slug", () => {
    const matches = filterPromptCommandsBySlashQuery("out");
    expect(matches.some((command) => command.id === "outline")).toBe(true);
    expect(matches.some((command) => command.id === "artifact")).toBe(false);
  });
});
