import { describe, expect, it } from "vitest";
import { isRunActive, sortTranscriptMessages } from "./transcript-model";
import type { ChatMessage, ResearchRun } from "../types";

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-1",
    key: "message-1",
    role: "assistant",
    status: "success",
    order: 0,
    stepOrder: 0,
    text: "",
    ...overrides,
  };
}

function run(overrides: Partial<ResearchRun>): ResearchRun {
  return {
    _id: "run-1",
    mode: "deep",
    executionKind: "workflow",
    status: "completed",
    retryable: false,
    activity: [],
    ...overrides,
  };
}

describe("thread transcript model", () => {
  it("sorts messages by order then stepOrder", () => {
    const sorted = sortTranscriptMessages([
      message({ id: "third", key: "third", order: 2, stepOrder: 0 }),
      message({ id: "second", key: "second", order: 1, stepOrder: 1 }),
      message({ id: "first", key: "first", order: 1, stepOrder: 0 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });

  it("treats queued/running/waiting runs as active and terminal runs as inactive", () => {
    expect(isRunActive(run({ status: "running" }))).toBe(true);
    expect(isRunActive(run({ status: "queued" }))).toBe(true);
    expect(isRunActive(run({ status: "waiting_hitl" }))).toBe(true);
    expect(isRunActive(run({ status: "completed" }))).toBe(false);
    expect(isRunActive(run({ status: "failed" }))).toBe(false);
    expect(isRunActive(run({ status: "canceled" }))).toBe(false);
  });
});
