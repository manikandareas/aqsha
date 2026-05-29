"use client";

import { CornerDownLeftIcon, Loader2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkspacePickerInline } from "@/features/workspaces/components/workspace-picker-inline";
import {
  hitlCardBodyClass,
  hitlCardFooterClass,
  hitlCardHeaderClass,
  hitlCardShellClass,
} from "./hitl-card-layout";

/** UI for agent `presentPlan` tool — Review Plan card */
export function HitlPlanReviewCard({
  title,
  summary,
  planBullets,
  requiresWorkspacePick,
  workspaceName,
  disabled,
  onReject,
  onBuild,
}: {
  title: string;
  summary?: string;
  planBullets?: string[];
  requiresWorkspacePick?: boolean;
  workspaceName?: string;
  disabled?: boolean;
  onReject: () => void;
  onBuild: (workspaceId?: string) => void;
}) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const canBuild = !requiresWorkspacePick || Boolean(selectedWorkspaceId);
  const hasBullets = Boolean(planBullets?.length);

  return (
    <Plan
      defaultOpen={!hasBullets}
      className={cn("border-border/70", hitlCardShellClass)}
      data-hitl-tool="presentPlan"
    >
      <PlanHeader className={cn("flex-row items-center justify-between", hitlCardHeaderClass)}>
        <span className="text-[10px] font-medium text-muted-foreground">Review plan</span>
        <PlanAction>
          <Button
            type="button"
            aria-label="Tolak rencana"
            disabled={disabled}
            variant="ghost"
            size="icon-sm"
            className="size-6 text-muted-foreground"
            onClick={onReject}
          >
            <XIcon className="size-3" />
          </Button>
        </PlanAction>
      </PlanHeader>

      <div className={hitlCardBodyClass}>
        <PlanTitle className="text-[12px] leading-snug">{title}</PlanTitle>
        {summary ? (
          <PlanDescription className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {summary}
          </PlanDescription>
        ) : null}
        {!requiresWorkspacePick && workspaceName ? (
          <p className="mt-1 text-[10px] text-muted-foreground/80">→ {workspaceName}</p>
        ) : null}
        {hasBullets ? (
          <div className="mt-1.5 flex items-center justify-between border-t border-border/40 pt-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">Detail rencana</span>
            <PlanTrigger className="size-6 [&_svg]:size-3" />
          </div>
        ) : null}
      </div>

      {hasBullets ? (
        <PlanContent className={cn("border-t border-border/40 pt-0", hitlCardBodyClass)}>
          <ul className="space-y-0.5 text-[10px] leading-snug text-foreground/80">
            {planBullets!.map((bullet) => (
              <li key={bullet} className="flex gap-1">
                <span
                  aria-hidden
                  className="mt-1 size-0.5 shrink-0 rounded-full bg-muted-foreground/45"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </PlanContent>
      ) : null}

      <PlanFooter className={cn("justify-end", hitlCardFooterClass)}>
        {requiresWorkspacePick ? (
          <WorkspacePickerInline
            variant="compact"
            selectedWorkspaceId={selectedWorkspaceId}
            onSelect={setSelectedWorkspaceId}
            className="mr-auto min-w-0 flex-1"
          />
        ) : null}
        <Button
          type="button"
          size="sm"
          className={cn("h-6 shrink-0 gap-0.5 px-2.5 text-[11px] font-medium")}
          disabled={disabled || !canBuild}
          onClick={() => onBuild(selectedWorkspaceId ?? undefined)}
        >
          {disabled ? <Loader2Icon className="size-3 animate-spin" /> : null}
          Build
          <CornerDownLeftIcon className="size-2.5 opacity-60" />
        </Button>
      </PlanFooter>
    </Plan>
  );
}
