import { describe, expect, it } from "vitest";
import { humanizeInteractionResponse } from "../convex/agent/hitl/humanize";

const QUESTIONS = JSON.stringify({
  questions: [
    {
      prompt: "Fokus bagian mana?",
      options: [
        { id: "a", label: "Metodologi" },
        { id: "b", label: "Hasil" },
      ],
    },
  ],
});

describe("humanizeInteractionResponse", () => {
  it("maps selected option ids to their labels", () => {
    const text = humanizeInteractionResponse({
      payloadJson: QUESTIONS,
      response: {
        kind: "answers",
        answers: [{ prompt: "Fokus bagian mana?", selectedOptionIds: ["a", "b"] }],
      },
    });
    expect(text).toBe("Metodologi, Hasil");
  });

  it("combines a custom answer with selected labels", () => {
    const text = humanizeInteractionResponse({
      payloadJson: QUESTIONS,
      response: {
        kind: "answers",
        answers: [
          { prompt: "Fokus bagian mana?", selectedOptionIds: ["a"], customAnswer: "plus diskusi" },
        ],
      },
    });
    expect(text).toBe("Metodologi — plus diskusi");
  });

  it("skips skipped answers and falls back when nothing is answered", () => {
    expect(
      humanizeInteractionResponse({
        payloadJson: QUESTIONS,
        response: { kind: "answers", answers: [{ prompt: "Fokus bagian mana?", skipped: true }] },
      }),
    ).toBe("Dilewati");
  });

  it("renders approval decisions with an optional note", () => {
    expect(
      humanizeInteractionResponse({
        payloadJson: "{}",
        response: { kind: "approval", approved: true },
      }),
    ).toBe("Setujui");
    expect(
      humanizeInteractionResponse({
        payloadJson: "{}",
        response: { kind: "approval", approved: false, note: "ubah judulnya dulu" },
      }),
    ).toBe("Tolak — ubah judulnya dulu");
  });

  it("degrades gracefully on malformed payload JSON (falls back to ids)", () => {
    const text = humanizeInteractionResponse({
      payloadJson: "not-json",
      response: {
        kind: "answers",
        answers: [{ prompt: "x", selectedOptionIds: ["a"] }],
      },
    });
    expect(text).toBe("a");
  });

  it("renders plan_decision bubbles per decision", () => {
    expect(
      humanizeInteractionResponse({
        payloadJson: "{}",
        response: { kind: "plan_decision", decision: "start" },
      }),
    ).toBe("Mulai riset dengan rencana ini.");
    expect(
      humanizeInteractionResponse({
        payloadJson: "{}",
        response: {
          kind: "plan_decision",
          decision: "start",
          editedPlan: "## Rencana\n\n1. a",
        },
      }),
    ).toBe("Mulai riset dengan rencana ini. (dengan suntingan)");
    expect(
      humanizeInteractionResponse({
        payloadJson: "{}",
        response: {
          kind: "plan_decision",
          decision: "revise",
          revisionInstruction: "fokuskan ke studi 2023",
        },
      }),
    ).toBe("fokuskan ke studi 2023");
    expect(
      humanizeInteractionResponse({
        payloadJson: "{}",
        response: { kind: "plan_decision", decision: "reject" },
      }),
    ).toBe("Tolak rencana riset.");
  });
});
