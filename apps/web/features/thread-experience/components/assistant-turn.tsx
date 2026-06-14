"use client";

import { type ActivityEvent, filterByVisibility } from "@aqsha/agent-contracts";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  Code2Icon,
  FolderTreeIcon,
} from "@aqsha/ui/icons";
import { Fragment, useState, type ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { AgentRunId } from "@/lib/convex-refs";
import { cn } from "@/lib/utils";
import type { ChatMessage, ResearchRun, ResearchSource } from "../types";
import { buildTurnParts } from "../utils/turn-model";
import { isRunActive } from "../utils/transcript-model";
import { CitationIntegritySummary } from "./citation-integrity";
import { MessageHitlParts } from "./message-hitl-parts";
import {
  AssistantMessageActions,
  MessageSourceCount,
  StreamingResponse,
  getMessageText,
} from "./message-row";
import {
  ActivityNodeRow,
  NodeLine,
  findHeadlineNode,
  formatRunDuration,
} from "./run-progress";
import { SubagentCard, SubagentRunningChip } from "./subagent-card";
import { ToolRow } from "./tool-row";
import { ChatArtifactCard } from "./chat-artifact-card";
import type { HitlActions } from "./use-hitl-resume";

const emptySources: ResearchSource[] = [];

// One assistant turn (answer-stream redesign Fase 2): the run header (live
// summary, dev-mode toggle, source chip), the ordered reasoning ↔ tool ↔ text
// timeline (`buildTurnParts`), the deep-run citation summary, and finally the
// canonical answer + message actions. Replaces the legacy sibling pair
// `AgentRunBlock` + `MessageRow` — one turn per RUN (plan §3/§5).
export function AssistantTurn({
  message,
  run,
  hitlMessages,
  onRetryRun,
  runSourceCount = 0,
  messageSourceCount = 0,
  sources = emptySources,
  hitlActions,
  hitlDisabled,
}: {
  message?: ChatMessage;
  run?: ResearchRun;
  /** Pending HITL synthetic messages for this run (single-rendered at approval). */
  hitlMessages?: ChatMessage[];
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
  runSourceCount?: number;
  messageSourceCount?: number;
  sources?: ResearchSource[];
  hitlActions?: HitlActions;
  hitlDisabled?: boolean;
}) {
  const [devMode, setDevMode] = useState(false);
  // null = auto (expanded while the run is active, collapsed once it settles);
  // a non-null value is the user's manual override and wins for the turn's life.
  const [manualProcessOpen, setManualProcessOpen] = useState<boolean | null>(null);

  const isActive = run ? isRunActive(run) : false;
  const isDeep = run?.mode === "deep";
  const parts = buildTurnParts(message, run);
  const pendingHitl = hitlMessages ?? [];

  const isStreaming = message?.status === "streaming";
  const isFailed = message?.status === "failed";
  const text = message ? getMessageText(message) : "";
  const hasText = Boolean(text.trim());

  const hasNodeParts = parts.some(
    (part) =>
      part.kind === "tool" ||
      part.kind === "artifact" ||
      part.kind === "subagent" ||
      part.kind === "phase" ||
      part.kind === "approval" ||
      part.kind === "system",
  );

  // Visibility gate per node (recursively prunes children); users see `user`
  // nodes, dev-mode also reveals `developer` nodes. `hidden` never renders.
  const visible = (node: ActivityEvent): ActivityEvent | undefined =>
    filterByVisibility([node], { developer: devMode })[0];

  const hitlCards = (key: string) =>
    hitlActions && pendingHitl.length > 0 ? (
      <Fragment key={key}>
        {pendingHitl.map((hitl) => (
          <MessageHitlParts
            key={hitl.id}
            message={hitl}
            actions={hitlActions}
            disabled={hitlDisabled}
          />
        ))}
      </Fragment>
    ) : null;

  // ── ordered timeline → React elements ──────────────────────────────────────
  const elements: ReactNode[] = [];
  let nodeBuffer: ReactNode[] = [];
  let listSeq = 0;
  let hitlRendered = false;
  const flushNodes = () => {
    if (nodeBuffer.length === 0) return;
    elements.push(
      <ol key={`nodes-${listSeq++}`} className="grid gap-1.5 pl-0">
        {nodeBuffer}
      </ol>,
    );
    nodeBuffer = [];
  };

  // Top-level sub-agents are a defensive case (today they only appear nested under
  // a deep-research phase row). When one does surface at the top level, render the
  // "N berjalan" chip once above the cards.
  const topLevelSubagentNodes = parts.flatMap((part) =>
    part.kind === "subagent" ? [part.node] : [],
  );
  let subagentChipShown = false;

  for (const part of parts) {
    if (part.kind === "reasoning") {
      flushNodes();
      elements.push(
        <div key={part.id} className="min-w-0">
          <Reasoning text={part.text} isThinking={part.isThinking} />
        </div>,
      );
      continue;
    }
    if (part.kind === "intermediate-text") {
      flushNodes();
      elements.push(
        <MessageResponse key={part.id} className="aqsha-prose aqsha-prose-message min-w-0">
          {part.text}
        </MessageResponse>,
      );
      continue;
    }
    const node = visible(part.node);
    if (!node) continue;
    if (part.kind === "approval") {
      if (hitlActions && pendingHitl.length > 0 && !hitlRendered) {
        hitlRendered = true;
        nodeBuffer.push(<li key={part.id}>{hitlCards(`${part.id}-card`)}</li>);
      } else {
        nodeBuffer.push(
          <li key={part.id}>
            <NodeLine node={node} devMode={devMode} />
          </li>,
        );
      }
    } else if (part.kind === "tool") {
      nodeBuffer.push(
        <li key={part.id}>
          <ToolRow node={node} devMode={devMode} />
        </li>,
      );
    } else if (part.kind === "artifact") {
      nodeBuffer.push(
        <li key={part.id}>
          <ChatArtifactCard node={node} />
        </li>,
      );
    } else if (part.kind === "subagent") {
      if (
        !subagentChipShown &&
        topLevelSubagentNodes.some((subagent) => subagent.status === "running")
      ) {
        subagentChipShown = true;
        nodeBuffer.push(
          <li key={`${part.id}-chip`}>
            <SubagentRunningChip
              nodes={topLevelSubagentNodes}
              durationLabel={run ? formatRunDuration(run) : undefined}
            />
          </li>,
        );
      }
      nodeBuffer.push(
        <li key={part.id}>
          <SubagentCard node={node} devMode={devMode} />
        </li>,
      );
    } else {
      // phase (both modes) / system → flat heading row with indented children.
      nodeBuffer.push(<ActivityNodeRow key={part.id} node={node} devMode={devMode} />);
    }
  }
  flushNodes();
  // A pending HITL with no approval anchor (legacy fallback) renders at the end.
  if (hitlActions && pendingHitl.length > 0 && !hitlRendered) {
    elements.push(<div key="hitl-end">{hitlCards("hitl-end-card")}</div>);
    hitlRendered = true;
  }

  // The whole process timeline (reasoning ↔ tools ↔ sub-agents ↔ artifacts —
  // everything but the final answer) collapses under the run header. Auto-expanded
  // while the run is active so live progress is visible, then auto-collapsed once
  // it settles to keep the answer prominent; a pending approval forces it open so
  // the HITL card can never be hidden. A manual toggle overrides the auto state.
  const hasProcess = elements.length > 0;
  const mustShowProcess = pendingHitl.length > 0;
  const processOpen = mustShowProcess
    ? true
    : manualProcessOpen !== null
      ? manualProcessOpen
      : isActive;

  const processTimeline = (
    <div className="mt-2 grid gap-2 text-[13px] text-muted-foreground">
      {elements}
    </div>
  );

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      {run && hasProcess ? (
        <Collapsible
          open={processOpen}
          onOpenChange={(next) => setManualProcessOpen(next)}
          className="min-w-0"
        >
          <RunHeader
            run={run}
            devMode={devMode}
            onToggleDevMode={() => setDevMode((value) => !value)}
            showDevToggle={hasNodeParts}
            sourceCount={runSourceCount}
            collapsible
            open={processOpen}
          />
          <CollapsibleContent className="overflow-hidden">
            {processTimeline}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          {run ? (
            <RunHeader
              run={run}
              devMode={devMode}
              onToggleDevMode={() => setDevMode((value) => !value)}
              showDevToggle={hasNodeParts}
              sourceCount={runSourceCount}
            />
          ) : null}
          {hasProcess ? processTimeline : null}
        </>
      )}

      {isDeep ? (
        <CitationIntegritySummary
          sources={sources}
          runCompleted={run?.status === "completed"}
        />
      ) : null}

      <Message from="assistant" className="mt-3 min-w-0 overflow-x-hidden">
        <MessageContent className="w-full min-w-0 overflow-hidden bg-transparent p-0 text-[13px] leading-[1.55] text-foreground">
          {isFailed ? (
            <div className="flex items-start gap-2 rounded-[10px] border border-coral-soft-border bg-coral-soft px-3 py-2.5 text-[13px] font-medium leading-[1.55] text-coral-foreground">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {hasText
                  ? text
                  : "Astra belum bisa menjawab pesan ini. Coba kirim ulang sebentar lagi."}
              </span>
            </div>
          ) : hasText ? (
            isStreaming ? (
              <StreamingResponse key={message!.id} text={text} />
            ) : (
              <MessageResponse className="aqsha-prose aqsha-prose-message">
                {text}
              </MessageResponse>
            )
          ) : isActive && elements.length === 0 ? (
            <ThreadActivityFallback />
          ) : null}
        </MessageContent>
        <MessageSourceCount sourceCount={messageSourceCount} />
        {hasText ? (
          <AssistantMessageActions
            assistantRun={run}
            text={text}
            onRetryRun={onRetryRun}
          />
        ) : null}
      </Message>
    </div>
  );
}

