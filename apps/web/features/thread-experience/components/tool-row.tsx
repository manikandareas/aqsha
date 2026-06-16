"use client";

import { type ActivityEvent } from "@aqsha/agent-contracts";
import { ChevronDownIcon, WrenchIcon, XCircleIcon } from "@aqsha/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { type ToolRowModel, toolRowModel } from "../utils/turn-model";
import { nodeDuration, toneClass } from "./run-progress";

// A tool row is identified by a wrench glyph instead of the generic checklist
// status icon (`NodeStatusIcon`) used elsewhere — it reads as "tool invocation"
// at a glance. The live/failure affordances stay: a running tool keeps the
// spinner, a failed/cancelled one keeps the error cross; every other state
// (completed/pending) shows the wrench.
function ToolStatusIcon({
  status,
  className,
}: {
  status: ActivityEvent["status"];
  className?: string;
}) {
  switch (status) {
    case "running":
      return <Spinner className={cn(className, "text-primary")} />;
    case "failed":
      return <XCircleIcon className={cn(className, "text-coral-foreground")} />;
    case "cancelled":
      return <XCircleIcon className={cn(className, "text-muted-foreground")} />;
    default:
      return <WrenchIcon className={cn(className, "text-muted-foreground")} />;
  }
}

// Body rows split into an INPUT section (what the agent asked) vs an OUTPUT
// section (what came back) — the AI-Elements Tool pattern, adapted to our
// allow-listed scalar rows. Any key not listed as input is treated as output.
const INPUT_KEYS = new Set(["query", "doi", "title", "name", "questionCount"]);
type Row = ToolRowModel["rows"][number];

// One tool invocation as a collapsible row (plan §6). Collapsed: status icon +
// Indonesian title (Shimmer while running, with the live query inline) + a small
// result badge. Expanded: the curated, allow-listed scalar metadata only
// (`toolRowModel` is default-deny — raw payload never reaches it), grouped into
// Masukan / Hasil. A tool with no body scalars renders as a plain row.
export function ToolRow({ node }: { node: ActivityEvent }) {
  const model = toolRowModel(node);
  const duration = nodeDuration(node);
  const hasBody = model.rows.length > 0;

  const inputRows = model.rows.filter((row) => INPUT_KEYS.has(row.key));
  const outputRows = model.rows.filter((row) => !INPUT_KEYS.has(row.key));
  // Surface the query inline while running so the row is meaningful before the
  // result lands (don't wait for resultCount).
  const liveQuery = model.isRunning
    ? model.rows.find((row) => row.key === "query")?.value
    : undefined;

  const header = (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-start gap-1.5 leading-5",
        toneClass(node.status),
      )}
    >
      <ToolStatusIcon status={node.status} className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">
        {model.isRunning ? (
          <Shimmer as="span">{model.title}</Shimmer>
        ) : (
          <span>{model.title}</span>
        )}
        {liveQuery ? (
          <span className="text-muted-foreground"> · {liveQuery}</span>
        ) : null}
        {duration ? (
          <span className="text-muted-foreground"> · {duration}</span>
        ) : null}
      </span>
    </span>
  );

  const resultBadge = model.description ? (
    <Badge
      variant="secondary"
      className="mt-px shrink-0 rounded-full bg-muted/60 px-2 py-0 text-[11px] font-medium text-muted-foreground"
    >
      {model.description}
    </Badge>
  ) : null;

  if (!hasBody) {
    return (
      <div className="flex min-w-0 items-start gap-1.5">
        {header}
        {resultBadge}
      </div>
    );
  }

  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-1.5 rounded-[8px] px-1.5 py-1 -mx-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {header}
        {resultBadge}
        <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="mt-1.5 grid gap-2 pl-3 text-[12px]">
          <ToolRowSection label="Masukan" rows={inputRows} />
          <ToolRowSection
            label="Hasil"
            rows={outputRows}
            tone={node.status === "failed" ? "coral" : "default"}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolRowSection({
  label,
  rows,
  tone = "default",
}: {
  label: string;
  rows: Row[];
  tone?: "default" | "coral";
}) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-1">
      <dt className="text-[11px] font-medium text-muted-foreground/70">{label}</dt>
      {rows.map((row) => (
        <div key={row.key} className="flex min-w-0 gap-1.5">
          <dt className="shrink-0 text-muted-foreground">{row.label}:</dt>
          <dd
            className={cn(
              "min-w-0 break-words",
              tone === "coral" ? "text-coral-foreground" : "text-foreground",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
