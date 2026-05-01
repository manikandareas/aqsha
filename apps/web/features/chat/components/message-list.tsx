import type { UIMessage } from "ai";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  CircleIcon,
  ExternalLinkIcon,
  InfoIcon,
  SearchIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
type TimelineEvent = AgentEvent & {
  displayTitle: string;
  displaySummary: string | null;
};

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

function payloadRecord(event: AgentEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object"
    ? (event.payload as Record<string, unknown>)
    : {};
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

function sentenceCase(value: string): string {
  if (!value) {
    return value;
  }

  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function normalizedName(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/^tool-/, "")
    .replace(/^Using\s+/i, "")
    .replace(/^Finished\s+/i, "")
    .replace(/\s+(completed|failed)$/i, "")
    .replaceAll("_", " ")
    .trim()
    .toLowerCase();
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
        title: "Reasoning",
        summary: part.state === "done" ? "Reasoning completed." : "Astra is reasoning.",
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
        payload: { toolCallId: part.toolCallId },
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

function latestRunEvents(events: AgentEvent[], latestRun: AgentRun | null) {
  if (latestRun) {
    return events.filter((event) => event.runId === latestRun.id);
  }

  const latestRunId = events.at(-1)?.runId;

  if (!latestRunId) {
    return [];
  }

  return events.filter((event) => event.runId === latestRunId);
}

function sortEvents(events: AgentEvent[]) {
  return [...events].sort((first, second) => {
    const sequenceDelta = first.sequence - second.sequence;

    if (sequenceDelta !== 0) {
      return sequenceDelta;
    }

    return first.occurredAt.localeCompare(second.occurredAt);
  });
}

function timelineTitle(event: AgentEvent) {
  if (event.scope === "run") {
    if (event.status === "failed") {
      return event.agentName ? `${event.agentName} failed` : "Agent failed";
    }

    if (event.type === "run_completed") {
      return event.agentName ? `${event.agentName} finished` : "Agent finished";
    }

    return event.agentName ? `${event.agentName} started` : event.title;
  }

  if (event.scope === "reasoning") {
    return "Reasoning";
  }

  if (event.scope === "tool") {
    const name = event.toolName?.replace(/^tool-/, "").replaceAll("_", " ");

    if (!name) {
      return event.title;
    }

    if (event.status === "completed") {
      return `${sentenceCase(name)} completed`;
    }

    if (event.status === "failed") {
      return `${sentenceCase(name)} failed`;
    }

    return `Using ${name}`;
  }

  if (event.scope === "source") {
    return "Source found";
  }

  if (event.type === "stream_finish") {
    return "Response completed";
  }

  if (event.type === "step_start") {
    return "Preparing next step";
  }

  return event.title;
}

function timelineSummary(event: AgentEvent) {
  if (
    event.scope === "run" ||
    event.scope === "reasoning" ||
    event.scope === "tool" ||
    event.type === "stream_finish" ||
    event.type === "step_start"
  ) {
    return null;
  }

  return event.summary;
}

function timelineKey(event: TimelineEvent) {
  return [
    event.runId,
    event.scope,
    event.type,
    toolCallIdFromEvent(event) ?? "",
    event.toolName ?? "",
    event.displayTitle,
    event.status,
  ].join(":");
}

function normalizeTimelineEvents(events: AgentEvent[]) {
  const sortedEvents = sortEvents(events);
  const hasRunStart = sortedEvents.some((event) => event.type === "run_started");
  const timelineEvents: TimelineEvent[] = [];
  const eventIndexes = new Map<string, number>();
  let reasoningIndex: number | null = null;

  for (const event of sortedEvents) {
    if (event.type === "stream_start" && hasRunStart) {
      continue;
    }

    if (event.type === "step_finish") {
      continue;
    }

    if (event.scope === "reasoning") {
      const displayEvent: TimelineEvent = {
        ...event,
        id: `${event.runId}-reasoning`,
        displayTitle: "Reasoning",
        displaySummary: null,
        status: event.status === "completed" ? "completed" : "running",
      };

      if (reasoningIndex === null) {
        reasoningIndex = timelineEvents.length;
        timelineEvents.push(displayEvent);
      } else {
        const previous = timelineEvents[reasoningIndex];
        timelineEvents[reasoningIndex] = {
          ...previous,
          status:
            previous.status === "completed" || event.status === "completed"
              ? "completed"
              : event.status,
          occurredAt: event.occurredAt,
        };
      }

      continue;
    }

    const displayEvent: TimelineEvent = {
      ...event,
      displayTitle: timelineTitle(event),
      displaySummary: timelineSummary(event),
    };
    const key = timelineKey(displayEvent);
    const existingIndex = eventIndexes.get(key);

    if (existingIndex === undefined) {
      eventIndexes.set(key, timelineEvents.length);
      timelineEvents.push(displayEvent);
    } else {
      timelineEvents[existingIndex] = displayEvent;
    }
  }

  return timelineEvents;
}

function mergeTimelineEvents(events: AgentEvent[], liveEvents: AgentEvent[]) {
  return normalizeTimelineEvents([...events, ...liveEvents]);
}

function eventScopeLabel(scope: AgentEvent["scope"]) {
  if (scope === "run") {
    return "agent";
  }

  if (scope === "stream") {
    return "response";
  }

  return scope;
}

function toolCallIdFromEvent(event: AgentEvent): string | null {
  const rawToolCallId = payloadRecord(event).toolCallId;

  return typeof rawToolCallId === "string" ? rawToolCallId : null;
}

function assignToolPartsToEvents(events: TimelineEvent[], toolParts: ToolPart[]) {
  const assignments = new Map<string, ToolPart>();
  const usedToolCallIds = new Set<string>();
  const partsById = new Map(toolParts.map((part) => [part.toolCallId, part]));

  for (const event of events) {
    if (event.scope !== "tool") {
      continue;
    }

    const toolCallId = toolCallIdFromEvent(event);

    if (!toolCallId || usedToolCallIds.has(toolCallId)) {
      continue;
    }

    const part = partsById.get(toolCallId);

    if (part) {
      assignments.set(event.id, part);
      usedToolCallIds.add(part.toolCallId);
    }
  }

  for (const event of events) {
    if (event.scope !== "tool" || assignments.has(event.id)) {
      continue;
    }

    const eventToolName = normalizedName(event.toolName ?? event.displayTitle);
    const part = toolParts.find(
      (candidate) =>
        !usedToolCallIds.has(candidate.toolCallId) &&
        normalizedName(toolName(candidate)) === eventToolName,
    );

    if (part) {
      assignments.set(event.id, part);
      usedToolCallIds.add(part.toolCallId);
    }
  }

  for (const event of events) {
    if (event.scope !== "tool" || assignments.has(event.id)) {
      continue;
    }

    const part = toolParts.find(
      (candidate) => !usedToolCallIds.has(candidate.toolCallId),
    );

    if (part) {
      assignments.set(event.id, part);
      usedToolCallIds.add(part.toolCallId);
    }
  }

  return {
    assignments,
    unassignedToolParts: toolParts.filter(
      (part) => !usedToolCallIds.has(part.toolCallId),
    ),
  };
}

function statusIcon(status: AgentEvent["status"]) {
  if (status === "completed") {
    return <CheckCircle2Icon className="size-4 text-[#2a9d99]" />;
  }

  if (status === "failed") {
    return <XCircleIcon className="size-4 text-destructive" />;
  }

  if (status === "running") {
    return <CircleDashedIcon className="size-4 animate-spin text-primary" />;
  }

  return <CircleIcon className="size-4 text-muted-foreground" />;
}

function agentActivityLabel(events: TimelineEvent[], running: boolean, failed: boolean) {
  const completedAgentCount = events.filter(
    (event) => event.scope === "run" && event.status === "completed",
  ).length;
  const toolUseCount = events.filter((event) => event.scope === "tool").length;

  if (failed) {
    return "Agent run failed";
  }

  if (completedAgentCount > 1) {
    return `${completedAgentCount} agents finished`;
  }

  if (running) {
    return "Astra is working";
  }

  if (completedAgentCount === 1) {
    return "Astra finished";
  }

  if (toolUseCount > 0) {
    return `${toolUseCount} tool use${toolUseCount === 1 ? "" : "s"} recorded`;
  }

  return "Agent activity";
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
    notation: "compact",
  }).format(value);
}

