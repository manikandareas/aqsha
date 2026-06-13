"use client";

import { type ActivityEvent, filterByVisibility } from "@aqsha/agent-contracts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aqsha/ui/components/accordion";
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  Code2Icon,
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
// nodes render by default; a dev-mode toggle also reveals `"developer"` nodes
// (Fase 3). Deep runs group each phase in a collapsible accordion. The final
// answer stays a separate MessageRow.
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
  const nonRunNodes = activity.filter((node) => node.type !== "run");

  const isActive = isRunActive(run);
  const isDeep = run.mode === "deep";
  // Expanded while active, collapsed once done — but a manual toggle wins.
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const [devMode, setDevMode] = useState(false);
  const open = userToggled ?? (isActive || isDeep);
  const accentClass = isDeep ? "text-lavender" : "text-primary";

  // Visibility gate (recursively filters children): users see `user` nodes;
  // dev-mode additionally reveals `developer` nodes. `hidden` never renders.
  const timeline = filterByVisibility(nonRunNodes, { developer: devMode });

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
        {open && nonRunNodes.length > 0 ? (
          <button
            type="button"
            aria-pressed={devMode}
            title={devMode ? "Sembunyikan detail pengembang" : "Mode pengembang"}
            onClick={() => setDevMode((value) => !value)}
            className={cn(
              "inline-flex shrink-0 items-center rounded-[7px] border border-border/70 p-1 transition-colors hover:text-foreground",
              devMode ? "bg-muted/60 text-foreground" : "text-muted-foreground",
            )}
          >
            <Code2Icon className="size-3.5" />
          </button>
        ) : null}
        {sourceCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-border/70 bg-muted/35 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <FolderTreeIcon className="size-3.5" />
            <span>{sourceCount}</span>
          </span>
        ) : null}
      </div>
      {open && timeline.length > 0 ? (
        isDeep ? (
          <DeepPhaseTimeline nodes={timeline} devMode={devMode} />
        ) : (
          <ol className="mt-2 grid gap-1.5 pl-0">
            {timeline.map((node) => (
              <ActivityNodeRow key={node.id} node={node} devMode={devMode} />
            ))}
          </ol>
        )
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

// Deep runs: each top-level phase node is a collapsible accordion section; any
// non-phase top-level node renders inline. A live deep run emits phases one at a
// time, so the accordion is CONTROLLED: phases start open and a newly-arrived
// phase auto-opens, but a phase the user collapsed stays collapsed across later
// phase boundaries. We track only the user's explicit collapses; open = all
// phases minus those.
function DeepPhaseTimeline({
  nodes,
  devMode,
}: {
  nodes: ActivityEvent[];
  devMode: boolean;
}) {
  const phaseIds = nodes.flatMap((node) => (node.type === "phase" ? [node.id] : []));
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const openIds = phaseIds.filter((id) => !collapsed.includes(id));
  if (phaseIds.length === 0) {
    return (
      <ol className="mt-2 grid gap-1.5 pl-0">
        {nodes.map((node) => (
          <ActivityNodeRow key={node.id} node={node} devMode={devMode} />
        ))}
      </ol>
    );
  }
  return (
    <Accordion
      type="multiple"
      value={openIds}
      onValueChange={(open) =>
        setCollapsed(phaseIds.filter((id) => !open.includes(id)))
      }
      className="mt-2"
    >
      {nodes.map((node) =>
        node.type === "phase" ? (
          <AccordionItem key={node.id} value={node.id} className="border-b-0">
            <AccordionTrigger className="py-1.5 text-[13px] font-medium text-foreground no-underline hover:no-underline">
              <NodeLine node={node} devMode={devMode} />
            </AccordionTrigger>
            <AccordionContent className="pb-1 pt-0">
              {node.children && node.children.length > 0 ? (
                <ol className="grid gap-1.5 border-l border-border/70 pl-3">
                  {node.children.map((child) => (
                    <ActivityNodeRow key={child.id} node={child} devMode={devMode} />
                  ))}
                </ol>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        ) : (
          <ol key={node.id} className="grid gap-1.5 py-1.5 pl-0">
            <ActivityNodeRow node={node} devMode={devMode} />
          </ol>
        ),
      )}
    </Accordion>
  );
}

function ActivityNodeRow({
  node,
  devMode,
}: {
  node: ActivityEvent;
  devMode: boolean;
}) {
  // Children are already visibility-filtered by `filterByVisibility` upstream.
  const children = node.children ?? [];

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
function NodeLine({ node, devMode }: { node: ActivityEvent; devMode: boolean }) {
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
        <span className="mt-0.5 block pl-5 font-mono text-[11px] text-muted-foreground/80">
          {devDetail}
        </span>
      ) : null}
    </span>
  );
}

/** Dev-mode technical detail: the node's safe scalar metadata (raw tool name,
 *  ids, counts) — already allow-listed at the source, so safe to surface. */
function metadataLine(node: ActivityEvent): string | null {
  if (!node.metadata) return null;
  const parts = Object.entries(node.metadata).map(([key, value]) => `${key}=${value}`);
  return parts.length > 0 ? parts.join(" · ") : null;
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
