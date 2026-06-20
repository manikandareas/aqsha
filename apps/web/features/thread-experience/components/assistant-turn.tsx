"use client";

import { type ActivityEvent, filterByVisibility } from "@aqsha/agent-contracts";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  FolderTreeIcon,
} from "@aqsha/ui/icons";
import { useState, type ReactNode } from "react";
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
import {
  hitlQuestionLines,
  isAnsweredHitlPart,
  messageHitlParts,
} from "../utils/hitl-parts";
import { AnswerSources } from "./answer-sources";
import { CitationIntegritySummary } from "./citation-integrity";
import { MessageHitlParts } from "./message-hitl-parts";
import {
  AssistantMessageActions,
  MessageSourceCount,
  StreamingResponse,
  UserMessageBubble,
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
  userAnswers,
  onRetryRun,
  runSourceCount = 0,
  messageSourceCount = 0,
  sources = emptySources,
  hitlActions,
  hitlDisabled,
}: {
  message?: ChatMessage;
  run?: ResearchRun;
  /** HITL synthetic question messages for this run (pending or answered). */
  hitlMessages?: ChatMessage[];
  /** Real user messages that answered this run's HITL prompts. */
  userAnswers?: ChatMessage[];
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
  runSourceCount?: number;
  messageSourceCount?: number;
  sources?: ResearchSource[];
  hitlActions?: HitlActions;
  hitlDisabled?: boolean;
}) {
  // null = auto (expanded while the run is active, collapsed once it settles);
  // a non-null value is the user's manual override and wins for the turn's life.
  const [manualProcessOpen, setManualProcessOpen] = useState<boolean | null>(null);

  const isActive = run ? isRunActive(run) : false;
  // Terminal = the run settled (completed/failed/canceled); isRunActive already
  // counts waiting_hitl as active, so !isActive is exactly the terminal set. Used
  // to render any still-pending HITL card non-interactive (plan §7.3 zombie-card).
  const runTerminal = Boolean(run) && !isActive;
  const isDeep = run?.mode === "deep";
  const parts = buildTurnParts(message, run);
  const pendingHitl = hitlMessages ?? [];

  const isStreaming = message?.status === "streaming";
  const isFailed = message?.status === "failed";
  const text = message ? getMessageText(message) : "";
  const hasText = Boolean(text.trim());

  // Visibility gate per node (recursively prunes children); users see `user`
  // nodes only. `developer` and `hidden` nodes never render.
  const visible = (node: ActivityEvent): ActivityEvent | undefined =>
    filterByVisibility([node])[0];

  // The HITL exchange (agent question → user answer) renders OUTSIDE the
  // collapsible process timeline so the conversation stays visible: question
  // (interactive while pending, read-only once answered) then the user's answer
  // bubble, in chronological order, just above the agent's continuation.
  const exchange = [
    ...pendingHitl.map((m) => ({ kind: "hitl" as const, order: m.order, message: m })),
    ...(userAnswers ?? []).map((m) => ({
      kind: "answer" as const,
      order: m.order,
      message: m,
    })),
  ].sort((a, b) => a.order - b.order);

  // Artifact cards are actionable (click → side panel) and conceptually part of
  // the answer, not the process. They render at the very bottom — under the final
  // response, grouped with the text — instead of inside the collapsible timeline.
  const artifactCards = parts.flatMap((part) => {
    if (part.kind !== "artifact") return [];
    const node = visible(part.node);
    return node ? [<ChatArtifactCard key={part.id} node={node} />] : [];
  });

  // ── ordered timeline → React elements ──────────────────────────────────────
  const elements: ReactNode[] = [];
  let nodeBuffer: ReactNode[] = [];
  let listSeq = 0;
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
    if (part.kind === "artifact") continue; // rendered at the bottom, below the answer
    const node = visible(part.node);
    if (!node) continue;
    if (part.kind === "approval") {
      // The interactive HITL card lives in the exchange block (below the
      // timeline); here the approval is just a process row.
      nodeBuffer.push(
        <li key={part.id}>
          <NodeLine node={node} />
        </li>,
      );
    } else if (part.kind === "tool") {
      nodeBuffer.push(
        <li key={part.id}>
          <ToolRow node={node} />
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
          <SubagentCard node={node} />
        </li>,
      );
    } else {
      // phase (both modes) / system → flat heading row with indented children.
      nodeBuffer.push(<ActivityNodeRow key={part.id} node={node} />);
    }
  }
  flushNodes();

  // The whole process timeline (reasoning ↔ tools ↔ sub-agents ↔ artifacts —
  // everything but the final answer) collapses under the run header. Auto-expanded
  // while the run is active so live progress is visible, then auto-collapsed once
  // it settles to keep the answer prominent. A manual toggle overrides the auto
  // state. (The HITL card no longer lives here — it renders in the exchange block
  // below, always visible.)
  const hasProcess = elements.length > 0;
  const processOpen =
    manualProcessOpen !== null ? manualProcessOpen : isActive;

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
            <RunHeader run={run} sourceCount={runSourceCount} />
          ) : null}
          {hasProcess ? processTimeline : null}
        </>
      )}

      {exchange.length > 0 ? (
        <div className="mt-3 flex w-full min-w-0 flex-col gap-3">
          {exchange.map((item) =>
            item.kind === "answer" ? (
              <UserMessageBubble key={item.message.id} message={item.message} />
            ) : (
              <HitlExchangeQuestion
                key={item.message.id}
                message={item.message}
                actions={hitlActions}
                disabled={hitlDisabled}
                runTerminal={runTerminal}
              />
            ),
          )}
        </div>
      ) : null}

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
        {artifactCards.length > 0 ? (
          <div className="mt-3 grid gap-2">{artifactCards}</div>
        ) : null}
        {sources.length > 0 ? (
          <AnswerSources sources={sources} />
        ) : (
          <MessageSourceCount sourceCount={messageSourceCount} />
        )}
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

