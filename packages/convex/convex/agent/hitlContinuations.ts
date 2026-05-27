const AFTER_ANSWERS_TAIL: Record<string, string> = {
  workspace:
    "Continue the /workspace flow. If you still need clarification, call askHuman again. Otherwise call presentWorkspacePlan with the proposed workspace name.",
  artifact:
    "Continue the /artifact flow. If you still need clarification, call askHuman again. Otherwise call presentPlan with plan bullets but do NOT include final markdown content yet.",
};

export function buildAfterAnswersContinuation(args: {
  commandId?: string;
  prompt: string;
  answersContext: string;
}) {
  const tail = AFTER_ANSWERS_TAIL[args.commandId ?? "artifact"] ?? AFTER_ANSWERS_TAIL.artifact;
  return [
    args.prompt,
    "",
    "The user answered your clarification questions:",
    args.answersContext,
    "",
    tail,
  ].join("\n");
}

export function buildApprovedArtifactExecutionPrompt(args: {
  prompt: string;
  answersContext: string;
  cardTitle: string;
  cardSummary: string;
  planBullets?: string[];
}) {
  return [
    args.prompt,
    "",
    "The user approved your plan. Execute it now.",
    args.answersContext ? `Clarifications:\n${args.answersContext}` : "",
    "",
    `Approved plan:\nTitle: ${args.cardTitle}\nSummary: ${args.cardSummary}`,
    args.planBullets?.length
      ? `Steps:\n${args.planBullets.map((bullet) => `- ${bullet}`).join("\n")}`
      : "",
    "",
    "Generate the full Markdown content and call executeWorkspaceArtifact exactly once.",
  ]
    .filter(Boolean)
    .join("\n");
}
