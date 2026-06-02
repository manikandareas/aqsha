import { describe, expect, it } from "vitest";
import { plainTextFromMarkdown } from "../convex/artifactModel";
import {
  excludeAnswersForCardIds,
  formatAnswersForPrompt,
  hasPendingQuestions,
  planReviewActionable,
  resolveActiveCardId,
} from "../convex/hitlSessionLogic";

describe("hitl session logic", () => {
  it("formats answered and skipped questions for agent resume", () => {
    expect(
      formatAnswersForPrompt([
        {
          cardId: "c1",
          prompt: "Bahasa?",
          selectedOptionIds: ["id"],
          customAnswer: "Indonesia",
        },
        {
          cardId: "c2",
          prompt: "Panjang?",
          skipped: true,
        },
      ]),
    ).toContain("Bahasa?");
    expect(
      formatAnswersForPrompt([
        {
          cardId: "c2",
          prompt: "Panjang?",
          skipped: true,
        },
      ]),
    ).toContain("Skipped");
  });

  it("blocks plan review until all question cards are resolved", () => {
    const cards = [
      { kind: "question", status: "pending", order: 0, _id: "q1" },
      { kind: "plan_review", status: "pending", order: 1, _id: "p1" },
    ];
    expect(hasPendingQuestions(cards)).toBe(true);
    expect(planReviewActionable(cards)).toBe(false);

    const resolved = [
      { kind: "question", status: "answered", order: 0, _id: "q1" },
      { kind: "plan_review", status: "pending", order: 1, _id: "p1" },
    ];
    expect(hasPendingQuestions(resolved)).toBe(false);
    expect(planReviewActionable(resolved)).toBe(true);
  });

  it("allows confirmation cards without plan review", () => {
    expect(
      planReviewActionable([
        { kind: "confirmation", status: "pending", order: 0, _id: "c1" },
      ]),
    ).toBe(true);
  });

  it("drops HITL answers for rewound card ids when going Back", () => {
    expect(
      excludeAnswersForCardIds(
        [
          { cardId: "c1", prompt: "First" },
          { cardId: "c2", prompt: "Second", skipped: true },
        ],
        ["c2"],
      ),
    ).toEqual([{ cardId: "c1", prompt: "First" }]);
  });

  it("picks the lowest-order pending question as the active card", () => {
    expect(
      resolveActiveCardId([
        { _id: "q2" as Id<"hitlCards">, order: 2, kind: "question", status: "pending" },
        { _id: "q1" as Id<"hitlCards">, order: 1, kind: "question", status: "pending" },
        { _id: "p1" as Id<"hitlCards">, order: 3, kind: "plan_review", status: "pending" },
      ]),
    ).toBe("q1");
  });

  it("derives plain text from markdown consistently", () => {
    expect(plainTextFromMarkdown("# Judul\n\n**Cerita** rakyat [link](https://example.com)")).toBe(
      "Judul Cerita rakyat link",
    );
  });
});
