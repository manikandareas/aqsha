"use client";

import {
  uiHitlMessageFromInteraction,
  uiMessageFromRow,
  type AgentInteractionRow,
  type AgentMessageRow,
} from "@aqsha/agent-contracts";
import { AlertCircleIcon } from "@aqsha/ui/icons";
import { api } from "@aqsha/convex/api";
import { useConvexQueryData } from "@/lib/convex-query";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  panelBodyPaddingClass,
  panelComposerPaddingClass,
  threadTranscriptBodyPaddingClass,
  threadTranscriptColumnClass,
  threadTranscriptComposerPaddingClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  RateStatus,
  ResearchArtifact,
  ResearchRun,
  ResearchSource,
} from "../types";
import { isRunActive, sortTranscriptMessages } from "../utils/transcript-model";
import {
  pairRunsWithTurns,
  turnEntryKey,
  turnGapClass,
} from "../utils/turn-model";
import { getSourceCountsByOwner } from "../utils/research-panel-model";
import type {
  DraftContextArtifact,
  SendMessage,
  StartThread,
  ThreadSummary,
} from "./component-types";
import { Composer } from "./composer";
import { HomeStartState } from "./home-states";
import { EmptyThreadCopy } from "./empty-thread-copy";
import { type AgentRunId } from "@/lib/convex-refs";
import { useHitlResume } from "./use-hitl-resume";
import { UserMessageBubble } from "./message-row";
import { AssistantTurn } from "./assistant-turn";
import { ChatArtifactProvider } from "./chat-artifact-context";
import { CenteredLoading } from "./shared";
import { useConvexAuth } from "convex/react";

/** First question prompt of an askUser payload — the label a free-text answer
 *  is recorded against. Empty for approval interactions. */
function firstQuestionPrompt(payloadJson: string): string {
  try {
    const parsed = JSON.parse(payloadJson) as {
      questions?: Array<{ prompt?: unknown }>;
    };
    const prompt = parsed.questions?.[0]?.prompt;
    return typeof prompt === "string" ? prompt : "";
  } catch {
    return "";
  }
}

const emptyContextArtifacts: DraftContextArtifact[] = [];
const emptyThreadSummaries: ThreadSummary[] = [];
const emptyRuns: ResearchRun[] = [];
const emptyArtifacts: ResearchArtifact[] = [];
const emptySources: ResearchSource[] = [];
const cancelNoop = async () => undefined;