function payloadNumber(event: AgentEvent, keys: string[]) {
  const payload = payloadRecord(event);

  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replaceAll(",", ""));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function firstPayloadNumber(events: AgentEvent[], keys: string[]) {
  for (const event of events) {
    const value = payloadNumber(event, keys);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function timelineMetrics(events: TimelineEvent[], toolParts: ToolPart[]) {
  const toolEvents = events.filter((event) => event.scope === "tool").length;
  const sourceEvents = events.filter((event) => event.scope === "source").length;
  const completedEvents = events.filter(
    (event) => event.status === "completed",
  ).length;
  const failedEvents = events.filter((event) => event.status === "failed").length;
  const retrieved =
    firstPayloadNumber(events, [
      "retrieved",
      "retrievedCount",
      "totalRetrieved",
      "totalResults",
      "total_results",
    ]) ?? Math.max(events.length + toolParts.length + sourceEvents, 0);
  const eligible =
    firstPayloadNumber(events, [
      "eligible",
      "eligibleCount",
      "candidateCount",
      "candidates",
      "results",
    ]) ?? Math.max(toolEvents + toolParts.length, 0);
  const included =
    firstPayloadNumber(events, [
      "included",
      "includedCount",
      "accepted",
      "acceptedCount",
      "sources",
    ]) ?? Math.max(completedEvents - failedEvents, 0);

  return [
    { label: "Found", value: retrieved },
    { label: "Checked", value: eligible },
    { label: "Used", value: included },
  ];
}

function isSearchEvent(event: TimelineEvent) {
  return (
    event.scope === "tool" ||
    event.scope === "source" ||
    event.toolName?.toLowerCase().includes("search") ||
    event.displayTitle.toLowerCase().includes("search")
  );
}

function TimelineSearchMarker({ status }: { status: AgentEvent["status"] }) {
  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center">
      <SearchIcon
        className={cn(
          "size-3.5",
          status === "failed" ? "text-destructive" : "text-foreground",
        )}
      />
      <span
        className={cn(
          "absolute bottom-0 right-0 h-2 w-1.5 rounded-full",
          status === "failed" ? "bg-destructive" : "bg-primary",
        )}
      />
    </span>
  );
}

function runStatusLabel({
  failed,
  running,
}: {
  failed: boolean;
  running: boolean;
}) {
  if (failed) {
    return "needs a look";
  }

  if (running) {
    return "searching";
  }

  return "ready";
}

function eventStatusLabel(status: AgentEvent["status"]) {
  if (status === "completed") {
    return "done";
  }

  if (status === "failed") {
    return "needs review";
  }

  if (status === "running") {
    return "searching";
  }

  return "queued";
}

function scopeCopy(scope: AgentEvent["scope"]) {
  if (scope === "run") {
    return "overview";
  }

  if (scope === "stream") {
    return "answer";
  }

  if (scope === "tool") {
    return "search";
  }

  return eventScopeLabel(scope);
}

function AgentTimeline({
  events,
  isStreaming,
  latestRun,
  toolParts,
}: {
  events: AgentEvent[];
  isStreaming: boolean;
  latestRun: AgentRun | null;
  toolParts: ToolPart[];
}) {
  if (events.length === 0 && toolParts.length === 0 && !isStreaming && !latestRun) {
    return null;
  }

  const failed =
    events.some((event) => event.status === "failed") ||
    latestRun?.status === "failed";
  const running = isStreaming || latestRun?.status === "running";
  const timelineEvents = normalizeTimelineEvents(events);
  const title = agentActivityLabel(timelineEvents, running, failed);
  const { assignments, unassignedToolParts } = assignToolPartsToEvents(
    timelineEvents,
    toolParts,
  );
  const searchCount =
    timelineEvents.filter(isSearchEvent).length + unassignedToolParts.length;
  const metrics = timelineMetrics(timelineEvents, toolParts);
  const statusText = runStatusLabel({ failed, running });

  return (
    <Collapsible
      className="group/timeline not-prose my-3 w-full py-1"
      defaultOpen
    >
      <CollapsibleTrigger
        className={cn(
          "mb-1.5 flex w-full cursor-pointer items-center gap-2.5 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          failed
            ? "text-destructive"
            : running
              ? "text-foreground"
              : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "size-2.5 rounded-full",
            failed
              ? "bg-destructive"
              : running
                ? "bg-primary"
                : "bg-[#2a9d99]",
          )}
        />
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-sm font-bold text-foreground">Deep search</span>
          <span className="text-[13px] text-muted-foreground">
            · {searchCount || timelineEvents.length || 1} step
            {(searchCount || timelineEvents.length || 1) === 1 ? "" : "es"}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · {statusText}
          </span>
        </span>
        <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]/timeline:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-3 border-l border-border pl-5">
        <div className="grid max-w-3xl grid-cols-3 border-b border-border pb-3 pt-2.5">
          {metrics.map((metric, index) => (
            <div
              className={cn(
                "min-w-0 pr-3",
                index > 0 && "border-l border-border pl-4",
              )}
              key={metric.label}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold tracking-[-0.25px] text-foreground sm:text-2xl">
                  {compactNumber(metric.value)}
                </span>
                <InfoIcon className="size-3 text-muted-foreground" />
              </div>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                {metric.label}
              </p>
            </div>
          ))}
        </div>

        <div className="max-w-3xl space-y-4 py-4">
        {timelineEvents.length === 0 ? (
          <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
            <span className="flex size-4 items-center justify-center">
              <Spinner className="size-3.5" />
            </span>
            Getting the search ready
          </div>
        ) : (
          timelineEvents.map((event) => {
            const assignedToolPart = assignments.get(event.id);

            return (
              <div key={event.id} className="space-y-1.5">
                {isSearchEvent(event) ? (
                  <div className="flex min-w-0 items-center gap-3">
                    <TimelineSearchMarker status={event.status} />
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="min-w-0 text-sm font-semibold leading-6 text-foreground">
                        {event.displayTitle}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {eventStatusLabel(event.status)}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.125px] text-muted-foreground">
                        {scopeCopy(event.scope)}
                      </span>
                      <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                    </div>
                    {event.displaySummary ? (
                      <p className="basis-full pl-7 text-[13px] leading-5 text-muted-foreground">
                        {event.displaySummary}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-4 items-center justify-center">
                        {statusIcon(event.status)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                          <h3 className="text-[15px] font-bold leading-6 text-foreground">
                            {event.displayTitle || title}
                          </h3>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.125px] text-muted-foreground">
                            {scopeCopy(event.scope)}
                          </span>
                        </div>
                        {event.displaySummary ? (
                          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                            {event.displaySummary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
                {assignedToolPart ? (
                  <div className="pl-7">
                    <ToolPartView part={assignedToolPart} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {unassignedToolParts.length > 0 ? (
          <div className="space-y-3 pt-0.5">
            {unassignedToolParts.map((part) => (
              <div
                key={`agent-tool-unassigned-${part.toolCallId}`}
                className="space-y-1.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TimelineSearchMarker
                    status={toolState(part) === "output-error" ? "failed" : "completed"}
                  />
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-sm font-semibold leading-6 text-foreground">
                      {sentenceCase(toolName(part))}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.125px] text-muted-foreground">
                      search
                    </span>
                    <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                  </span>
                </div>
                <div className="pl-7">
                  <ToolPartView part={part} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
        <Sources>
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
        <Reasoning
          className="w-full"
          isStreaming={isReasoningStreaming}
          open={isReasoningStreaming}
        >
          <ReasoningTrigger isStreaming={isReasoningStreaming}>
            <SparklesIcon className="size-4" />
            <span>
              {isReasoningStreaming ? "Thinking it through..." : "Working notes"}
            </span>
          </ReasoningTrigger>
          <ReasoningContent className="whitespace-pre-wrap">
            {reasoningText}
          </ReasoningContent>
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
        <div className="max-w-md space-y-3 border-l border-border px-6 py-8 text-left">
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

  const persistedTimelineEvents = latestRunEvents(events, latestRun);
  const lastAssistantIndex = messages.reduce(
    (latestIndex, message, index) =>
      message.role === "assistant" ? index : latestIndex,
    -1,
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col gap-6 px-4 pb-56 pt-4 sm:px-6 lg:pt-6">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isLastMessage = index === messages.length - 1;
        const isCurrentAssistant = message.role === "assistant" && index === lastAssistantIndex;
        const liveEvents = isCurrentAssistant
          ? eventsFromMessageParts(message, isStreaming && isLastMessage)
          : [];
        const messageEvents = isCurrentAssistant
          ? mergeTimelineEvents(persistedTimelineEvents, liveEvents)
          : [];
        const toolParts = isCurrentAssistant ? message.parts.filter(isToolPart) : [];

        return (
          <Message from={message.role} key={message.id}>
            <MessageContent
              className={
                isUser
                  ? "max-w-full sm:max-w-[82%]"
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
                    toolParts={toolParts}
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
            <AgentTimeline events={[]} isStreaming latestRun={latestRun} toolParts={[]} />
          </MessageContent>
        </Message>
      ) : null}
    </div>
  );
}
