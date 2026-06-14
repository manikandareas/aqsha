"use client";

import { type ActivityEvent } from "@aqsha/agent-contracts";
import {
  CheckIcon,
  ClockIcon,
  ShieldIcon,
  XCircleIcon,
} from "@aqsha/ui/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ResearchRun } from "../types";
import { formatCompactDuration } from "../utils/datetime";
import { isArtifactToolNode } from "../utils/turn-model";
import { SubagentCard } from "./subagent-card";
import { ToolRow } from "./tool-row";
import { ChatArtifactCard } from "./chat-artifact-card";

// Activity-timeline primitives (plan §5.2) shared by the unified `AssistantTurn`:
// the nested activity rows and the status icon / tone / duration helpers. Both
// normal and deep runs now render through one flat `ActivityNodeRow` tree (a deep
// phase is just a heading row with indented children) — the legacy accordion-only
// deep timeline was removed so the two modes share one visual language.

export function ActivityNodeRow({
  node,
  devMode,
}: {
  node: ActivityEvent;
  devMode: boolean;
}) {
  // Children are already visibility-filtered by `filterByVisibility` upstream.
  const children = node.children ?? [];
  // An `executeArtifact` leaf renders as the clickable artifact card (Fase 4) —
  // this is the nested/deep path (it sits inside the write phase of a deep run);
  // a leaf tool node renders as a collapsible ToolRow (its input/result summary
  // on click); a sub-agent renders as ONE dynamic SubagentCard (Fase 3) — never
  // the old recursive nested list; everything else (phases, approvals, system)
  // keeps the plain status line + nested children.
  if (isArtifactToolNode(node)) {
    return (
      <li>
        <ChatArtifactCard node={node} />
      </li>
    );
  }
  if (node.type === "tool" && children.length === 0) {
    return (
      <li>
        <ToolRow node={node} devMode={devMode} />
      </li>
    );
  }
  if (node.type === "subagent") {
    return (
      <li>
        <SubagentCard node={node} devMode={devMode} />
      </li>
    );
  }

  return (
    <li>
      <NodeLine node={node} devMode={devMode} />
      {children.length > 0 ? (
        <ol className="mt-1.5 grid gap-1.5 border-l border-border/70 pl-3">
          {children.map((child) => (
            <ActivityNodeRow key={child.id} node={child} devMode={devMode} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** One node's status line (icon + title + description + duration), plus the
 *  technical metadata line in dev-mode. Shared by leaf rows and phase triggers. */
export function NodeLine({ node, devMode }: { node: ActivityEvent; devMode: boolean }) {
  const duration = nodeDuration(node);
  const isWorking = node.status === "running";
  const devDetail = devMode ? metadataLine(node) : null;

  return (
    <span className="min-w-0">
      <span
        className={cn("flex items-start gap-1.5 leading-5", toneClass(node.status))}
      >
        <NodeStatusIcon status={node.status} className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0">
          {isWorking ? (
            <Shimmer as="span">{node.title}</Shimmer>
          ) : (
            <span>{node.title}</span>
          )}
          {node.description ? (
            <span className="text-muted-foreground"> · {node.description}</span>
          ) : null}
          {duration ? (
            <span className="text-muted-foreground"> · {duration}</span>
          ) : null}
        </span>
      </span>
      {devDetail ? (
        <span className="mt-0.5 block pl-5 font-mono text-[11px] text-muted-foreground">
          {devDetail}
        </span>
      ) : null}
    </span>
  );
}

/** Dev-mode technical detail: the node's safe scalar metadata (raw tool name,
 *  ids, counts) — already allow-listed at the source, so safe to surface. */
export function metadataLine(node: ActivityEvent): string | null {
  if (!node.metadata) return null;
  const parts = Object.entries(node.metadata).map(([key, value]) => `${key}=${value}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function NodeStatusIcon({
  status,
  className,
}: {
  status: ActivityEvent["status"];
  className?: string;
}) {
  switch (status) {
    case "running":
      return <Spinner className={cn(className, "text-primary")} />;
    case "completed":
      return <CheckIcon className={cn(className, "text-mint-foreground")} />;
    case "failed":
      return <XCircleIcon className={cn(className, "text-coral-foreground")} />;
    case "cancelled":
      return <XCircleIcon className={cn(className, "text-muted-foreground")} />;
    case "waiting_approval":
      return <ShieldIcon className={cn(className, "text-primary")} />;
    default:
      return <ClockIcon className={cn(className, "text-muted-foreground")} />;
  }
}

// A node's TITLE tone. The meaningful states (running, waiting approval, done)
// read at full `foreground` so titles stay the anchor of each row; status itself
// is carried by the leading icon's color, not by grey-ing the whole line. Failures
// stay coral; pending/cancelled rows are muted to recede.
export function toneClass(status: ActivityEvent["status"]): string {
  switch (status) {
    case "running":
    case "waiting_approval":
    case "completed":
      return "text-foreground";
    case "failed":
      return "text-coral-foreground";
    case "cancelled":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

/** Headline node for the header: first running node (leaf-first), else waiting. */
export function findHeadlineNode(nodes: ActivityEvent[]): ActivityEvent | undefined {
  return (
    findByStatus(nodes, "running") ?? findByStatus(nodes, "waiting_approval")
  );
}

function findByStatus(
  nodes: ActivityEvent[],
  status: ActivityEvent["status"],
): ActivityEvent | undefined {
  for (const node of nodes) {
    if (node.children?.length) {
      const inner = findByStatus(node.children, status);
      if (inner) return inner;
    }
    if (node.status === status) return node;
  }
  return undefined;
}

/** Show a duration only for finished nodes that ran at least a second. */
export function nodeDuration(node: ActivityEvent): string | null {
  if (node.endedAt === undefined || (node.durationMs ?? 0) < 1000) {
    return null;
  }
  return formatCompactDuration({ start: node.startedAt, end: node.endedAt });
}

export function formatRunDuration(run: ResearchRun) {
  const end = run.completedAt ?? run.canceledAt ?? Date.now();
  return formatCompactDuration({ start: run.createdAt ?? end, end });
}
