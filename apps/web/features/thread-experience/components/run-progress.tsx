"use client";

import type { ActivityEvent } from "@aqsha/agent-contracts";
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  FolderTreeIcon,
  ShieldIcon,
  XCircleIcon,
} from "@aqsha/ui/icons";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ResearchArtifact, ResearchRun, ResearchSource } from "../types";
import { formatCompactDuration } from "../utils/datetime";
import { isRunActive } from "../utils/transcript-model";
import { CitationIntegritySummary } from "./citation-integrity";

const emptySources: ResearchSource[] = [];
const emptyActivity: ActivityEvent[] = [];

// Render the normalized activity timeline (plan §5.2): a collapsible run header
// + nested tool / sub-agent / phase / approval nodes derived from the events
// already streamed onto the run via Convex reactivity. Only `visibility: "user"`
// nodes render; the final answer stays a separate MessageRow.
export function AgentRunBlock({
  run,
  sourceCount = 0,
  sources = emptySources,
}: {
  run: ResearchRun;
  artifacts?: ResearchArtifact[];
  sourceCount?: number;
  sources?: ResearchSource[];
}) {
  const activity = run.activity ?? emptyActivity;
  const runNode = activity.find((node) => node.type === "run");
  const timeline = activity.filter(
    (node) => node.type !== "run" && node.visibility === "user",
  );

  const isActive = isRunActive(run);
  const isDeep = run.mode === "deep";
  // Expanded while active, collapsed once done — but a manual toggle wins.
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const open = userToggled ?? (isActive || isDeep);
  const accentClass = isDeep ? "text-lavender" : "text-primary";

  const durationLabel = formatRunDuration(run);
  const headlineNode = findHeadlineNode(timeline);
  const summaryText = isActive
    ? headlineNode?.status === "running"
      ? `Sedang mengerjakan · ${headlineNode.title.toLowerCase()}`
      : headlineNode?.status === "waiting_approval"
        ? headlineNode.title
        : (runNode?.title ?? "Sedang mengerjakan")
    : run.status === "completed"
      ? run.verificationStatus === "revised"
        ? `Direvisi · ${durationLabel}`
        : run.verificationStatus === "partial" || run.verificationStatus === "failed"
          ? `Verifikasi parsial · ${durationLabel}`
          : run.sufficiencyStatus === "budget_exhausted" ||
              run.sufficiencyStatus === "partial"
            ? `Parsial · ${durationLabel}`
            : `Selesai · ${durationLabel}`
      : run.status === "failed"
        ? "Berhenti sebelum selesai"
        : run.status === "canceled"
          ? "Dihentikan"
          : `Berjalan · ${durationLabel}`;

  return (
    <div className="w-full text-[13px] text-muted-foreground">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setUserToggled(!open)}
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-foreground"
        >
          {isActive ? (
            <Shimmer className="font-medium">{summaryText}</Shimmer>
          ) : (
            <span className={cn("font-medium", accentClass)}>{summaryText}</span>
          )}
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {sourceCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-border/70 bg-muted/35 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <FolderTreeIcon className="size-3.5" />
            <span>{sourceCount}</span>
          </span>
        ) : null}
      </div>
      {open && timeline.length > 0 ? (
        <ol className="mt-2 grid gap-1.5 pl-0">
          {timeline.map((node) => (
            <ActivityNodeRow key={node.id} node={node} />
          ))}
        </ol>
      ) : null}
      {open && !isActive && run.status === "failed" && runNode?.description ? (
        <p className="mt-2 break-words text-[13px] text-coral-foreground">
          {runNode.description}
        </p>
      ) : null}
      {open && isDeep ? (
        <CitationIntegritySummary
          sources={sources}
          runCompleted={run.status === "completed"}
        />
      ) : null}
    </div>
  );
}

function ActivityNodeRow({ node }: { node: ActivityEvent }) {
  const children = (node.children ?? []).filter(
    (child) => child.visibility === "user",
  );
  const duration = nodeDuration(node);
  const isWorking = node.status === "running";

  return (
    <li>
      <div className={cn("flex items-start gap-1.5 leading-5", toneClass(node.status))}>
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
      </div>
      {children.length > 0 ? (
        <ol className="mt-1.5 grid gap-1.5 border-l border-border/70 pl-3">
          {children.map((child) => (
            <ActivityNodeRow key={child.id} node={child} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function NodeStatusIcon({
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
      return <ShieldIcon className={cn(className, "text-lavender")} />;
    default:
      return <ClockIcon className={cn(className, "text-muted-foreground")} />;
  }
}

function toneClass(status: ActivityEvent["status"]): string {
  switch (status) {
    case "running":
    case "waiting_approval":
      return "text-foreground";
    case "completed":
      return "text-ink-soft";
    case "failed":
      return "text-coral-foreground";
    case "cancelled":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

/** Headline node for the header: first running node (leaf-first), else waiting. */
function findHeadlineNode(nodes: ActivityEvent[]): ActivityEvent | undefined {
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
function nodeDuration(node: ActivityEvent): string | null {
  if (node.endedAt === undefined || (node.durationMs ?? 0) < 1000) {
    return null;
  }
  return formatCompactDuration({ start: node.startedAt, end: node.endedAt });
}

function formatRunDuration(run: ResearchRun) {
  const end = run.completedAt ?? run.canceledAt ?? Date.now();
  return formatCompactDuration({ start: run.createdAt, end });
}