export function ThreadChatSurface({
  threadId,
  isLoading,
  title,
  rateStatus,
  startThread,
  onSend,
  runs = emptyRuns,
  artifacts = emptyArtifacts,
  sources = emptySources,
  onCancelRun = cancelNoop,
  onRetryRun,
  compact = false,
  contextArtifacts = emptyContextArtifacts,
  onRemoveContextArtifact,
  threads = emptyThreadSummaries,
  onThreadCreated,
  draftContextLabel,
  seed,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  onSend?: SendMessage;
  runs?: ResearchRun[];
  artifacts?: ResearchArtifact[];
  sources?: ResearchSource[];
  onCancelRun?: (runId: string) => Promise<unknown>;
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
  compact?: boolean;
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  threadWorkspaceId?: string;
  threads?: ThreadSummary[];
  onThreadCreated?: (threadId: string) => void;
  draftContextLabel?: string;
  seed?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const active = isAuthenticated;
  const threadStatus = useConvexQueryData(
    api.agent.queries.getThread,
    active && threadId ? { threadId } : "skip",
  );
  // Lock the composer while a reply is still being generated for this thread.
  // `send` only schedules generation and returns immediately, so `isSending`
  // alone re-opens the composer before the agent finishes streaming.
  const isGenerating = threadStatus?.status === "streaming";
  const messageRows = useConvexQueryData(
    api.agent.queries.listMessages,
    active && threadId ? { threadId } : "skip",
  );
  const interactionRows = useConvexQueryData(
    api.agent.queries.listPendingInteractions,
    active && threadId ? { threadId } : "skip",
  );
  const messagesLoading = Boolean(threadId) && messageRows === undefined;
  // Real chat messages only (user + assistant). The sdk backend delivers
  // assistant text in ~RTT-sized jumps (one Convex write per round-trip);
  // smoothing happens per message id inside AssistantTurn so every turn's reveal
  // starts from a fresh cursor (a shared smoother leaked the prior turn's text).
  const sortedMessages = sortTranscriptMessages(
    ((messageRows ?? []) as AgentMessageRow[]).map(
      uiMessageFromRow,
    ) as unknown as ChatMessage[],
  );
  // HITL interactions (pending AND answered) are kept SEPARATE, keyed by runId,
  // so each renders ONCE inside its run's turn — the question stays visible after
  // it is answered (read-only), never a stray sibling message.
  const interactions = (interactionRows ?? []) as AgentInteractionRow[];
  const hitlByRun = new Map<string, ChatMessage[]>();
  for (const row of interactions) {
    const synthetic = uiHitlMessageFromInteraction(row) as unknown as ChatMessage;
    const bucket = hitlByRun.get(row.runId) ?? [];
    bucket.push(synthetic);
    hitlByRun.set(row.runId, bucket);
  }
  // The latest still-pending interaction: the composer routes free-text to it
  // (answer for askUser, deny+note for approvals) instead of sending a message.
  const latestPending = interactions.filter((row) => row.status === "pending").at(-1);
  const activeInteraction = latestPending
    ? {
        id: latestPending.id,
        type: latestPending.type,
        prompt: firstQuestionPrompt(latestPending.payloadJson),
      }
    : undefined;
  const hitlActions = useHitlResume();
  const hasMessages = sortedMessages.length > 0;
  const activeRun = runs.find(isRunActive);
  const turnEntries = pairRunsWithTurns(sortedMessages, runs, hitlByRun);
  const sourceCounts = getSourceCountsByOwner(sources);

  if (!threadId && !hasMessages && runs.length === 0) {
    return (
      <HomeStartState
        rateStatus={rateStatus}
        startThread={startThread}
        threads={threads}
        contextArtifacts={contextArtifacts}
        onRemoveContextArtifact={onRemoveContextArtifact}
        onThreadCreated={onThreadCreated}
        contextLabel={draftContextLabel}
        seed={seed}
        compact={compact}
      />
    );
  }

  return (
    <ChatArtifactProvider artifacts={artifacts} compact={compact}>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <ConversationContent
          className={cn(
            "gap-6 overflow-x-hidden p-0",
            compact
              ? cn("max-w-none", panelBodyPaddingClass)
              : cn(
                  threadTranscriptColumnClass,
                  threadTranscriptBodyPaddingClass,
                ),
          )}
        >
          <div className="flex w-full min-w-0 flex-col overflow-x-hidden">
            {isLoading ? (
              <CenteredLoading label="Memuat thread..." />
            ) : hasMessages || runs.length > 0 ? (
              <>
                {turnEntries.map((entry, index) => {
                  const previous = turnEntries[index - 1];
                  return (
                    <div
                      key={turnEntryKey(entry)}
                      className={cn(
                        "min-w-0",
                        index === 0 ? "mt-0" : turnGapClass(previous, entry),
                      )}
                    >
                      {entry.kind === "user" ? (
                        <UserMessageBubble message={entry.message} />
                      ) : (
                        <AssistantTurn
                          message={entry.message}
                          run={entry.run}
                          hitlMessages={entry.hitl}
                          userAnswers={entry.userAnswers}
                          onRetryRun={onRetryRun}
                          runSourceCount={
                            entry.run
                              ? sourceCounts.byRunId.get(entry.run._id) ?? 0
                              : 0
                          }
                          messageSourceCount={
                            entry.message
                              ? sourceCounts.byMessageId.get(entry.message.id) ??
                                0
                              : 0
                          }
                          sources={
                            entry.run
                              ? sources.filter(
                                  (source) => source.runId === entry.run!._id,
                                )
                              : emptySources
                          }
                          hitlActions={hitlActions}
                          hitlDisabled={isGenerating}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            ) : messagesLoading ? (
              <CenteredLoading label="Memuat pesan..." />
            ) : (
              <ConversationEmptyState
                className={compact ? "min-h-[24svh]" : "min-h-[48svh]"}
              >
                <EmptyThreadCopy title={title} />
              </ConversationEmptyState>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton className="bottom-4 size-8 border-border/70 bg-card/85 text-muted-foreground shadow-none" />
      </Conversation>
      <div
        className={cn(
          "shrink-0 min-w-0 overflow-x-hidden bg-background",
          compact
            ? panelComposerPaddingClass
            : threadTranscriptComposerPaddingClass,
        )}
      >
        <div
          className={cn(
            compact ? "mx-auto w-full max-w-none" : threadTranscriptColumnClass,
          )}
        >
          {threadId && threadStatus?.status === "failed" ? (
            <div className="mb-2 flex items-start gap-2 rounded-[10px] border border-coral-soft-border bg-coral-soft px-3 py-2.5 text-[12px] font-medium leading-5 text-coral-foreground">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                Respons terakhir gagal diproses. Coba kirim pesan lagi.
              </span>
            </div>
          ) : null}
          {threadId && onSend ? (
            <Composer
              mode="thread"
              variant="docked"
              threadId={threadId}
              disabled={isLoading}
              rateStatus={rateStatus}
              activeRun={activeRun}
              onCancelRun={onCancelRun}
              onStartThread={startThread}
              onSend={onSend}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              activeInteraction={activeInteraction}
              hitlActions={hitlActions}
              isGenerating={isGenerating}
              initialAgentKind={threadStatus?.lastAgentKind}
            />
          ) : (
            <Composer
              mode="draft"
              variant="docked"
              disabled={isLoading}
              rateStatus={rateStatus}
              onStartThread={startThread}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
            />
          )}
        </div>
      </div>
    </div>
    </ChatArtifactProvider>
  );
}