function ThreadActivityFallback() {
  // Shown only before any reasoning/tool part or answer text exists (a run that
  // just started); the run header Shimmer covers the rest.
  return <Shimmer className="font-medium">Sedang menyiapkan jawaban…</Shimmer>;
}

function RunHeader({
  run,
  devMode,
  onToggleDevMode,
  showDevToggle,
  sourceCount,
  collapsible = false,
  open = false,
}: {
  run: ResearchRun;
  devMode: boolean;
  onToggleDevMode: () => void;
  showDevToggle: boolean;
  sourceCount: number;
  // When true, the summary doubles as the trigger that collapses the process
  // timeline below it (a chevron is appended). The dev-mode toggle and source
  // chip stay as sibling controls so they are not nested inside the button.
  collapsible?: boolean;
  open?: boolean;
}) {
  const isActive = isRunActive(run);
  const activity = run.activity ?? [];
  const runNode = activity.find((node) => node.type === "run");
  const nonRunNodes = activity.filter((node) => node.type !== "run");
  const timeline = filterByVisibility(nonRunNodes, { developer: devMode });
  const headlineNode = findHeadlineNode(timeline);
  const durationLabel = formatRunDuration(run);

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
    <div className="text-[13px] text-muted-foreground">
      <div className="flex items-center gap-2">
        {collapsible ? (
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-left transition-colors hover:text-foreground">
            {isActive ? (
              <Shimmer as="span" className="min-w-0 flex-1 font-medium">
                {summaryText}
              </Shimmer>
            ) : (
              <span className="min-w-0 flex-1 font-medium text-foreground">
                {summaryText}
              </span>
            )}
            <ChevronDownIcon
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                open ? "rotate-180" : "rotate-0",
              )}
            />
          </CollapsibleTrigger>
        ) : isActive ? (
          <Shimmer className="min-w-0 flex-1 font-medium">{summaryText}</Shimmer>
        ) : (
          <span className="min-w-0 flex-1 font-medium text-foreground">
            {summaryText}
          </span>
        )}
        {showDevToggle ? (
          <button
            type="button"
            aria-pressed={devMode}
            title={devMode ? "Sembunyikan detail pengembang" : "Mode pengembang"}
            onClick={onToggleDevMode}
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
      {!isActive && run.status === "failed" && runNode?.description ? (
        <p className="mt-2 break-words text-[13px] text-coral-foreground">
          {runNode.description}
        </p>
      ) : null}
    </div>
  );
}
