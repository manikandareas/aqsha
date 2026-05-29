import type { ChatMessage, ResearchRun, TranscriptEntry } from "../types";

export function sortTranscriptMessages(messages: ChatMessage[]) {
  return [...messages].sort(
    (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
  );
}

export function isRunActive(run: ResearchRun) {
  return (
    run.status === "queued" ||
    run.status === "running" ||
    run.status === "waiting"
  );
}

export function interleaveRunsWithMessages(
  messages: ChatMessage[],
  runs: ResearchRun[],
): TranscriptEntry[] {
  if (runs.length === 0) {
    return messages.map((message) => ({ kind: "message", message }));
  }

  const usedRunIds = new Set<string>();
  const runsByPrompt = new Map<string, ResearchRun[]>();
  for (const run of runs) {
    if (!run.promptMessageId) continue;
    const bucket = runsByPrompt.get(run.promptMessageId) ?? [];
    bucket.push(run);
    runsByPrompt.set(run.promptMessageId, bucket);
  }

  const entries: TranscriptEntry[] = [];
  let pendingRuns: ResearchRun[] = [];

  for (const message of messages) {
    if (message.role !== "user" && pendingRuns.length > 0) {
      for (const run of pendingRuns) {
        entries.push({ kind: "run", run });
      }
      pendingRuns = [];
    }

    entries.push({ kind: "message", message });

    if (message.role === "user") {
      const bucket = runsByPrompt.get(message.id) ?? [];
      for (const run of bucket) {
        usedRunIds.add(run._id);
        pendingRuns.push(run);
      }
    }
  }

  for (const run of pendingRuns) {
    entries.push({ kind: "run", run });
  }

  for (const run of runs) {
    if (!usedRunIds.has(run._id)) {
      entries.push({ kind: "run", run });
    }
  }

  return entries;
}

export function interleavedEntryKey(entry: TranscriptEntry) {
  return entry.kind === "run"
    ? `run:${entry.run._id}`
    : `message:${entry.message.key ?? entry.message.id}`;
}

export function entryGapClass(
  previous: TranscriptEntry | undefined,
  current: TranscriptEntry,
) {
  if (previous?.kind === "run" && current.kind === "message") {
    if (previous.run.status === "completed" && current.message.role === "assistant") {
      return "mt-1";
    }
    return "mt-5";
  }
  return "mt-7";
}
