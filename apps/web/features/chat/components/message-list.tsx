import type { UIMessage } from "ai";
import { useState } from "react";
import { ChevronDownIcon, CircleDashedIcon } from "lucide-react";

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
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  toolElbowClass,
} from "@/components/ai-elements/tool";
import {
  normalizedToolName,
  readableToolName,
  summaryFields,
  toolDisplayName,
} from "@/components/ai-elements/tool-utils";
import { Spinner } from "@/components/ui/spinner";
import type { AgentEvent, AgentRun } from "@/features/chat/lib/types";

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
  const record = partRecord(part);
  return (
    (part.type === "dynamic-tool" || part.type.startsWith("tool-")) &&
    typeof record.toolCallId === "string"
  );
}

function toolName(part: ToolPart): string {
  const record = partRecord(part);
  const rawName =
    part.type === "dynamic-tool" && typeof record.toolName === "string"
      ? record.toolName
      : part.type.replace(/^tool-/, "");

  return readableToolName(rawName);
}

function toolState(part: ToolPart) {
  const record = partRecord(part);
  return typeof record.state === "string" ? record.state : "input-streaming";
}

function toolGroupKey(part: ToolPart) {
  return normalizedToolName(toolName(part));
}

function toolGroupTitle(part: ToolPart) {
  return toolDisplayName(toolName(part), { pluralSource: true });
}

function groupedToolParts(parts: ToolPart[]) {
  const groups: { key: string; title: string; parts: ToolPart[] }[] = [];
  const groupIndexes = new Map<string, number>();

  for (const part of parts) {
    const key = toolGroupKey(part);
    const existingIndex = groupIndexes.get(key);

    if (existingIndex === undefined) {
      groupIndexes.set(key, groups.length);
      groups.push({ key, title: toolGroupTitle(part), parts: [part] });
    } else {
      groups[existingIndex]?.parts.push(part);
    }
  }

  return groups;
}

