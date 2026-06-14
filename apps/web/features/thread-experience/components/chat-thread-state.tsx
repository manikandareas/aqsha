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
import {
  entryGapClass,
  interleavedEntryKey,
  interleaveRunsWithMessages,
  isRunActive,
  sortTranscriptMessages,
} from "../utils/transcript-model";
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
import { hasPendingHitl } from "../utils/hitl-parts";
import { useHitlResume } from "./use-hitl-resume";
import { MessageRow } from "./message-row";
import { AgentRunBlock } from "./run-progress";
import { CenteredLoading } from "./shared";
import { useConvexAuth } from "convex/react";

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
  threadWorkspaceId,
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
  const backendMessages = [
    ...((messageRows ?? []) as AgentMessageRow[]).map(uiMessageFromRow),
    ...((interactionRows ?? []) as AgentInteractionRow[]).map(
      uiHitlMessageFromInteraction,
    ),
  ] as unknown as ChatMessage[];
  // The sdk backend delivers assistant text in ~RTT-sized jumps (one Convex
  // write per round-trip). Smoothing happens per-message inside MessageRow (the
  // transcript keys each row by message id, so every turn's reveal starts from a
  // fresh cursor). A single shared smoother here leaked the previous turn's text
  // into the next bubble until the new stream overtook the old cursor.
  const sortedMessages = sortTranscriptMessages(backendMessages);
  // HITL is now native in-thread: a pending tool part (askUser awaiting an
  // answer, or an action awaiting approval) blocks the composer, and resolving
  // it resumes generation. Derived entirely from the message stream.
  const pendingHitl = hasPendingHitl(sortedMessages);
  const hitlBlocking = pendingHitl;
  const hitlActions = useHitlResume();
  const hasMessages = sortedMessages.length > 0;
  const activeRun = runs.find(isRunActive);
  const interleavedEntries = interleaveRunsWithMessages(sortedMessages, runs);
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
                {interleavedEntries.map((entry, index) => {
                  const previous = interleavedEntries[index - 1];
                  return (
                    <div
                      key={interleavedEntryKey(entry)}
                      className={cn(
                        "min-w-0",
                        index === 0 ? "mt-0" : entryGapClass(previous, entry),
                      )}
                    >
                      {entry.kind === "run" ? (
                        <AgentRunBlock
                          run={entry.run}
                          artifacts={artifacts ?? []}
                          sourceCount={
                            sourceCounts.byRunId.get(entry.run._id) ?? 0
                          }
                          sources={sources.filter(
                            (source) => source.runId === entry.run._id,
                          )}
                        />
                      ) : (
                        <MessageRow
                          message={entry.message}
                          assistantRun={entry.assistantRun}
                          onRetryRun={onRetryRun}
                          sourceCount={
                            sourceCounts.byMessageId.get(entry.message.id) ?? 0
                          }
                          threadWorkspaceId={threadWorkspaceId}
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
              hitlBlocking={hitlBlocking}
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
  );
}
