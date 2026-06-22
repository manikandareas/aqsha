"use client";

import { Badge } from "@aqsha/ui/components/badge";
import {
  ChevronDownIcon,
  Loader2Icon,
  TelescopeIcon,
  WrenchIcon,
  XCircleIcon,
} from "@aqsha/ui/icons";
import { useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolRow as ToolRowData, ToolRowModel, ToolStatus } from "../lib/eve-timeline";

// Glyph kunci = wrench ("ini pemanggilan alat" sekilas pandang). Afordans live/gagal
// tetap: running → spinner; failed/denied → silang; selain itu → wrench. Delegasi
// subagent (kind "subagent-call", Slice 7.1) pakai teleskop agar terbaca sebagai
// aktivitas riset terdelegasi, bukan tool biasa.
function ToolStatusIcon({
  status,
  kind,
  className,
}: {
  status: ToolStatus;
  kind?: ToolRowModel["kind"];
  className?: string;
}) {
  switch (status) {
    case "running":
      return <Loader2Icon className={cn(className, "animate-spin text-primary")} />;
    case "failed":
      return <XCircleIcon className={cn(className, "text-red-500")} />;
    case "denied":
      return <XCircleIcon className={cn(className, "text-muted-foreground")} />;
    default:
      return kind === "subagent-call" ? (
        <TelescopeIcon className={cn(className, "text-muted-foreground")} />
      ) : (
        <WrenchIcon className={cn(className, "text-muted-foreground")} />
      );
  }
}

function toneClass(status: ToolStatus): string {
  switch (status) {
    case "running":
    case "completed":
      return "text-foreground";
    case "failed":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Satu pemanggilan alat sebagai baris collapsible (Slice 6.3, port shell V1).
 * Collapsed: ikon status + judul (Shimmer + kueri inline selagi running) + badge
 * hasil. Expanded: scalar curated (default-deny via adapter) dikelompokkan Masukan
 * / Hasil. Tool tanpa body scalar = baris polos.
 *
 * Auto-open selagi aktif, auto-collapse saat settle — kecuali user menggeser manual
 * (override sticky).
 */
export function ToolRow({ model }: { model: ToolRowModel }) {
  const hasBody = model.rows.length > 0;
  const inputRows = model.rows.filter((row) => row.group === "input");
  const outputRows = model.rows.filter((row) => row.group === "output");
  // Descriptor inline selagi running: kueri (tool) atau tugas (subagent, key "message").
  const liveQuery = model.isRunning
    ? model.rows.find((row) => row.key === "query" || row.key === "message")?.value
    : undefined;

  // null = ikut auto (open == isRunning); boolean = pilihan manual user yang sticky.
  const [override, setOverride] = useState<boolean | null>(null);
  const prevRunning = useRef(model.isRunning);
  useEffect(() => {
    // Reset override saat transisi running → settle agar auto-collapse berlaku lagi
    // untuk user yang tak pernah menggeser.
    if (prevRunning.current && !model.isRunning) setOverride((cur) => (cur === true ? cur : null));
    prevRunning.current = model.isRunning;
  }, [model.isRunning]);
  const open = override ?? model.isRunning;

  const header = (
    <span className={cn("flex min-w-0 items-start gap-1.5 leading-5", toneClass(model.status))}>
      <ToolStatusIcon
        status={model.status}
        kind={model.kind}
        className="mt-0.5 size-3.5 shrink-0"
      />
      <span className="min-w-0">
        {model.isRunning ? <Shimmer as="span">{model.title}</Shimmer> : <span>{model.title}</span>}
        {liveQuery ? <span className="text-muted-foreground"> · {liveQuery}</span> : null}
      </span>
    </span>
  );

  const resultBadge = model.description ? (
    <Badge
      variant="secondary"
      className="mt-px shrink-0 rounded-full bg-muted/60 px-2 py-0 font-medium text-[11px] text-muted-foreground"
    >
      {model.description}
    </Badge>
  ) : null;

  if (!hasBody) {
    return (
      <div className="flex min-w-0 items-start gap-1.5">
        {header}
        {resultBadge}
      </div>
    );
  }

  return (
    <Collapsible className="min-w-0" open={open} onOpenChange={(next) => setOverride(next)}>
      <CollapsibleTrigger className="-mx-1.5 group flex w-full min-w-0 items-start gap-1.5 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {header}
        {resultBadge}
        <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="mt-1.5 grid gap-2 pl-3 text-[12px]">
          <ToolRowSection label="Masukan" rows={inputRows} />
          <ToolRowSection
            label="Hasil"
            rows={outputRows}
            tone={model.status === "failed" ? "danger" : "default"}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolRowSection({
  label,
  rows,
  tone = "default",
}: {
  label: string;
  rows: ToolRowData[];
  tone?: "default" | "danger";
}) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-1">
      <dt className="font-medium text-[11px] text-muted-foreground/70">{label}</dt>
      {rows.map((row) => (
        <div key={row.key} className="flex min-w-0 gap-1.5">
          <dt className="shrink-0 text-muted-foreground">{row.label}:</dt>
          <dd
            className={cn(
              "min-w-0 break-words",
              tone === "danger" ? "text-red-500" : "text-foreground",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
