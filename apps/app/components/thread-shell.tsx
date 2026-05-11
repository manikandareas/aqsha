"use client";

import {
  optimisticallySendMessage,
  useUIMessages,
} from "@convex-dev/agent/react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CopyIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@aqsha/convex/api";
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationText,
} from "@/components/ai-elements/inline-citation";
import {
  Message,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import {
  Sources,
  Source,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { AppSidebar } from "@/components/app-sidebar";
import {
  ResearchSidebar,
  type ResearchSource,
} from "@/components/sources-panel";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SendResult =
  | { ok: true; messageId: string; runId?: string; workflowId?: string }
  | { ok: false; reason: "rate_limited"; retryAt: number };

type RateStatus = {
  ok: boolean;
  retryAt: number | null;
  serverTime: number;
};

type ChatMessage = {
  id: string;
  key: string;
  role: "system" | "user" | "assistant" | "tool";
  status: "pending" | "success" | "failed" | "streaming";
  order: number;
  stepOrder: number;
  text?: string;
  parts?: Array<{ type: string; text?: string }>;
};

type ResearchRun = {
  _id: string;
  promptMessageId?: string;
  status:
    | "queued"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "canceled";
  currentStep?: string;
  activeArtifactId?: string;
  retryable: boolean;
  errorMessage?: string;
  createdAt?: number;
  completedAt?: number;
  canceledAt?: number;
  steps: Array<{
    stepKey: string;
    label: string;
    order: number;
    status: "pending" | "running" | "completed" | "failed" | "canceled";
    summary?: string;
    sourceCount?: number;
    artifactCount?: number;
    failureReason?: string;
    startedAt?: number;
    completedAt?: number;
  }>;
};

type ResearchArtifact = {
  _id: string;
  runId: string;
  type:
    | "markdown_report"
    | "research_document"
    | "source_bundle"
    | "citation_evidence_view";
  title: string;
  markdown?: string;
  createdAt: number;
};

type CitationCheck = {
  _id: string;
  claim: string;
  support: "supported" | "partial" | "unsupported";
  sourceIds: string[];
  evidence: string;
};

export function ThreadShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const viewer = useQuery(api.auth.getCurrentUser);
  const threadPage = useQuery(api.agent.threads.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const selectedThread = useQuery(
    api.agent.threads.get,
    threadId ? { threadId } : "skip",
  );
  const createThread = useMutation(api.agent.threads.create);
  const sendMessage = useMutation(api.agent.messages.send).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.agent.messages.list)(store, {
        threadId: args.threadId,
        prompt: args.content,
      });
    },
  );
  const rateStatus = useQuery(api.agent.rateLimits.getSendStatus);
  const sources = useQuery(
    api.agent.sources.list,
    threadId ? { threadId } : "skip",
  );
  const runs = useQuery(
    api.agent.deepResearch.listForThread,
    threadId ? { threadId } : "skip",
  ) as ResearchRun[] | undefined;
  const artifacts = useQuery(
    api.agent.deepResearch.listArtifacts,
    threadId ? { threadId } : "skip",
  ) as ResearchArtifact[] | undefined;
  const cancelRun = useMutation(api.agent.deepResearch.cancel);
  const retryRun = useMutation(api.agent.deepResearch.retry);
  const [isCreating, setIsCreating] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const activeArtifact = useQuery(
    api.agent.deepResearch.getArtifact,
    activeArtifactId ? { artifactId: activeArtifactId as never } : "skip",
  ) as ResearchArtifact | null | undefined;
  const citationChecks = useQuery(
    api.agent.deepResearch.listCitationChecks,
    activeArtifactId ? { artifactId: activeArtifactId as never } : "skip",
  ) as CitationCheck[] | undefined;

  const threads = threadPage?.page ?? [];
  const title = threadId
    ? (selectedThread?.title ?? "Thread tidak ditemukan")
    : "Thread baru";

  const hasResearchPayload =
    (sources && sources.length > 0) ||
    (artifacts && artifacts.length > 0) ||
    (runs ?? []).some(isRunActive);

  const handleCreateThread = async () => {
    setIsCreating(true);
    try {
      const result = await createThread({});
      router.push(`/thread/${result.threadId}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16.5rem",
          "--sidebar-width-mobile": "17.5rem",
        } as CSSProperties
      }
    >
      <ThreadShellLayout
        viewer={viewer}
        threads={threads}
        selectedThreadId={threadId}
        isCreating={isCreating}
        onCreateThread={handleCreateThread}
        hasResearchPayload={Boolean(hasResearchPayload)}
        title={title}
        threadId={threadId}
        selectedThread={selectedThread}
        rateStatus={rateStatus}
        sendMessage={sendMessage}
        sources={sources ?? []}
        runs={runs ?? []}
        artifacts={artifacts ?? []}
        activeArtifact={activeArtifact ?? null}
        citationChecks={citationChecks ?? []}
        activeArtifactId={activeArtifactId}
        activeCitation={activeCitation}
        onCitationClick={setActiveCitation}
        onOpenArtifact={setActiveArtifactId}
        onCancelRun={(runId) => cancelRun({ runId: runId as never })}
        onRetryRun={(runId) => retryRun({ runId: runId as never })}
      />
    </SidebarProvider>
  );
}

function ThreadShellLayout({
  viewer,
  threads,
  selectedThreadId,
  isCreating,
  onCreateThread,
  hasResearchPayload,
  title,
  threadId,
  selectedThread,
  rateStatus,
  sendMessage,
  sources,
  runs,
  artifacts,
  activeArtifact,
  citationChecks,
  activeArtifactId,
  activeCitation,
  onCitationClick,
  onOpenArtifact,
  onCancelRun,
  onRetryRun,
}: {
  viewer: {
    name: string | null;
    email: string | null;
    image: string | null;
  } | undefined;
  threads: Array<{
    threadId: string;
    title: string;
    createdAt: number;
    lastActivityAt: number;
    lastMessagePreview: string;
    messageCount: number;
    status: "idle" | "streaming" | "failed";
  }>;
  selectedThreadId?: string;
  isCreating: boolean;
  onCreateThread: () => void;
  hasResearchPayload: boolean;
  title: string;
  threadId?: string;
  selectedThread:
    | {
        title: string;
      }
    | null
    | undefined;
  rateStatus: RateStatus | undefined;
  sendMessage: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
  }) => Promise<SendResult>;
  sources: ResearchSource[];
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  activeArtifact: ResearchArtifact | null;
  citationChecks: CitationCheck[];
  activeArtifactId: string | null;
  activeCitation: number | null;
  onCitationClick: (citation: number) => void;
  onOpenArtifact: (artifactId: string) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const leftSidebar = useSidebar();
  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  return (
    <>
      <AppSidebar
        viewer={viewer}
        threads={threads}
        selectedThreadId={selectedThreadId}
        isCreating={isCreating}
        onCreateThread={onCreateThread}
      />
      <SidebarInset className="bg-background">
        <SidebarProvider
          defaultOpen={Boolean(hasResearchPayload)}
          style={
            {
              "--sidebar-width": "34rem",
              "--sidebar-width-mobile": "26rem",
            } as CSSProperties
          }
          className="min-h-0 flex-1"
        >
          <SidebarInset className="bg-background">
            <ThreadHeader
              title={title}
              showLeftTrigger={!isLeftSidebarOpen}
              onToggleLeftSidebar={leftSidebar.toggleSidebar}
              showRightTrigger={hasResearchPayload}
            />
            <main className="flex min-h-0 flex-1 flex-col">
              {threadId && selectedThread === null ? (
                <AccessDeniedState />
              ) : (
                <ChatThreadState
                  threadId={threadId}
                  isLoading={threadId ? selectedThread === undefined : false}
                  title={threadId ? selectedThread?.title : undefined}
                  rateStatus={rateStatus}
                  onSend={sendMessage}
                  sources={sources}
                  runs={runs}
                  artifacts={artifacts}
                  activeArtifact={activeArtifact}
                  citationChecks={citationChecks}
                  onCitationClick={onCitationClick}
                  onCancelRun={onCancelRun}
                  onRetryRun={onRetryRun}
                />
              )}
            </main>
          </SidebarInset>
          {hasResearchPayload ? (
            <ResearchSidebar
              threadTitle={threadId ? selectedThread?.title : undefined}
              sources={sources}
              artifacts={artifacts}
              activeArtifactId={activeArtifactId}
              activeCitation={activeCitation}
              onOpenArtifact={onOpenArtifact}
            />
          ) : null}
        </SidebarProvider>
      </SidebarInset>
    </>
  );
}

function ThreadHeader({
  title,
  showLeftTrigger,
  onToggleLeftSidebar,
  showRightTrigger,
}: {
  title: string;
  showLeftTrigger: boolean;
  onToggleLeftSidebar: () => void;
  showRightTrigger: boolean;
}) {
  return (
    <header className="flex h-9 shrink-0 items-center justify-between gap-2 bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        {showLeftTrigger ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-ml-1 size-7 rounded-[7px] text-muted-foreground"
            onClick={onToggleLeftSidebar}
            aria-label="Buka sidebar kiri"
          >
            <PanelLeftIcon className="size-4" />
          </Button>
        ) : null}
        <h1 className="max-w-[34vw] truncate text-[13px] font-semibold text-foreground sm:max-w-[360px]">
          {title}
        </h1>
        <div className="hidden min-w-0 items-center gap-1.5 text-[12px] font-medium text-muted-foreground sm:flex">
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="truncate">aqsha / research thread</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 rounded-[7px] text-muted-foreground"
          aria-label="Thread actions"
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
        {showRightTrigger ? <RightSidebarTrigger /> : null}
      </div>
    </header>
  );
}

function RightSidebarTrigger() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-7 rounded-[7px] text-muted-foreground"
      onClick={toggleSidebar}
      aria-label="Toggle research panel"
    >
      <PanelRightIcon className="size-4" />
    </Button>
  );
}

function ChatThreadState({
  threadId,
  isLoading,
  title,
  rateStatus,
  onSend,
  sources,
  runs,
  artifacts,
  activeArtifact,
  citationChecks,
  onCitationClick,
  onCancelRun,
  onRetryRun,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  rateStatus: RateStatus | undefined;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
  }) => Promise<SendResult>;
  sources: ResearchSource[];
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  activeArtifact: ResearchArtifact | null;
  citationChecks: CitationCheck[];
  onCitationClick: (citation: number) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const messages = useUIMessages(
    api.agent.messages.list,
    threadId ? { threadId } : "skip",
    { initialNumItems: 30, stream: true },
  );
  const sortedMessages = useMemo(
    () =>
      [...messages.results].sort(
        (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
      ),
    [messages.results],
  );
  const hasMessages = sortedMessages.length > 0;
  const activeRun = runs.find(isRunActive);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 px-5 pb-28 pt-4 sm:px-8 lg:pt-6">
          <div className="flex w-full flex-col gap-4">
            {activeArtifact ? (
              <ArtifactReader
                artifact={activeArtifact}
                citationChecks={citationChecks}
                onCitationClick={onCitationClick}
              />
            ) : isLoading ? (
              <CenteredLoading label="Memuat thread..." />
            ) : hasMessages || runs.length > 0 ? (
              <>
                {interleaveRunsWithMessages(sortedMessages, runs).map(
                  (entry) =>
                    entry.kind === "run" ? (
                      <DeepRunBlock
                        key={entry.run._id}
                        run={entry.run}
                        artifacts={artifacts ?? []}
                        onCancelRun={onCancelRun}
                        onRetryRun={onRetryRun}
                      />
                    ) : (
                      <MessageRow
                        key={entry.message.key ?? entry.message.id}
                        message={entry.message}
                        sources={sources}
                        onCitationClick={onCitationClick}
                      />
                    ),
                )}
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
      <div className="sticky bottom-0 bg-background/92 px-4 pb-4 pt-2 backdrop-blur sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <Composer
            threadId={threadId}
            disabled={!threadId || isLoading}
            rateStatus={rateStatus}
            activeRun={activeRun}
            onCancelRun={onCancelRun}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  sources,
  onCitationClick,
}: {
  message: ChatMessage;
  sources: ResearchSource[];
  onCitationClick: (citation: number) => void;
}) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const citedNumbers = new Set(sources.map((source) => source.citationNumber));

  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[560px] whitespace-pre-wrap rounded-[14px] border border-border/80 bg-card px-4 py-2.5 text-[15px] leading-[1.65] text-foreground">
          {text}
        </div>
      </div>
    );
  }

  return (
    <Message from="assistant">
      <MessageContent className="w-full bg-transparent px-0 py-0 text-[15px] leading-[1.65] text-[var(--ink-soft)]">
        <AssistantMarkdown
          text={text}
          sources={sources}
          citedNumbers={citedNumbers}
          onCitationClick={onCitationClick}
        />
        {message.status === "streaming" ? (
          <span className="stream-caret ml-1 inline-block h-4 w-0.5 translate-y-0.5 bg-primary" />
        ) : null}
      </MessageContent>
      {message.status === "streaming" ? (
        <span className="mt-1 inline-flex rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-medium text-primary">
          Sedang menulis
        </span>
      ) : null}
      <MessageSources sources={sources} />
    </Message>
  );
}

function MessageSources({ sources }: { sources: ResearchSource[] }) {
  if (sources.length === 0) return null;
  return (
    <Sources className="mt-3 mb-0 text-[var(--mint)]">
      <SourcesTrigger
        count={sources.length}
        className="rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--mint)]"
      >
        {sources.length} sumber terkait
      </SourcesTrigger>
      <SourcesContent className="w-full">
        {sources.slice(0, 5).map((source) => (
          <Source
            key={source._id}
            href={source.url ?? "#"}
            title={source.title}
            className="rounded-[7px] border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-1 text-[11px] text-[var(--mint)]"
            onClick={(event) => {
              if (!source.url) event.preventDefault();
            }}
          >
            <span className="font-mono text-[10px]">
              [{source.citationNumber}]
            </span>
            <span className="line-clamp-1 font-medium">{source.title}</span>
          </Source>
        ))}
      </SourcesContent>
    </Sources>
  );
}

function AssistantMarkdown({
  text,
  sources,
  citedNumbers,
  onCitationClick,
}: {
  text: string;
  sources?: ResearchSource[];
  citedNumbers: Set<number>;
  onCitationClick: (citation: number) => void;
}) {
  const sourceByCitation = new Map(
    (sources ?? []).map((source) => [source.citationNumber, source]),
  );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
            {children}
          </ol>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">
            {children}
          </code>
        ),
        text: ({ children }) => (
          <>
            {String(children)
              .split(/(\[\d{1,3}\])/g)
              .map((part, index) => {
                const match = part.match(/^\[(\d{1,3})\]$/);
                if (!match) {
                  return part;
                }
                const citation = Number(match[1]);
                const source = sourceByCitation.get(citation);
                const marker = (
                  <button
                    type="button"
                    className="inline-flex min-w-4 items-center justify-center rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-1.5 py-0.5 align-baseline font-mono text-[10px] font-semibold text-[var(--mint)] hover:border-[var(--mint)] disabled:opacity-60"
                    disabled={!citedNumbers.has(citation)}
                    onClick={() => onCitationClick(citation)}
                  >
                    {citation}
                  </button>
                );
                return (
                  <InlineCitation
                    key={`${part}-${index}`}
                    className="mx-0.5 inline-flex align-baseline"
                  >
                    {source ? (
                      <InlineCitationCard>
                        <InlineCitationCardTrigger
                          sources={[source.url ?? `citation-${citation}`]}
                          className="p-0 hover:bg-transparent"
                          asChild
                        >
                          {marker}
                        </InlineCitationCardTrigger>
                        <InlineCitationCardBody className="w-72 rounded-[9px] border bg-card p-2.5 shadow-aqsha">
                          <InlineCitationText className="block text-[12px] font-semibold text-foreground">
                            {source.title}
                          </InlineCitationText>
                          <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">
                            {source.snippet}
                          </p>
                        </InlineCitationCardBody>
                      </InlineCitationCard>
                    ) : (
                      marker
                    )}
                  </InlineCitation>
                );
              })}
          </>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function Composer({
  threadId,
  disabled,
  rateStatus,
  activeRun,
  onCancelRun,
  onSend,
}: {
  threadId?: string;
  disabled: boolean;
  rateStatus: RateStatus | undefined;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
  }) => Promise<SendResult>;
  activeRun?: ResearchRun;
  onCancelRun?: (runId: string) => Promise<unknown>;
}) {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"normal" | "deep">("normal");
  const [isSending, setIsSending] = useState(false);
  const [localRetryAt, setLocalRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const retryAt = localRetryAt ?? rateStatus?.retryAt ?? null;
  const retrySeconds =
    retryAt && retryAt > now
      ? Math.max(1, Math.ceil((retryAt - now) / 1000))
      : 0;
  const isRateLimited = retrySeconds > 0;
  const canSend =
    !!threadId &&
    content.trim().length > 0 &&
    !disabled &&
    !isSending &&
    !isRateLimited;
  const isDeepActive = Boolean(activeRun);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleSuggestion = (event: Event) => {
      const suggestion = (event as CustomEvent<string>).detail;
      if (typeof suggestion === "string") {
        setContent(suggestion);
      }
    };
    window.addEventListener("aqsha:suggestion", handleSuggestion);
    return () => window.removeEventListener("aqsha:suggestion", handleSuggestion);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isDeepActive && activeRun && onCancelRun) {
        void onCancelRun(activeRun._id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRun, isDeepActive, onCancelRun]);

  const handleSubmit = async ({ text }: { text: string }) => {
    if (!threadId || !canSend) {
      return;
    }

    const nextContent = text.trim();
    setContent("");
    setIsSending(true);
    try {
      const result = await onSend({
        threadId,
        content: nextContent,
        mode,
      });
      if (!result.ok) {
        setLocalRetryAt(result.retryAt);
        setContent(nextContent);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className="rounded-[14px] border border-border/80 bg-card/78 shadow-none backdrop-blur"
    >
      {isRateLimited ? (
        <div className="mx-3 mt-3 rounded-[9px] border border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] px-3 py-2 text-[12px] font-medium text-[var(--lemon)]">
          Perlu istirahat sebentar. Coba lagi dalam {retrySeconds || 1} detik.
        </div>
      ) : null}
      <PromptInputTextarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key === "Enter" &&
            canSend
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        disabled={disabled || isDeepActive}
        rows={2}
        maxLength={8000}
        placeholder={
          threadId ? "Add a follow up" : "Buat thread baru dulu..."
        }
        className="min-h-16 w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
      />
      <PromptInputFooter className="flex w-full items-center justify-between border-t-0 px-3 pb-3 pt-1">
        <PromptInputTools className="gap-2">
          <div className="inline-flex rounded-[8px] text-[13px] font-medium text-muted-foreground">
            <ModeButton
              active={mode === "normal"}
              onClick={() => setMode("normal")}
              disabled={isDeepActive}
              variant="normal"
            >
              Normal
            </ModeButton>
            <ModeButton
              active={mode === "deep"}
              onClick={() => setMode("deep")}
              disabled={isDeepActive}
              variant="deep"
            >
              Deep
            </ModeButton>
          </div>
        </PromptInputTools>
        <div className="flex items-center gap-1">
          <PromptInputTools className="gap-1">
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                tooltip="Tambah konteks"
                disabled={mode === "deep" || disabled || isDeepActive}
                className="size-8 rounded-[8px] text-muted-foreground hover:bg-muted"
              >
                <PlusIcon className="size-4" />
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent>
                <PromptInputActionMenuItem disabled>
                  <PaperclipIcon className="mr-2 size-4" />
                  Lampirkan sumber
                </PromptInputActionMenuItem>
                <PromptInputActionMenuItem disabled>
                  <PlusIcon className="mr-2 size-4" />
                  Tambah konteks thread
                </PromptInputActionMenuItem>
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <PromptInputButton
              tooltip="Lampirkan"
              className="size-8 rounded-[8px] text-muted-foreground hover:bg-muted"
              disabled
            >
              <PaperclipIcon className="size-4" />
            </PromptInputButton>
          </PromptInputTools>
          {isDeepActive && activeRun && onCancelRun ? (
            <PromptInputSubmit
              status="streaming"
              onStop={() => onCancelRun(activeRun._id)}
              size="sm"
              className="h-8 shrink-0 rounded-full border-[var(--coral-soft-border)] bg-[var(--coral-soft)] px-3 text-[var(--coral)] hover:bg-[var(--coral-soft)]"
            >
              <SquareIcon className="size-3.5" />
              Hentikan
            </PromptInputSubmit>
          ) : (
            <PromptInputSubmit
              size="icon-sm"
              className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!canSend}
              status={isSending ? "submitted" : undefined}
            >
              {isSending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </PromptInputSubmit>
          )}
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}

function ModeButton({
  active,
  onClick,
  disabled,
  variant,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant: "normal" | "deep";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 transition-colors disabled:opacity-60",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        active && variant === "deep" && "text-[var(--lavender)]",
        active && variant === "normal" && "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DeepRunBlock({
  run,
  artifacts,
  onCancelRun,
  onRetryRun,
}: {
  run: ResearchRun;
  artifacts: ResearchArtifact[];
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const sortedSteps = run.steps.slice().sort((a, b) => a.order - b.order);
  const activeStep = sortedSteps.find((step) => step.status === "running");
  const isActive = isRunActive(run);
  const [open, setOpen] = useState(true);

  const durationLabel = formatRunDuration(run, activeStep);
  const summaryText = activeStep
    ? `Sedang mengerjakan · ${activeStep.label.toLowerCase()}`
    : run.status === "completed"
      ? `Selesai · ${durationLabel}`
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
            <Shimmer className="truncate font-medium">{summaryText}</Shimmer>
          ) : (
            <span className="truncate font-medium">{summaryText}</span>
          )}
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {isActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-[var(--coral)] hover:text-[var(--coral)]"
            onClick={() => onCancelRun(run._id)}
          >
            Hentikan
          </Button>
        ) : null}
      </div>
      {open ? (
        <ol className="mt-2 divide-y divide-border/60 border-l border-border/60 pl-4">
          {sortedSteps.map((step) => (
            <DeepRunStep
              key={step.stepKey}
              step={step}
              artifacts={artifacts}
              runActiveArtifactId={run.activeArtifactId}
            />
          ))}
        </ol>
      ) : null}
      {run.status === "failed" && run.retryable ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--coral)]">
          <span className="flex-1">
            {run.errorMessage ?? "Riset terhenti sebelum selesai."}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[12px] text-[var(--coral)] hover:text-[var(--coral)]"
            onClick={() => onRetryRun(run._id)}
          >
            <RotateCcwIcon className="size-3.5" />
            Coba lagi
          </Button>
        </div>
      ) : null}
      {run.status === "canceled" ? (
        <p className="mt-3 text-[13px] font-medium text-muted-foreground">
          Dihentikan
        </p>
      ) : null}
    </div>
  );
}

function DeepRunStep({
  step,
  artifacts,
  runActiveArtifactId,
}: {
  step: ResearchRun["steps"][number];
  artifacts: ResearchArtifact[];
  runActiveArtifactId?: string;
}) {
  const expandable = Boolean(step.summary) || (step.artifactCount ?? 0) > 0;
  const [expanded, setExpanded] = useState(false);

  const descriptor = [
    step.sourceCount ? `${step.sourceCount} sumber` : null,
    step.artifactCount ? `${step.artifactCount} artefak` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const toneClass =
    step.status === "running"
      ? "text-foreground"
      : step.status === "completed"
        ? "text-[var(--ink-soft)]"
        : step.status === "failed" || step.status === "canceled"
          ? "text-[var(--coral)]"
          : "text-muted-foreground/80";

  const artifact = runActiveArtifactId
    ? artifacts.find((item) => item._id === runActiveArtifactId)
    : undefined;

  const toggle = () => {
    if (!expandable) return;
    setExpanded((value) => !value);
  };

  return (
    <li className="py-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expandable ? expanded : undefined}
        disabled={!expandable}
        className={cn(
          "flex w-full items-center gap-2 text-left text-[13px] leading-5",
          toneClass,
          expandable ? "hover:text-foreground" : "cursor-default",
        )}
      >
        <span className="flex-1 truncate">
          {step.status === "running" ? (
            <Shimmer>{step.label}</Shimmer>
          ) : (
            step.label
          )}
          {descriptor ? (
            <span className="ml-2 text-muted-foreground">· {descriptor}</span>
          ) : null}
          {step.status === "failed" && step.failureReason ? (
            <span className="ml-2 text-[var(--coral)]">
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
          {(step.artifactCount ?? 0) > 0 ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-[8px] border border-border/70 bg-card/60 px-2.5 py-1.5 text-[12px] text-foreground">
              <FileTextIcon className="size-3.5 text-[var(--lavender)]" />
              <span className="truncate font-medium">
                {artifact?.title ?? "Artefak riset"}
              </span>
              <span className="text-[var(--mint)]">
                +{step.artifactCount}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function formatRunDuration(
  run: ResearchRun,
  activeStep: ResearchRun["steps"][number] | undefined,
) {
  const start = run.createdAt;
  const end =
    run.completedAt ??
    run.canceledAt ??
    (activeStep ? Date.now() : run.completedAt) ??
    Date.now();
  if (!start) return "beberapa saat";
  const ms = Math.max(0, end - start);
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function ArtifactReader({
  artifact,
  citationChecks,
  onCitationClick,
}: {
  artifact: ResearchArtifact;
  citationChecks: CitationCheck[];
  onCitationClick: (citation: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = artifact.markdown ?? "Artefak ini disimpan di storage.";
  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}${window.location.pathname}?artifact=${artifact._id}`,
    );
  };
  return (
    <Artifact className="rounded-[14px] border bg-card/95 shadow-aqsha">
      <ArtifactHeader className="bg-card/80">
        <div className="flex min-w-0 items-center gap-2">
          <FileTextIcon className="size-4 text-[var(--lavender)]" />
          <ArtifactTitle className="truncate font-heading text-xl font-bold">
            {artifact.title}
          </ArtifactTitle>
        </div>
        <ArtifactActions>
          <ArtifactAction
            icon={CopyIcon}
            tooltip={copied ? "Tersalin" : "Salin markdown"}
            onClick={copyMarkdown}
          />
          <ArtifactAction
            tooltip="Bagikan link"
            onClick={copyLink}
          >
            <CopyIcon className="size-4" />
          </ArtifactAction>
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="grid gap-4 text-[15px] leading-7">
      {artifact.type === "citation_evidence_view" &&
      citationChecks.length > 0 ? (
        <div className="grid gap-3">
          {citationChecks.map((check) => (
            <div
              key={check._id}
              className="rounded-[8px] border bg-card p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                  {check.support}
                </span>
              </div>
              <p className="text-sm leading-6">{check.claim}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {check.evidence}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <AssistantMarkdown
          text={markdown}
          citedNumbers={extractCitations(markdown)}
          onCitationClick={onCitationClick}
        />
      )}
      </ArtifactContent>
    </Artifact>
  );
}

function isRunActive(run: ResearchRun) {
  return (
    run.status === "queued" ||
    run.status === "running" ||
    run.status === "waiting"
  );
}

type InterleavedEntry =
  | { kind: "message"; message: ChatMessage }
  | { kind: "run"; run: ResearchRun };

function interleaveRunsWithMessages(
  messages: ChatMessage[],
  runs: ResearchRun[],
): InterleavedEntry[] {
  if (runs.length === 0) {
    return messages.map((message) => ({ kind: "message", message }));
  }

  const usedRunIds = new Set<string>();
  const runsByPrompt = new Map<string, ResearchRun[]>();
  for (const run of runs) {
    if (!run.promptMessageId) continue;
    const bucket = runsByPrompt.get(run.promptMessageId) ?? [];
    bucket.push(run);
    runsByPrompt.set(run.promptMessageId, bucket);
  }

  const entries: InterleavedEntry[] = [];
  let pendingRuns: ResearchRun[] = [];

  for (const message of messages) {
    if (message.role !== "user" && pendingRuns.length > 0) {
      for (const run of pendingRuns) {
        entries.push({ kind: "run", run });
      }
      pendingRuns = [];
    }

    entries.push({ kind: "message", message });

    if (message.role === "user") {
      const bucket = runsByPrompt.get(message.id) ?? [];
      for (const run of bucket) {
        usedRunIds.add(run._id);
        pendingRuns.push(run);
      }
    }
  }

  for (const run of pendingRuns) {
    entries.push({ kind: "run", run });
  }

  for (const run of runs) {
    if (!usedRunIds.has(run._id)) {
      entries.push({ kind: "run", run });
    }
  }

  return entries;
}

function extractCitations(text: string) {
  return new Set(
    [...text.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1])),
  );
}

function CenteredLoading({ label }: { label: string }) {
  return (
    <div className="grid flex-1 place-items-center py-12">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

function EmptyThreadCopy({ title }: { title?: string }) {
  const applySuggestion = (suggestion: string) => {
    window.dispatchEvent(new CustomEvent("aqsha:suggestion", { detail: suggestion }));
  };

  return (
    <div className="grid flex-1 place-items-center py-16 text-center">
      <div className="grid gap-5">
        <p className="font-hand text-2xl text-[var(--lavender)]">
          quiet desk, clear sources
        </p>
        <div className="grid gap-3">
          <h1 className="font-heading text-[28px] font-bold leading-tight sm:text-[32px]">
            {title ?? "Mulai riset dari satu pertanyaan."}
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-7 text-muted-foreground">
            Tempat tenang untuk menyusun pertanyaan, membaca kembali konteks,
            dan menjaga riset tetap rapi.
          </p>
        </div>
        <Suggestions className="mx-auto max-w-full justify-center">
          <Suggestion
            suggestion="Cari sumber tentang dampak AI pada pembelajaran mandiri."
            onClick={applySuggestion}
            className="border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)] hover:bg-[var(--mint-soft)]"
          >
            Cari sumber tentang...
          </Suggestion>
          <Suggestion
            suggestion="Buat ringkasan literatur tentang retrieval augmented generation untuk pendidikan."
            onClick={applySuggestion}
            className="border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary hover:bg-[var(--sky-soft)]"
          >
            Buat ringkasan literatur...
          </Suggestion>
          <Suggestion
            suggestion="Bandingkan dua teori belajar konstruktivisme dan connectivism dengan sumber akademik."
            onClick={applySuggestion}
            className="border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] text-[var(--lavender)] hover:bg-[var(--lavender-soft)]"
          >
            Bandingkan dua teori...
          </Suggestion>
        </Suggestions>
      </div>
    </div>
  );
}

function AccessDeniedState() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center">
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight">
            Thread tidak tersedia.
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Thread ini tidak ditemukan untuk akun yang sedang masuk.
          </p>
        </div>
      </div>
      <div className="border-t bg-background/85 px-4 py-4 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <Composer
            disabled
            rateStatus={undefined}
            onSend={async () => ({ ok: true, messageId: "" })}
          />
        </div>
      </div>
    </div>
  );
}

function getMessageText(message: ChatMessage) {
  const partText = message.parts
    ?.map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("");
  return partText || message.text || "";
}
