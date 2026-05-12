import { describe, expect, it } from "vitest";
import {
  getSourcesForMessage,
  interleaveRunsWithMessages,
  sortTranscriptMessages,
} from "./transcript-model";
import type { ChatMessage, ResearchRun } from "./types";

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
    steps: [],
    events: [],
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

  it("places a Deep Research run after its prompt message", () => {
    const entries = interleaveRunsWithMessages(
      [
        message({ id: "prompt", key: "prompt", role: "user", order: 0 }),
        message({ id: "answer", key: "answer", role: "assistant", order: 1 }),
      ],
      [run({ _id: "deep-run", promptMessageId: "prompt" })],
    );

    expect(entries.map((entry) => entry.kind === "run" ? entry.run._id : entry.message.id)).toEqual([
      "prompt",
      "deep-run",
      "answer",
    ]);
  });

  it("keeps orphaned runs renderable", () => {
    const entries = interleaveRunsWithMessages(
      [message({ id: "answer", key: "answer", role: "assistant", order: 1 })],
      [run({ _id: "orphan-run", promptMessageId: "missing-message" })],
    );

    expect(entries.at(-1)).toMatchObject({
      kind: "run",
      run: { _id: "orphan-run" },
    });
  });

  it("maps citation markers to sources", () => {
    const sources = [
      { _id: "source-1", title: "One", citationNumber: 1 },
      { _id: "source-2", title: "Two", citationNumber: 2 },
      { _id: "source-3", title: "Three", citationNumber: 3 },
    ];

    const linked = getSourcesForMessage(
      message({ id: "answer", text: "Supported by [2] and [3]." }),
      "Supported by [2] and [3].",
      sources as never,
    );

    expect(linked.map((source) => source.citationNumber)).toEqual([2, 3]);
  });
});
