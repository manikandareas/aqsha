"use client";

import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@aqsha/convex/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo } from "react";
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
} from "./component-types";
import { Composer } from "./composer";
import { HitlDock } from "./hitl-dock";
import { EmptyThreadCopy, HomeStartState } from "./home-states";
import { toWorkspaceId } from "@/lib/convex-refs";
import { MessageRow } from "./message-row";
import { AgentRunBlock } from "./run-progress";
import { CenteredLoading } from "./shared";

export function ChatThreadState({
  threadId,
  isLoading,
  title,
  rateStatus,
  startThread,
  onSend,
  runs,
  artifacts,
  sources,
  onCancelRun,
  compact = false,
  contextArtifacts = [],
  onRemoveContextArtifact,
  threadWorkspaceId,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  onSend: SendMessage;
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  sources: ResearchSource[];
  onCancelRun: (runId: string) => Promise<unknown>;
  compact?: boolean;
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  threadWorkspaceId?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const hitlSession = useQuery(
    api.hitlSessions.getActiveForThread,
    isAuthenticated && threadId ? { threadId } : "skip",
  );
  const hitlBlocking = hitlSession?.blocksComposer ?? false;
  const messages = useUIMessages(
    api.agent.messages.list,
    isAuthenticated && threadId ? { threadId } : "skip",
    { initialNumItems: 30, stream: true },
  );
  const sortedMessages = useMemo(
    () => sortTranscriptMessages(messages.results as unknown as ChatMessage[]),
    [messages.results],
  );
  const hasMessages = sortedMessages.length > 0;
  const activeRun = useMemo(() => runs.find(isRunActive), [runs]);
  const interleavedEntries = useMemo(
    () => interleaveRunsWithMessages(sortedMessages, runs),
    [sortedMessages, runs],
  );
  const sourceCounts = useMemo(() => getSourceCountsByOwner(sources), [sources]);

  if (!threadId && !hasMessages && runs.length === 0) {
    return (
      <HomeStartState
        rateStatus={rateStatus}
        startThread={startThread}
        contextArtifacts={contextArtifacts}
        onRemoveContextArtifact={onRemoveContextArtifact}
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <ConversationContent
          className={cn(
            "gap-6 overflow-x-hidden p-0",
            compact ? cn("max-w-none", panelBodyPaddingClass) : cn(threadTranscriptColumnClass, threadTranscriptBodyPaddingClass),
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
                          sourceCount={sourceCounts.byRunId.get(entry.run._id) ?? 0}
                        />
                      ) : (
                        <MessageRow
                          message={entry.message}
                          sourceCount={sourceCounts.byMessageId.get(entry.message.id) ?? 0}
                          threadWorkspaceId={threadWorkspaceId}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            ) : messages.status === "LoadingFirstPage" && threadId ? (
              <CenteredLoading label="Memuat pesan..." />
            ) : (
              <ConversationEmptyState className={compact ? "min-h-[24svh]" : "min-h-[48svh]"}>
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
          compact ? panelComposerPaddingClass : threadTranscriptComposerPaddingClass,
        )}
      >
        <div className={cn(compact ? "mx-auto w-full max-w-none" : threadTranscriptColumnClass)}>
          {threadId && hitlSession ? (
            <HitlDock
              session={hitlSession}
              threadWorkspaceId={
                threadWorkspaceId ? toWorkspaceId(threadWorkspaceId) : undefined
              }
            />
          ) : null}
          {threadId ? (
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
