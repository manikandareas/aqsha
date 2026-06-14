"use client";

import { type ActivityEvent } from "@aqsha/agent-contracts";
import { ChevronDownIcon } from "@aqsha/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { runningSubagentCount, subagentCardModel } from "../utils/turn-model";
import { ActivityNodeRow, NodeStatusIcon, nodeDuration, toneClass } from "./run-progress";

// One sub-agent as a single dynamic card (plan §8), replacing the old recursive
// `ActivityNodeRow` nesting. Title = sub-agent label; the summary line is dynamic
// (running → current tool via Shimmer, terminal → "N pencarian, M sumber"). Tool
// children are hidden behind an expand and reused through `ActivityNodeRow`
// (tool → `ToolRow`); dev-mode reveals them inline. No-leak: every value comes
// from the contract's allow-listed helpers (`subagentCardModel`).
export function SubagentCard({
  node,
  devMode,
}: {
  node: ActivityEvent;
  devMode: boolean;
}) {
  const model = subagentCardModel(node, { devMode });
  const duration = nodeDuration(node);
  const hasChildren = model.children.length > 0;

  const headline = (
    <span
      className={cn(
        "flex min-w-0 items-start gap-1.5 leading-5",
        toneClass(node.status),
      )}
    >
      <NodeStatusIcon status={node.status} className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="font-medium text-foreground">{model.title}</span>
        {duration ? (
          <span className="text-muted-foreground"> · {duration}</span>
        ) : null}
        {model.summary ? (
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {model.isRunning ? (
              <Shimmer as="span">{model.summary}</Shimmer>
            ) : (
              model.summary
            )}
          </span>
        ) : null}
      </span>
    </span>
  );

  const childList = hasChildren ? (
    <ol className="mt-1.5 grid gap-1.5 border-l border-border/70 pl-3">
      {model.children.map((child) => (
        <ActivityNodeRow key={child.id} node={child} devMode={devMode} />
      ))}
    </ol>
  ) : null;

  return (
    <div className="rounded-[10px] border border-border/70 bg-muted/20 px-3 py-2 text-[13px]">
      {hasChildren && !model.forceExpanded ? (
        <Collapsible className="min-w-0">
          <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-1 text-left hover:text-foreground">
            {headline}
            <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden">{childList}</CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          {headline}
          {childList}
        </>
      )}
    </div>
  );
}

// "N berjalan" chip (plan §8): how many sub-agents in `nodes` are still running,
// plus the run's waiting time. Renders nothing unless at least one is running.
export function SubagentRunningChip({
  nodes,
  durationLabel,
  className,
}: {
  nodes: ActivityEvent[];
  durationLabel?: string;
  className?: string;
}) {
  const count = runningSubagentCount(nodes);
  if (count === 0) return null;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] border border-border/70 bg-muted/35 px-2 py-1 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      <Spinner className="size-3 text-primary" />
      <span className="min-w-0">
        <Shimmer as="span">{`${count} berjalan`}</Shimmer>
        {durationLabel ? <span> · Menunggu {durationLabel}</span> : null}
      </span>
    </div>
  );
}
