import type { Id } from "./_generated/dataModel";

export type HitlAnswer = {
  cardId: string;
  prompt: string;
  selectedOptionIds?: string[];
  customAnswer?: string;
  skipped?: boolean;
};

export function parseAnswersJson(value: string | undefined): HitlAnswer[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as HitlAnswer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function excludeAnswersForCardIds(
  answers: HitlAnswer[],
  cardIds: Iterable<string>,
): HitlAnswer[] {
  const idSet = new Set(cardIds);
  return answers.filter((answer) => !idSet.has(String(answer.cardId)));
}

export function hasPendingQuestions(cards: Array<{ kind: string; status: string }>) {
  return cards.some((card) => card.kind === "question" && card.status === "pending");
}

export function planReviewActionable(cards: Array<{ kind: string; status: string }>) {
  if (hasPendingQuestions(cards)) {
    return false;
  }
  return cards.some(
    (card) =>
      (card.kind === "plan_review" || card.kind === "confirmation") && card.status === "pending",
  );
}

export function formatAnswersForPrompt(answers: HitlAnswer[]) {
  if (answers.length === 0) {
    return "(no answers)";
  }
  return answers
    .map((answer, index) => {
      if (answer.skipped) {
        return `${index + 1}. ${answer.prompt}\n   Skipped`;
      }
      const parts: string[] = [];
      if (answer.selectedOptionIds?.length) {
        parts.push(`Selected: ${answer.selectedOptionIds.join(", ")}`);
      }
      if (answer.customAnswer) {
        parts.push(`Custom: ${answer.customAnswer}`);
      }
      return `${index + 1}. ${answer.prompt}\n   ${parts.join(" | ")}`;
    })
    .join("\n");
}

export function resolveActiveCardId<
  T extends { _id: Id<"hitlCards">; order: number; kind: string; status: string },
>(cards: T[]): Id<"hitlCards"> | undefined {
  const pendingQuestion = cards
    .filter((card) => card.kind === "question" && card.status === "pending")
    .sort((a, b) => a.order - b.order)[0];
  if (pendingQuestion) {
    return pendingQuestion._id;
  }
  const pendingPlan = cards
    .filter(
      (card) =>
        (card.kind === "plan_review" || card.kind === "confirmation") && card.status === "pending",
    )
    .sort((a, b) => a.order - b.order)[0];
  return pendingPlan?._id;
}
