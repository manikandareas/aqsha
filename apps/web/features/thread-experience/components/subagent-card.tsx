"use client";

import { type ActivityEvent } from "@aqsha/agent-contracts";
import { ChevronRightIcon } from "@aqsha/ui/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { runningSubagentCount, subagentCardModel } from "../utils/turn-model";
import { useChatArtifactContext } from "./chat-artifact-context";
import { NodeStatusIcon, nodeDuration, toneClass } from "./run-progress";
import { useThreadPanel } from "./thread-panel-context";

// One sub-agent as a single static card (no longer a collapsible): title =
// sub-agent label, subtitle = the dynamic summary (running → current tool via
// Shimmer, terminal → "N pencarian, M sumber"). The tool children are no longer
// inlined here — clicking the card opens the sub-agent detail side panel
// (`SubagentDetailPanel`) with the search steps + re-joined source links. On a
// compact embedded panel there is no side-panel slot, so the card stays static
// (D2 — avoids panel-in-panel). No-leak: every value comes from the contract's
// allow-listed helpers (`subagentCardModel`).
export function SubagentCard({ node }: { node: ActivityEvent }) {
  const model = subagentCardModel(node);
  const panel = useThreadPanel();
  const compact = useChatArtifactContext()?.compact ?? false;
  const duration = nodeDuration(node);

  const body = (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-start gap-1.5 leading-5",
        toneClass(node.status),
      )}
    >
      <NodeStatusIcon node={node} className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
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

  // Full surface → open the detail side panel; compact embedded panel → static
  // card (no per-sub-agent route to deep-link to).
  const canOpenPanel = !compact && panel != null;
  if (canOpenPanel) {
    return (
      <button
        type="button"
        onClick={() => panel.openSubagentPanel(node.runId, node.id)}
        aria-label={`Buka detail ${model.title}`}
        className={cn(cardBaseClass, interactiveCardClass)}
      >
        {body}
        <ChevronRightIcon className="size-4 shrink-0 self-center text-muted-foreground" />
      </button>
    );
  }

  return <div className={cardBaseClass}>{body}</div>;
}

const cardBaseClass =
  "flex w-full min-w-0 items-start gap-1.5 rounded-[10px] border border-border/70 bg-muted/20 px-3 py-2 text-left text-[13px]";
const interactiveCardClass =
  "transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

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
