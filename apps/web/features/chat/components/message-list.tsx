import type { UIMessage } from "ai";
import { CheckCircle2Icon, CircleDashedIcon, CircleIcon, XCircleIcon } from "lucide-react";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Spinner } from "@/components/ui/spinner";
import type { AgentEvent, AgentRun } from "@/features/chat/lib/types";
import { cn } from "@/lib/utils";

type MessagePart = UIMessage["parts"][number];
type ToolPart = Extract<MessagePart, { toolCallId: string }>;

function textFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } =>
      part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
}

function partRecord(part: MessagePart): Record<string, unknown> {
  return part as unknown as Record<string, unknown>;
}

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toolName(part: ToolPart): string {
  const record = partRecord(part);
  const rawName =
    part.type === "dynamic-tool" && typeof record.toolName === "string"
      ? record.toolName
      : part.type.replace(/^tool-/, "");

  return rawName.replaceAll("_", " ");
}

function toolState(part: ToolPart) {
  const record = partRecord(part);
  return typeof record.state === "string" ? record.state : "input-streaming";
}

function sourceParts(parts: UIMessage["parts"]) {
  return parts.filter(
    (part): part is Extract<MessagePart, { type: "source-url" | "source-document" }> =>
      part.type === "source-url" || part.type === "source-document",
  );
}

function eventsFromMessageParts(message: UIMessage, isStreaming: boolean): AgentEvent[] {
  if (message.role !== "assistant" || !isStreaming) {
    return [];
  }

  const now = new Date().toISOString();
  const events: AgentEvent[] = [];

  for (const [index, part] of message.parts.entries()) {
    if (part.type === "reasoning") {
      events.push({
        id: `${message.id}-reasoning-${index}`,
        runId: message.id,
        chatThreadId: "",
        sequence: index + 1,
        type: "reasoning",
        scope: "reasoning",
        status: part.state === "done" ? "completed" : "running",
        title: "Thinking through the request",
        summary: part.state === "done" ? "Reasoning completed." : "Astra is reasoning before answering.",
        agentName: "Astra",
        toolName: null,
        parentEventId: null,
        payload: null,
        occurredAt: now,
        createdAt: now,
      });
    }

    if (isToolPart(part)) {
      const state = toolState(part);
      events.push({
        id: `${message.id}-tool-${index}`,
        runId: message.id,
        chatThreadId: "",
        sequence: index + 1,
        type: state === "output-error" ? "tool_failed" : state === "output-available" ? "tool_completed" : "tool_running",
        scope: "tool",
        status: state === "output-error" ? "failed" : state === "output-available" ? "completed" : "running",
        title: `${state === "output-available" ? "Finished" : "Using"} ${toolName(part)}`,
        summary: state === "output-available" ? "Astra received the tool result." : "Astra is using a tool.",
        agentName: "Astra",
        toolName: toolName(part),
        parentEventId: null,
        payload: null,
        occurredAt: now,
        createdAt: now,
      });
    }

    if (part.type === "source-url" || part.type === "source-document") {
      const record = partRecord(part);
      events.push({
        id: `${message.id}-source-${index}`,
        runId: message.id,
        chatThreadId: "",
        sequence: index + 1,
        type: "source_found",
        scope: "source",
        status: "completed",
        title: "Source found",
        summary: typeof record.title === "string" ? record.title : null,
        agentName: "Astra",
        toolName: null,
        parentEventId: null,
        payload: null,
        occurredAt: now,
        createdAt: now,
      });
    }
  }

  return events;
}

function statusIcon(status: AgentEvent["status"]) {
  if (status === "completed") {
    return <CheckCircle2Icon className="size-3.5 text-emerald-600" />;
  }

  if (status === "failed") {
    return <XCircleIcon className="size-3.5 text-destructive" />;
  }

  if (status === "running") {
    return <CircleDashedIcon className="size-3.5 animate-spin text-primary" />;
  }

  return <CircleIcon className="size-3.5 text-muted-foreground" />;
}

function AgentTimeline({
  events,
  isStreaming,
  latestRun,
}: {
  events: AgentEvent[];
  isStreaming: boolean;
  latestRun: AgentRun | null;
}) {
  if (events.length === 0 && !isStreaming && !latestRun) {
    return null;
  }

  const completed = events.filter((event) => event.status === "completed").length;
  const failed = events.some((event) => event.status === "failed") || latestRun?.status === "failed";
  const running = isStreaming || latestRun?.status === "running";
  const title = failed
    ? "Agent process failed"
    : running
      ? "Astra is working"
      : `${completed || events.length} agent events finished`;

  return (
    <Task className="not-prose my-3 rounded-lg border border-border bg-card/70 px-3 py-2" open={running || failed}>
      <TaskTrigger
        title={title}
        className={cn(
          "text-sm font-medium",
          failed ? "text-destructive" : running ? "text-foreground" : "text-muted-foreground",
        )}
      />
      <TaskContent className="mt-3 space-y-2 border-l border-border pl-4">
        {events.length === 0 ? (
          <TaskItem className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5" />
            Waiting for agent events
          </TaskItem>
        ) : (
          events.map((event) => (
            <TaskItem key={event.id} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-0.5">{statusIcon(event.status)}</span>
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{event.title}</span>
                {event.summary ? <span className="block leading-5">{event.summary}</span> : null}
              </span>
            </TaskItem>
          ))
        )}
      </TaskContent>
    </Task>
  );
}

