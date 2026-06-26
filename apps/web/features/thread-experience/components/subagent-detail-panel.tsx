"use client";

import {
  ChevronDownIcon,
  PanelLeftIcon,
  SearchIcon,
} from "@aqsha/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { panelBodyPaddingClass, panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type { ActivityEvent, ResearchSource } from "../types";
import {
  type SubagentQueryGroup,
  subagentDetailModel,
} from "../utils/subagent-detail-model";
import { NodeStatusIcon, toneClass } from "./run-progress";
import { SourceLinkRow } from "./source-link-row";

// Sub-agent detail side panel (per-sub-agent scope). Opened by clicking a
// `SubagentCard` on the full thread-detail surface. The header carries the
// sub-agent's status icon + title (no back button — close is the only chrome);
// the body lays out the sub-agent's search steps: one group per tool query,
// each a count + a drill-down list of the source links re-joined from the run
// by `discoveryQuery`. No-leak: all data flows through `subagentDetailModel`
// (allow-listed scalars + the resolved sources).
export function SubagentDetailPanel({
  node,
  sources,
  onClose,
}: {
  node: ActivityEvent;
  sources: ResearchSource[];
  onClose?: () => void;
}) {
  const model = subagentDetailModel(node, sources);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 bg-background",
          panelHeaderPaddingClass,
        )}
      >
        <NodeStatusIcon node={node} className="size-4 shrink-0" />
        <h2
          className={cn(
            "min-w-0 flex-1 truncate text-[14px] font-semibold leading-5",
            toneClass(node.status),
          )}
        >
          {model.title}
        </h2>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Tutup panel"
          >
            <PanelLeftIcon className="size-3.5 rotate-180" />
          </Button>
        ) : null}
      </header>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", panelBodyPaddingClass)}>
        {model.summary ? (
          <p className="text-[13px] text-muted-foreground">{model.summary}</p>
        ) : null}

        {model.groups.length > 0 ? (
          <div className={cn("grid gap-3", model.summary ? "mt-4" : "")}>
            {model.groups.map((group) => (
              <QueryGroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Belum ada langkah pencarian untuk sub-agen ini.
          </p>
        )}
      </div>
    </div>
  );
}

function QueryGroupCard({ group }: { group: SubagentQueryGroup }) {
  const countLabel = `${group.resultCount} sumber`;
  const hasLinks = group.links.length > 0;
  // A row is expandable when the search returned anything (resultCount > 0),
  // even if no source links could be re-joined yet — so a populated step never
  // looks identical to an empty one. A truly empty step (0 results) stays inert.
  const expandable = group.resultCount > 0;

  const header = (
    <>
      <SearchIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-5 text-foreground">
        {group.query}
      </span>
      <span className="mt-0.5 shrink-0 text-[12px] text-muted-foreground">
        {countLabel}
      </span>
    </>
  );

  if (!expandable) {
    return (
      <div className="flex min-w-0 items-start gap-2 rounded-[12px] border border-border/70 bg-card/30 px-3 py-2.5 sm:px-3.5">
        {header}
      </div>
    );
  }

  return (
    <Collapsible
      defaultOpen
      className="rounded-[12px] border border-border/70 bg-card/30"
    >
      <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-2 px-3 py-2.5 text-left sm:px-3.5">
        {header}
        <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        {hasLinks ? (
          <ul className="grid gap-0.5 px-2 pb-2">
            {group.links.map((link) => (
              <SourceLinkRow key={link.key} link={link} />
            ))}
          </ul>
        ) : (
          <p className="px-3.5 pb-3 text-[12px] text-muted-foreground">
            Sumber belum tertaut untuk langkah ini.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
