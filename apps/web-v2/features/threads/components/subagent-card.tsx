"use client";

import { Loader2Icon, TelescopeIcon, XCircleIcon } from "@aqsha/ui/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import type { ToolRowModel } from "../lib/eve-timeline";

/**
 * Kartu sub-agen (port-inspired V1) untuk part `dynamic-tool` ber-`kind:"subagent-call"`.
 * eve TIDAK memproyeksikan aktivitas internal sub-agen (ia child-session terpisah), jadi
 * kartu ini sengaja ringkas: nama + status + ringkasan output — TANPA timeline nested,
 * progress "N langkah", atau detail panel (datanya memang tak ada). Running → shimmer.
 */
export function SubagentCard({ model }: { model: ToolRowModel }) {
  const failed = model.status === "failed" || model.status === "denied";
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-[10px] border border-border/70 bg-card/40 px-3 py-2 text-[13px] leading-5">
      {model.isRunning ? (
        <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
      ) : failed ? (
        <XCircleIcon className="mt-0.5 size-4 shrink-0 text-red-500" />
      ) : (
        <TelescopeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {model.isRunning ? (
            <Shimmer as="span" className="font-medium">
              {model.title}
            </Shimmer>
          ) : (
            <span className={cn("font-medium", failed ? "text-red-500" : "text-foreground")}>
              {model.title}
            </span>
          )}
          <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0 text-[11px] font-medium text-muted-foreground">
            Sub-agen
          </span>
        </div>
        {model.description ? (
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {model.description}
          </span>
        ) : null}
      </div>
    </div>
  );
}