function ToolResultSummary({ value }: { value: unknown }) {
  const fields = summaryFields(value, { maxLength: 220, primitiveLabel: "Note" });

  if (fields.length === 0) {
    return null;
  }

  return (
    <dl className="space-y-1.5 text-xs leading-5">
      {fields.map((field) => (
        <div className="grid gap-0.5 sm:grid-cols-[72px_1fr]" key={field.label}>
          <dt className="text-muted-foreground/75">{field.label}</dt>
          <dd className="text-muted-foreground">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function toolPartPreview(part: ToolPart) {
  const record = partRecord(part);
  const inputFields = summaryFields(record.input, { maxLength: 220, primitiveLabel: "Note" });
  const outputFields = "output" in record
    ? summaryFields(record.output, { maxLength: 220, primitiveLabel: "Note" })
    : [];
  const mainField = outputFields[0] ?? inputFields[0];
  const secondaryField = outputFields.find((field) => field.label !== mainField?.label) ??
    inputFields.find((field) => field.label !== mainField?.label);

  return { mainField, secondaryField };
}

function ToolPartView({ part, compact = false }: { part: ToolPart; compact?: boolean }) {
  const record = partRecord(part);
  const state = toolState(part) as Parameters<typeof ToolHeader>[0]["state"];
  const [defaultOpen] = useState(() => state !== "output-available");
  const output =
    "output" in record && record.output !== undefined ? (
      <ToolResultSummary value={record.output} />
    ) : null;

  return (
    <Tool defaultOpen={defaultOpen}>
      {compact ? null : (
        <ToolHeader
          state={state}
          toolType={part.type === "dynamic-tool" ? `tool-${toolName(part)}` : part.type}
        />
      )}
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

function ToolGroup({ group }: { group: ReturnType<typeof groupedToolParts>[number] }) {
  const hasMany = group.parts.length > 1;
  const failed = group.parts.some((part) => toolState(part) === "output-error");
  const running = group.parts.some(
    (part) => !["output-available", "output-error", "output-denied"].includes(toolState(part)),
  );
  const state = failed ? "needs review" : running ? "checking" : "saved";

  if (!hasMany) {
    return <ToolPartView part={group.parts[0]} />;
  }

  return (
    <Collapsible className="group/tool-group not-prose" defaultOpen>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-baseline gap-2.5 py-1.5 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#2ecc9a]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-6 text-foreground">
          {group.title}
        </span>
        <span className="shrink-0 text-xs leading-6 text-muted-foreground">
          {group.parts.length} checks · {state}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool-group:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3 pt-1">
        <div className="space-y-3">
          {group.parts.map((part, index) => {
            const preview = toolPartPreview(part);

            return (
              <div className={`${toolElbowClass} space-y-2`} key={part.toolCallId}>
                <div className="space-y-1 text-xs leading-5">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="font-medium text-foreground">
                      {preview.mainField?.value ?? `Check ${index + 1}`}
                    </span>
                    <span className="shrink-0 text-muted-foreground/70">
                      {toolState(part) === "output-available" ? "saved" : "checking"}
                    </span>
                  </div>
                  {preview.secondaryField ? (
                    <p className="line-clamp-2 text-muted-foreground">
                      {preview.secondaryField.label}: {preview.secondaryField.value}
                    </p>
                  ) : null}
                </div>
                <ToolPartView compact part={part} />
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolParts({ parts }: { parts: ToolPart[] }) {
  if (parts.length === 0) {
    return null;
  }

  const groups = groupedToolParts(parts);

  return (
    <Collapsible className="not-prose w-full" defaultOpen>
      <CollapsibleTrigger className="group flex w-full items-baseline gap-2 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        <span className="text-[13px] font-medium leading-6 text-muted-foreground">
          Research steps
        </span>
        <span className="text-xs leading-6 text-muted-foreground/75">
          {groups.length} group{groups.length === 1 ? "" : "s"} · {parts.length} check
          {parts.length === 1 ? "" : "s"}
        </span>
        <ChevronDownIcon className="ml-auto size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <div className="space-y-1.5">
          {groups.map((group) => (
            <ToolGroup group={group} key={group.key} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ReasoningParts({
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

  if (!hasReasoning) {
    return null;
  }

  return (
    <Reasoning className="w-full" isStreaming={isReasoningStreaming} open={isReasoningStreaming}>
      <ReasoningTrigger isStreaming={isReasoningStreaming}>
        <span className="text-[13px] font-medium leading-6 text-muted-foreground">
          {isReasoningStreaming ? "Connecting the ideas" : "Working notes"}
        </span>
      </ReasoningTrigger>
      <ReasoningContent className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {reasoningText}
      </ReasoningContent>
    </Reasoning>
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
  const toolParts = message.parts.filter(isToolPart);
  const textParts = message.parts.filter(
    (part): part is Extract<MessagePart, { type: "text" }> => part.type === "text",
  );
  const hasMeta = toolParts.length > 0 || message.parts.some((part) => part.type === "reasoning");

  return (
    <>
      {hasMeta ? (
        <div className="mb-1 space-y-4">
          <ReasoningParts
            isLastMessage={isLastMessage}
            isStreaming={isStreaming}
            message={message}
          />
          <ToolParts parts={toolParts} />
        </div>
      ) : null}
      {textParts.map((part, index) => (
        <MessageResponse key={`${message.id}-text-${index}`}>{part.text}</MessageResponse>
      ))}
    </>
  );
}

function PendingAssistantMessage({ latestRun }: { latestRun: AgentRun | null }) {
  return (
    <Message from="assistant">
      <MessageContent className="w-full max-w-full gap-3 text-[15px] leading-7 sm:max-w-[92%]">
        <div className="not-prose flex w-fit items-center gap-2.5 text-sm text-muted-foreground">
          {latestRun?.status === "failed" ? (
            <CircleDashedIcon className="size-4 text-destructive" />
          ) : (
            <Spinner className="size-4" />
          )}
          {latestRun?.status === "failed"
            ? "Aqsha could not finish this response."
            : "Aqsha is linking the useful bits."}
        </div>
      </MessageContent>
    </Message>
  );
}

export function MessageList({
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
            Ask a research question and save the useful bits into your Journal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col gap-6 px-4 pb-8 pt-4 sm:px-6 lg:pt-6">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isLastMessage = index === messages.length - 1;

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
                <AssistantParts
                  isLastMessage={isLastMessage}
                  isStreaming={isStreaming}
                  message={message}
                />
              )}
            </MessageContent>
          </Message>
        );
      })}
      {isStreaming && messages.at(-1)?.role === "user" ? (
        <PendingAssistantMessage latestRun={latestRun} />
      ) : null}
    </div>
  );
}
