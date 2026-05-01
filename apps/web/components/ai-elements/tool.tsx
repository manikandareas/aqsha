"use client";

import type { ComponentProps, ReactNode } from "react";
import { CheckCircle2Icon, ChevronDownIcon, CircleDashedIcon, XCircleIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

function stateLabel(state: ToolState) {
  if (state === "output-available") return "Done";
  if (state === "output-error" || state === "output-denied") return "Failed";
  return "Running";
}

function ToolStatusIcon({ state }: { state: ToolState }) {
  if (state === "output-available") {
    return <CheckCircle2Icon className="size-3.5 text-emerald-600" />;
  }

  if (state === "output-error" || state === "output-denied") {
    return <XCircleIcon className="size-3.5 text-destructive" />;
  }

  return <CircleDashedIcon className="size-3.5 animate-spin text-primary" />;
}

export type ToolProps = ComponentProps<typeof Collapsible>;

export function Tool({ className, ...props }: ToolProps) {
  return (
    <Collapsible
      className={cn(
        "group/tool not-prose border-l border-border pl-2.5",
        className,
      )}
      {...props}
    />
  );
}

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  toolType: string;
  state: ToolState;
};

export function ToolHeader({ className, toolType, state, ...props }: ToolHeaderProps) {
  const label = toolType.replace(/^tool-/, "").replaceAll("_", " ");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-3 py-1 text-left text-[13px] text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <ToolStatusIcon state={state} />
        <span className="truncate font-medium capitalize">{label}</span>
      </span>
      <span className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="h-5 rounded-full border-border bg-background px-2 text-[11px] font-medium"
        >
          {stateLabel(state)}
        </Badge>
        <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
      </span>
    </CollapsibleTrigger>
  );
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent
      className={cn("pb-1.5 pl-5 pt-0.5", className)}
      {...props}
    />
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return (
    <pre className="max-h-40 overflow-auto border-l border-border bg-muted/45 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function ToolInput({ input }: { input: unknown }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Request</p>
      <JsonBlock value={input} />
    </div>
  );
}

export function ToolOutput({
  output,
  errorText,
}: {
  output?: ReactNode;
  errorText?: string;
}) {
  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Result</p>
      {errorText ? (
        <p className="border-l border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {errorText}
        </p>
      ) : (
        output
      )}
    </div>
  );
}