function ToolPartView({ part }: { part: ToolPart }) {
  const record = partRecord(part);
  const state = toolState(part) as Parameters<typeof ToolHeader>[0]["state"];
  const output =
    "output" in record && record.output !== undefined ? (
      <pre className="max-h-48 overflow-auto rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
        {typeof record.output === "string"
          ? record.output
          : JSON.stringify(record.output, null, 2)}
      </pre>
    ) : null;

  return (
    <Tool defaultOpen={state !== "output-available"}>
      <ToolHeader
        state={state}
        toolType={part.type === "dynamic-tool" ? `tool-${toolName(part)}` : part.type}
      />
      <ToolContent>
        <ToolInput input={record.input} />
        <ToolOutput
          errorText={typeof record.errorText === "string" ? record.errorText : undefined}
          output={output}
        />
      </ToolContent>
    </Tool>
  );
}

function AssistantParts({
  isLastMessage,
  isStreaming,
  message,
}: {
  isLastMessage: boolean;
  isStreaming: boolean;
  message: UIMessage;
}) {
  const reasoningParts = message.parts.filter(
    (part): part is Extract<MessagePart, { type: "reasoning" }> =>
      part.type === "reasoning",
  );
  const reasoningText = reasoningParts.map((part) => part.text).join("\n\n");
  const hasReasoning = reasoningText.trim().length > 0;
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isLastMessage && isStreaming && lastPart?.type === "reasoning";
  const sources = sourceParts(message.parts);

  return (
    <>
      {sources.length > 0 ? (
        <Sources open={false}>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source, index) => {
              const record = partRecord(source);
              const href =
                source.type === "source-url" && typeof record.url === "string"
                  ? record.url
                  : "";

              if (!href) {
                return null;
              }

              return (
                <Source
                  href={href}
                  key={`${message.id}-source-${index}`}
                  title={typeof record.title === "string" ? record.title : href}
                />
              );
            })}
          </SourcesContent>
        </Sources>
      ) : null}

      {hasReasoning ? (
        <Reasoning className="w-full" isStreaming={isReasoningStreaming} open={isReasoningStreaming}>
          <ReasoningTrigger isStreaming={isReasoningStreaming} />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      ) : null}

      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <MessageResponse key={`${message.id}-text-${index}`}>
              {part.text}
            </MessageResponse>
          );
        }

        if (isToolPart(part)) {
          return <ToolPartView key={`${message.id}-tool-${index}`} part={part} />;
        }

        return null;
      })}
    </>
  );
}

export function MessageList({
  events,
  isStreaming,
  latestRun,
  messages,
}: {
  events: AgentEvent[];
  isStreaming: boolean;
  latestRun: AgentRun | null;
  messages: UIMessage[];
}) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md space-y-3 rounded-2xl border border-dashed border-border bg-card px-6 py-8 shadow-sm">
          <p className="text-2xl font-bold tracking-[-0.625px] text-foreground">
            Ready when you are
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Ask a question, draft an idea, or use this temporary thread to think through your next step.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col gap-6 px-4 pb-56 pt-4 sm:px-6 lg:pt-6">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isLastMessage = index === messages.length - 1;
        const messageEvents = isLastMessage
          ? [...events, ...eventsFromMessageParts(message, isStreaming)]
          : [];

        return (
          <Message from={message.role} key={message.id}>
            <MessageContent
              className={
                isUser
                  ? "max-w-full border border-border bg-card text-card-foreground shadow-sm sm:max-w-[82%]"
                  : "w-full max-w-full gap-3 text-[15px] leading-7 sm:max-w-[92%]"
              }
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{textFromParts(message.parts)}</p>
              ) : (
                <>
                  <AgentTimeline
                    events={messageEvents}
                    isStreaming={isStreaming && isLastMessage}
                    latestRun={isLastMessage ? latestRun : null}
                  />
                  <AssistantParts
                    isLastMessage={isLastMessage}
                    isStreaming={isStreaming}
                    message={message}
                  />
                </>
              )}
            </MessageContent>
          </Message>
        );
      })}
      {isStreaming && messages.at(-1)?.role === "user" ? (
        <Message from="assistant">
          <MessageContent className="w-full max-w-full gap-3 text-[15px] leading-7 sm:max-w-[92%]">
            <AgentTimeline events={[]} isStreaming latestRun={latestRun} />
          </MessageContent>
        </Message>
      ) : null}
    </div>
  );
}
