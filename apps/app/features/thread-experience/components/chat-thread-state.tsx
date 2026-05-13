"use client";

import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@aqsha/convex/api";
import { useConvexAuth } from "convex/react";
import { useMemo } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import type { ResearchSource } from "@/components/sources-panel";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  RateStatus,
  ResearchArtifact,
  ResearchRun,
} from "../types";
import {
  entryGapClass,
  interleavedEntryKey,
  interleaveRunsWithMessages,
  isRunActive,
  sortTranscriptMessages,
} from "../utils/transcript-model";
import type { SendMessage, StartThread, ThreadSummary } from "./component-types";
import { Composer } from "./composer";
import { EmptyThreadCopy, HomeStartState } from "./home-states";
import { MessageRow } from "./message-row";
import { AgentRunBlock } from "./run-progress";
import { CenteredLoading } from "./shared";

export function ChatThreadState({
  threadId,
  isLoading,
  title,
  recentThreads,
  rateStatus,
  startThread,
  onSend,
  sources,
  runs,
  artifacts,
  onCitationClick,
  onOpenArtifact,
  onCancelRun,
  onRetryRun,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  recentThreads: ThreadSummary[];
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  onSend: SendMessage;
  sources: ResearchSource[];
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  onCitationClick: (citation: number) => void;
  onOpenArtifact: (artifactId: string) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const { isAuthenticated } = useConvexAuth();
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

  if (!threadId && !hasMessages && runs.length === 0) {
    return (
      <HomeStartState
        recentThreads={recentThreads}
        rateStatus={rateStatus}
        startThread={startThread}
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <ConversationContent className="gap-6 overflow-x-hidden px-5 pb-6 pt-4 sm:px-8 lg:pt-6">
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
                          onRetryRun={onRetryRun}
                        />
                      ) : (
                        <MessageRow
                          message={entry.message}
                          sources={sources}
                          onCitationClick={onCitationClick}
                          onOpenArtifact={onOpenArtifact}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            ) : messages.status === "LoadingFirstPage" && threadId ? (
              <CenteredLoading label="Memuat pesan..." />
            ) : (
              <ConversationEmptyState className="min-h-[48svh]">
                <EmptyThreadCopy title={title} />
              </ConversationEmptyState>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton className="bottom-4 size-8 border-border/70 bg-card/85 text-muted-foreground shadow-none" />
      </Conversation>
      <div className="shrink-0 min-w-0 overflow-x-hidden bg-background/92 px-4 pb-4 pt-2 backdrop-blur sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            threadId={threadId}
            disabled={isLoading}
            rateStatus={rateStatus}
            activeRun={activeRun}
            onCancelRun={onCancelRun}
            onStartThread={startThread}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  );
}
