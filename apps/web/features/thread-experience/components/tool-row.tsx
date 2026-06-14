"use client";

import { type ActivityEvent } from "@aqsha/agent-contracts";
import { ChevronDownIcon } from "@aqsha/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import { toolRowModel } from "../utils/turn-model";
import { NodeStatusIcon, metadataLine, nodeDuration, toneClass } from "./run-progress";

// One tool invocation as a collapsible row (plan §6). Collapsed: status icon +
// Indonesian title (Shimmer while running) + inline summary chip from the node
// description (e.g. "12 hasil"). Expanded: the curated, allow-listed scalar
// metadata only (`toolRowModel` is default-deny — raw payload never reaches it).
// A tool with no body scalars renders as a plain, non-collapsible row.
export function ToolRow({
  node,
  devMode,
}: {
  node: ActivityEvent;
  devMode: boolean;
}) {
  const model = toolRowModel(node);
  const duration = nodeDuration(node);
  const devDetail = devMode ? metadataLine(node) : null;
  const hasBody = model.rows.length > 0 || Boolean(devDetail);

  const header = (
    <span className={cn("flex min-w-0 items-start gap-1.5 leading-5", toneClass(node.status))}>
      <NodeStatusIcon status={node.status} className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">
        {model.isRunning ? (
          <Shimmer as="span">{model.title}</Shimmer>
        ) : (
          <span>{model.title}</span>
        )}
        {model.description ? (
          <span className="text-muted-foreground"> · {model.description}</span>
        ) : null}
        {duration ? (
          <span className="text-muted-foreground"> · {duration}</span>
        ) : null}
      </span>
    </span>
  );

  if (!hasBody) {
    return <div className="min-w-0">{header}</div>;
  }

  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-1 text-left hover:text-foreground">
        {header}
        <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <dl className="mt-1.5 grid gap-1 border-l border-border/70 pl-3 text-[12px]">
          {model.rows.map((row) => (
            <div key={row.key} className="flex min-w-0 gap-1.5">
              <dt className="shrink-0 text-muted-foreground">{row.label}:</dt>
              <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
            </div>
          ))}
          {devDetail ? (
            <div className="pt-0.5 font-mono text-[11px] text-muted-foreground/80">
              {devDetail}
            </div>
          ) : null}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
