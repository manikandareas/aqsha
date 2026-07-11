"use client";

import { SearchIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import { DetailPanelShell } from "./detail-panel-chrome";
import { useThreadPanel, useThreadPanelData } from "./thread-panel-context";

/**
 * Research plan panel — the `/deep` plan prose plus its sub-questions of ONE run
 * (`turnId`). Each sub-question opens that run's search step panel. While this run is
 * the live plan gate, the panel also carries the same Setujui / Tolak actions as the
 * inline plan card.
 */
export function PlanDetailPanel({ turnId }: { turnId: string }) {
  const panel = useThreadPanel();
  const lookups = useThreadPanelData();
  const plan = lookups?.plans.get(turnId) ?? null;
  const onClose = panel?.closePanel;

  if (!plan) {
    return (
      <DetailPanelShell title="Rencana riset">
        <p className="text-[13px] text-muted-foreground">
          Rencana riset belum tersedia untuk thread ini.
        </p>
      </DetailPanelShell>
    );
  }

  const resolve = plan.resolve;

  return (
    <DetailPanelShell eyebrow="Riset mendalam" title="Rencana riset">
      <div className="grid gap-4">
        {plan.plan ? (
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground">
            {plan.plan}
          </p>
        ) : null}

        {plan.subQuestions.length > 0 ? (
          <div className="grid gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground/70">
              {`${plan.subQuestions.length} sub-pertanyaan`}
            </span>
            {plan.subQuestions.map((question, index) => (
              <button
                key={`${index}-${question.slice(0, 24)}`}
                type="button"
                onClick={() => panel?.openSearchPanel(plan.turnId, index)}
                disabled={!panel?.openSearchPanel}
                className="group flex w-full items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-card"
              >
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 break-words text-[12px] text-foreground leading-5">
                  {question}
                </span>
                {panel?.openSearchPanel ? (
                  <SearchIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {resolve ? (
          <div className="grid gap-2 border-t pt-4">
            <p className="text-[13px] text-muted-foreground">
              Setujui untuk memulai riset, atau tolak untuk membatalkan.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  resolve(true);
                  onClose?.();
                }}
              >
                Setujui
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  resolve(false);
                  onClose?.();
                }}
              >
                Tolak
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </DetailPanelShell>
  );
}
