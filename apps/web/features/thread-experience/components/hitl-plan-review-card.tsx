"use client";

import { CornerDownLeftIcon, Loader2Icon } from "@aqsha/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspacePickerInline } from "@/features/workspaces/components/workspace-picker-inline";

/** Shared inline review prompt for the approval tools: `proposeArtifact`,
 * `createWorkspace`, and `renameWorkspace` (plus `runComputation` via the generic
 * fallback). Renders as natural agent prose (no card chrome) with inline
 * approve/decline controls. The deep-research plan gate uses its own editable
 * `ResearchPlanReviewCard` instead. */
export function HitlPlanReviewCard({
  title,
  summary,
  planBullets,
  requiresWorkspacePick,
  workspaceName,
  disabled,
  submitting,
  onReject,
  onBuild,
}: {
  title: string;
  summary?: string;
  planBullets?: string[];
  requiresWorkspacePick?: boolean;
  workspaceName?: string;
  /** Non-interactive (a submit is in flight OR the run is terminal). */
  disabled?: boolean;
  /** A response submit is actually in flight — drives the button spinner only. */
  submitting?: boolean;
  onReject: () => void;
  onBuild: (workspaceId?: string) => void;
}) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const canBuild = !requiresWorkspacePick || Boolean(selectedWorkspaceId);
  const hasBullets = Boolean(planBullets?.length);

  return (
    <div
      data-hitl-tool="proposeArtifact"
      className="flex w-full min-w-0 flex-col text-[13px] leading-[1.55]"
    >
      <p className="text-[13px] font-medium leading-snug text-foreground">{title}</p>
      {summary ? (
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{summary}</p>
      ) : null}
      {!requiresWorkspacePick && workspaceName ? (
        <p className="mt-0.5 text-[12px] text-muted-foreground/80">→ {workspaceName}</p>
      ) : null}
      {hasBullets ? (
        <ul className="mt-1.5 space-y-0.5 text-[12px] leading-snug text-foreground/80">
          {planBullets!.map((bullet) => (
            <li key={bullet} className="flex gap-1.5">
              <span
                aria-hidden
                className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/45"
              />
              <span className="min-w-0">{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-row items-center justify-end gap-1">
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
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          disabled={disabled}
          onClick={onReject}
        >
          Tolak
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-6 shrink-0 gap-0.5 px-2.5 text-[11px] font-medium"
          disabled={disabled || !canBuild}
          onClick={() => onBuild(selectedWorkspaceId ?? undefined)}
        >
          {submitting ? <Loader2Icon className="size-3 animate-spin" /> : null}
          Setujui
          <CornerDownLeftIcon className="size-2.5 opacity-60" />
        </Button>
      </div>
    </div>
  );
}
