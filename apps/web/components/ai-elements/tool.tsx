"use client";

import type { ComponentProps, ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { summaryFields, toolDisplayName } from "@/components/ai-elements/tool-utils";
import { cn } from "@/lib/utils";

type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

function stateDotClass(state: ToolState) {
  if (state === "output-available") return "bg-[#2ecc9a]";
  if (state === "output-error" || state === "output-denied")
    return "bg-destructive";
  return "bg-primary";
}

export const toolElbowClass = "relative ml-[3px] pl-5 before:absolute before:left-0 before:top-0 before:h-6 before:w-4 before:rounded-bl-[3px] before:border-b-2 before:border-l-2 before:border-muted-foreground/45";

export type ToolProps = ComponentProps<typeof Collapsible>;

export function Tool({ className, ...props }: ToolProps) {
  return (
    <Collapsible className={cn("group/tool not-prose", className)} {...props} />
  );
}

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  toolType: string;
  state: ToolState;
};

export function ToolHeader({
  className,
  toolType,
  state,
  ...props
}: ToolHeaderProps) {
  const label = toolDisplayName(toolType);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full cursor-pointer items-baseline gap-2.5 py-1.5 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full",
          stateDotClass(state),
        )}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-6 text-foreground">
        {label}
      </span>

      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export function ToolContent({
  className,
  children,
  ...props
}: ToolContentProps) {
  return (
    <CollapsibleContent className={cn("pb-3 pt-1", className)} {...props}>
      <div className={toolElbowClass}>{children}</div>
    </CollapsibleContent>
  );
}

function DetailBlock({ value }: { value: unknown }) {
  const fields = summaryFields(value);

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

export function ToolInput({ input }: { input: unknown }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground/80">
        What Aqsha checked
      </p>
      <DetailBlock value={input} />
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
    <div className="mt-3 space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground/80">
        What came back
      </p>
      {errorText ? (
        <p className="border-l-2 border-destructive/60 pl-3 text-xs leading-5 text-destructive">
          {errorText}
        </p>
      ) : (
        output
      )}
    </div>
  );
}
