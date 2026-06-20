// User-facing rendering of an HITL response. When the user answers an
// interaction, the answer is materialized as a real `chatMessages` user bubble
// so the thread reads as a normal conversation (question → answer → continue).
// This is the human-readable counterpart to `resumePromptForInteraction` in the
// agent service (which builds the model-facing prompt).

type AnswerResponse = {
  kind: "answers";
  answers: Array<{
    prompt: string;
    selectedOptionIds?: string[];
    customAnswer?: string;
    skipped?: boolean;
  }>;
};

type ApprovalResponse = {
  kind: "approval";
  approved: boolean;
  note?: string;
  workspaceId?: string;
};

// Deep-research plan gate (plan §5.2). Mirrors the `plan_decision` branch of
// `interactionResponseSchema` in @aqsha/agent-contracts; kept as a local type
// because Convex code deliberately does not depend on that package (the web side
// owns the contract adapters — see agent/queries.ts).
type PlanDecisionResponse = {
  kind: "plan_decision";
  decision: "start" | "revise" | "reject";
  editedPlan?: string;
  revisionInstruction?: string;
};

export type HitlResponse =
  | AnswerResponse
  | ApprovalResponse
  | PlanDecisionResponse;

type AskUserOption = { id: string; label: string };
type AskUserQuestion = { prompt: string; options?: AskUserOption[] };

/** Map selected option ids to their labels using the stored question payload. */
function labelsForAnswer(
  questions: AskUserQuestion[],
  prompt: string,
  selectedOptionIds: string[],
): string[] {
  const question = questions.find((q) => q.prompt === prompt);
  return selectedOptionIds.map((id) => {
    const option = question?.options?.find((o) => o.id === id);
    return option?.label ?? id;
  });
}

function parseQuestions(payloadJson: string): AskUserQuestion[] {
  try {
    const parsed = JSON.parse(payloadJson) as { questions?: AskUserQuestion[] };
    return Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch {
    return [];
  }
}

/**
 * Build the friendly text shown in the user bubble for an HITL response.
 * `payloadJson` is the interaction's stored payload (ask_user questions).
 */
export function humanizeInteractionResponse(input: {
  payloadJson: string;
  response: HitlResponse;
}): string {
  const { response } = input;
  if (response.kind === "answers") {
    const questions = parseQuestions(input.payloadJson);
    const lines = response.answers
      .map((answer) => {
        if (answer.skipped) {
          return null;
        }
        const parts: string[] = [];
        if (answer.selectedOptionIds?.length) {
          parts.push(
            labelsForAnswer(questions, answer.prompt, answer.selectedOptionIds).join(
              ", ",
            ),
          );
        }
        if (answer.customAnswer?.trim()) {
          parts.push(answer.customAnswer.trim());
        }
        return parts.length ? parts.join(" — ") : null;
      })
      .filter((line): line is string => Boolean(line));
    return lines.length ? lines.join("\n") : "Dilewati";
  }
  if (response.kind === "plan_decision") {
    if (response.decision === "start") {
      return response.editedPlan?.trim()
        ? "Mulai riset dengan rencana ini. (dengan suntingan)"
        : "Mulai riset dengan rencana ini.";
    }
    if (response.decision === "revise") {
      return response.revisionInstruction?.trim() || "Minta revisi rencana riset.";
    }
    return "Tolak rencana riset.";
  }
  if (response.approved) {
    return response.note?.trim() ? `Setujui — ${response.note.trim()}` : "Setujui";
  }
  return response.note?.trim() ? `Tolak — ${response.note.trim()}` : "Tolak";
}
