import type { ResearchArtifact, ResearchRun, ResearchSource, SourceFocus } from "../types";
import { isRunActive } from "./transcript-model";

export function getResearchPanelViewState({
  artifacts,
  runs,
  rightPanelOpen,
  seenArtifactCount,
}: {
  artifacts: ResearchArtifact[] | undefined;
  runs: ResearchRun[];
  rightPanelOpen: boolean;
  seenArtifactCount: number;
}) {
  const artifactCount = artifacts?.length ?? 0;
  const hasResearchPayload =
    artifactCount > 0 || runs.some(isRunActive);
  const hasUnseenArtifact = artifactCount > seenArtifactCount;

  return {
    artifactCount,
    hasResearchPayload,
    hasUnseenArtifact,
    rightPanelOpen: hasResearchPayload && (rightPanelOpen || hasUnseenArtifact),
  };
}

export type SourceGroup = {
  key: string;
  path: string;
  label: string;
  focus: SourceFocus;
  sources: ResearchSource[];
};

export function getSourceCountsByOwner(sources: ResearchSource[]) {
  const byMessageId = new Map<string, number>();
  const byRunId = new Map<string, number>();
  for (const source of sources) {
    if (source.messageId) {
      byMessageId.set(source.messageId, (byMessageId.get(source.messageId) ?? 0) + 1);
    }
    if (source.runId) {
      byRunId.set(source.runId, (byRunId.get(source.runId) ?? 0) + 1);
    }
  }
  return { byMessageId, byRunId };
}

export function getSourceGroups(
  sources: ResearchSource[],
  runs: ResearchRun[] = [],
): SourceGroup[] {
  const runLabels = new Map(
    runs.map((run, index) => [
      run._id,
      `${run.mode === "deep" ? "Deep Research" : "Normal run"} ${index + 1}`,
    ]),
  );
  const grouped = new Map<string, SourceGroup>();
  for (const source of sources) {
    const focus = source.runId
      ? ({ type: "run", runId: source.runId } as const)
      : source.messageId
        ? ({ type: "message", messageId: source.messageId } as const)
        : null;
    if (!focus) continue;
    const key = focus.type === "run" ? `run:${focus.runId}` : `message:${focus.messageId}`;
    const label =
      focus.type === "run"
        ? (runLabels.get(focus.runId) ?? `Run ${focus.runId.slice(0, 8)}`)
        : `Assistant message ${focus.messageId.slice(0, 8)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.sources.push(source);
    } else {
      grouped.set(key, {
        key,
        path: sourceGroupPath(focus),
        label,
        focus,
        sources: [source],
      });
    }
  }
  return [...grouped.values()].map((group) => ({
    ...group,
    sources: group.sources.slice().sort((a, b) => a.createdAt - b.createdAt),
  }));
}

export function sourceGroupPath(focus: SourceFocus) {
  return focus.type === "run"
    ? `sources/runs/${focus.runId}`
    : `sources/messages/${focus.messageId}`;
}

export function selectedSourcePath(source: ResearchSource) {
  const ownerPath = source.runId
    ? sourceGroupPath({ type: "run", runId: source.runId })
    : source.messageId
      ? sourceGroupPath({ type: "message", messageId: source.messageId })
      : "sources/unassigned";
  return `${ownerPath}/${source._id}`;
}

export function defaultExpandedSourcePaths(
  groups: SourceGroup[],
  focus: SourceFocus | null,
) {
  const expanded = new Set<string>();
  for (const group of groups) {
    const matchesFocus =
      !focus ||
      (focus.type === "run" && group.focus.type === "run" && group.focus.runId === focus.runId) ||
      (focus.type === "message" &&
        group.focus.type === "message" &&
        group.focus.messageId === focus.messageId);
    if (matchesFocus) {
      expanded.add(group.path);
    }
  }
  return expanded;
}