/**
 * The agent's HITL question in the exchange block: the interactive inline form
 * while pending, or the read-only question text once answered (the user's reply
 * renders as a separate bubble). No card chrome — it reads as natural agent prose.
 */
function HitlExchangeQuestion({
  message,
  actions,
  disabled,
  runTerminal,
}: {
  message: ChatMessage;
  actions?: HitlActions;
  disabled?: boolean;
  runTerminal?: boolean;
}) {
  const part = messageHitlParts(message)[0];
  if (!part) return null;
  if (isAnsweredHitlPart(part)) {
    const lines = hitlQuestionLines(part);
    if (lines.length === 0) return null;
    return (
      <div className="flex w-full min-w-0 flex-col gap-0.5 text-[13px] leading-[1.55] text-muted-foreground">
        {lines.map((line, index) => (
          <p key={index} className="min-w-0 break-words">
            {line}
          </p>
        ))}
      </div>
    );
  }
  if (!actions) return null;
  return (
    <MessageHitlParts
      message={message}
      actions={actions}
      disabled={disabled}
      runTerminal={runTerminal}
    />
  );
}

function ThreadActivityFallback() {
  // Shown only before any reasoning/tool part or answer text exists (a run that
  // just started); the run header Shimmer covers the rest.
  return <Shimmer className="font-medium">Sedang menyiapkan jawaban…</Shimmer>;
}

function RunHeader({
  run,
  sourceCount,
  collapsible = false,
  open = false,
}: {
  run: ResearchRun;
  sourceCount: number;
  // When true, the whole header (summary + source chip + a hover-revealed
  // chevron at the far right) is the trigger that collapses the process timeline
  // below it.
  collapsible?: boolean;
  open?: boolean;
}) {
  const isActive = isRunActive(run);
  const activity = run.activity ?? [];
  const runNode = activity.find((node) => node.type === "run");
  const nonRunNodes = activity.filter((node) => node.type !== "run");
  const timeline = filterByVisibility(nonRunNodes);
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

  const summaryNode = isActive ? (
    <Shimmer as="span" className="min-w-0 font-medium">
      {summaryText}
    </Shimmer>
  ) : (
    <span className="min-w-0 font-medium text-foreground">{summaryText}</span>
  );
  const sourceBadge =
    sourceCount > 0 ? (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-border/70 bg-muted/35 px-2 py-1 text-[11px] font-medium text-muted-foreground">
        <FolderTreeIcon className="size-3.5" />
        <span>{sourceCount}</span>
      </span>
    ) : null;

  return (
    <div className="text-[13px] text-muted-foreground">
      {collapsible ? (
        // The chevron sits to the RIGHT of the source badge and stays hidden
        // until the row is hovered/focused (always shown while expanded), so the
        // header reads as plain text at rest and reveals the toggle on demand.
        <CollapsibleTrigger className="group flex w-full min-w-0 items-center gap-1.5 text-left transition-colors hover:text-foreground">
          {summaryNode}
          {sourceBadge}
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-all duration-200",
              open
                ? "rotate-180 opacity-100"
                : "rotate-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </CollapsibleTrigger>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5">
          {summaryNode}
          {sourceBadge}
        </div>
      )}
      {!isActive && run.status === "failed" && runNode?.description ? (
        <p className="mt-2 break-words text-[13px] text-coral-foreground">
          {runNode.description}
        </p>
      ) : null}
    </div>
  );
}
