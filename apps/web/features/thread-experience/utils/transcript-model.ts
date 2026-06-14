import type { ChatMessage, ResearchRun } from "../types";

export function sortTranscriptMessages(messages: ChatMessage[]) {
  return Array.from(messages).sort(
    (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
  );
}

export function isRunActive(run: ResearchRun) {
  return (
    run.status === "queued" ||
    run.status === "running" ||
    run.status === "waiting" ||
    run.status === "waiting_hitl"
  );
}
