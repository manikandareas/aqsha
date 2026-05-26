"use client";

import {
  ChevronDownIcon,
  FileTextIcon,
  FolderTreeIcon,
} from "lucide-react";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import type { ResearchArtifact, ResearchRun } from "../types";
import { formatCompactDuration } from "../utils/datetime";
import { isRunActive } from "../utils/transcript-model";

export function AgentRunBlock({
  run,
  artifacts,
  sourceCount = 0,
}: {
  run: ResearchRun;
  artifacts: ResearchArtifact[];
  sourceCount?: number;
}) {
  const sortedSteps = run.steps.slice().sort((a, b) => a.order - b.order);
  const activeStep = sortedSteps.find((step) => step.status === "running");
  const isActive = isRunActive(run);
  const isDeep = run.mode === "deep";
  const [open, setOpen] = useState(isDeep);
  const accentClass = isDeep ? "text-lavender" : "text-primary";

  const durationLabel = formatRunDuration(run, activeStep);
  const summaryText = activeStep
    ? `Sedang mengerjakan · ${activeStep.label.toLowerCase()}`
    : run.status === "completed"
      ? run.verificationStatus === "revised"
        ? `Direvisi · ${durationLabel}`
        : run.verificationStatus === "partial" || run.verificationStatus === "failed"
          ? `Verifikasi parsial · ${durationLabel}`
          : run.sufficiencyStatus === "budget_exhausted" || run.sufficiencyStatus === "partial"
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
          onClick={() => setOpen((value) => !value)}
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
      {open ? (
        <ol className="mt-2 grid gap-1.5 pl-0">
          {sortedSteps.map((step) => (
            <AgentRunStep
              key={step.stepKey}
              step={step}
              events={(run.events ?? []).filter(
                (event) => eventStepKey(event) === step.stepKey,
              )}
              artifacts={artifacts}
              runActiveArtifactId={run.activeArtifactId}
              accentClass={accentClass}
            />
          ))}
        </ol>
      ) : null}
      {run.status === "canceled" ? (
        <p className="mt-3 text-[13px] font-medium text-muted-foreground">
          Dihentikan
        </p>
      ) : null}
    </div>
  );
}

function AgentRunStep({
  step,
  events,
  artifacts,
  runActiveArtifactId,
  accentClass,
}: {
  step: ResearchRun["steps"][number];
  events: ResearchRun["events"];
  artifacts: ResearchArtifact[];
  runActiveArtifactId?: string;
  accentClass: string;
}) {
  const expandable =
    Boolean(step.summary) || events.length > 0 || (step.artifactCount ?? 0) > 0;
  const [expanded, setExpanded] = useState(false);

  const descriptor = [
    step.sourceCount ? `${step.sourceCount} referensi` : null,
    step.artifactCount ? `${step.artifactCount} artefak` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const toneClass =
    step.status === "running"
      ? "text-foreground"
      : step.status === "completed"
        ? "text-ink-soft"
        : step.status === "failed" || step.status === "canceled"
          ? "text-coral-foreground"
          : "text-muted-foreground";

  const artifact = runActiveArtifactId
    ? artifacts.find((item) => item._id === runActiveArtifactId)
    : undefined;

  const toggle = () => {
    if (!expandable) return;
    setExpanded((value) => !value);
  };

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expandable ? expanded : undefined}
        disabled={!expandable}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 text-left text-[13px] leading-5",
          toneClass,
          expandable ? "hover:text-foreground" : "cursor-default",
        )}
      >
        <span className="min-w-0">
          {step.status === "running" ? (
            <Shimmer>{step.label}</Shimmer>
          ) : (
            step.label
          )}
          {descriptor ? (
            <span className="ml-2 text-muted-foreground">· {descriptor}</span>
          ) : null}
          {step.status === "failed" && step.failureReason ? (
            <span className="ml-2 text-coral-foreground">
              · {step.failureReason}
            </span>
          ) : null}
        </span>
        {expandable ? (
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        ) : null}
      </button>
      {expandable && expanded ? (
        <div className="mt-1.5 grid gap-2 text-[12px] leading-5 text-muted-foreground">
          {step.summary ? <p>{step.summary}</p> : null}
          {events.length > 0 ? (
            <div className="grid gap-1 border-l border-border/70 pl-3">
              {events.map((event) => (
                <div key={event._id} className="min-w-0">
                  <div className={cn("font-medium", accentClass)}>
                    {event.title}
                  </div>
                  <div className="break-words text-muted-foreground">
                    {event.summary}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {(step.artifactCount ?? 0) > 0 ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-[8px] bg-muted/45 px-2.5 py-1.5 text-[12px] text-foreground">
              <FileTextIcon className="size-3.5 text-lavender" />
              <span className="font-medium">
                {artifact?.title ?? "Artefak riset"}
              </span>
              <span className="text-mint-foreground">
                +{step.artifactCount}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function eventStepKey(event: ResearchRun["events"][number]) {
  if (event.stepKey) {
    return event.stepKey;
  }
  switch (event.eventType) {
    case "plan":
      return "planRound";
    case "query":
      return "planRound";
    case "search":
      return "discoverRoundCandidates";
    case "gap":
      return "assessRoundSufficiency";
    case "read":
      return "readRoundSources";
    case "rerank":
      return "rerankRoundCandidates";
    case "audit":
      return "verifyClaimsSemantically";
    case "artifact":
      return "persistArtifact";
    case "status":
      return "finalizeThread";
    case "failure":
    case "tool":
    default:
      return undefined;
  }
}

function formatRunDuration(
  run: ResearchRun,
  activeStep: ResearchRun["steps"][number] | undefined,
) {
  const end =
    run.completedAt ??
    run.canceledAt ??
    (activeStep ? Date.now() : run.completedAt) ??
    Date.now();
  return formatCompactDuration({ start: run.createdAt, end });
}
