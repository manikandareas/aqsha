"use client";

import { CheckCircle2, XCircleIcon } from "@aqsha/ui/icons";
import { m, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const comparisonCards = [
  {
    variant: "other" as const,
    label: "AI lain",
    source: "(Smith et al., 2021), Journal of Psychology",
    result:
      "Kamu klik — paper-nya nggak ada. Kutipannya juga ngarang. Ketahuan pas direview.",
  },
  {
    variant: "aqsha" as const,
    label: "Aqsha",
    source: "(Smith et al., 2021), Journal of Psychology",
    result:
      "Dicek otomatis: paper-nya beneran ada, dan kalimatnya cocok sama isi aslinya. Aman.",
  },
] as const;

export function HeroComparisonCard({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-4 text-sm text-muted-foreground sm:mb-5 sm:text-[15px]">
        Kamu minta sumber buat satu klaim. Hasilnya:
      </p>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {comparisonCards.map((card, index) => {
          const isAqsha = card.variant === "aqsha";

          return (
            <m.article
              key={card.variant}
              className={cn(
                "rounded-2xl border p-5 sm:p-6",
                isAqsha
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-destructive/25 bg-destructive/5",
              )}
              initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 24,
                delay: reduce ? 0 : 0.12 + index * 0.08,
              }}
            >
              <div className="flex items-center gap-2">
                {isAqsha ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircleIcon className="size-5 shrink-0 text-destructive" />
                )}
                <span className="text-sm font-medium text-foreground sm:text-[15px]">
                  {card.label}
                </span>
              </div>
              <div className="mt-4 rounded-xl border border-border bg-card p-3.5 sm:p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sumber
                </p>
                <p className="mt-1.5 text-sm leading-snug text-foreground">{card.source}</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-[15px] sm:leading-snug">
                {card.result}
              </p>
            </m.article>
          );
        })}
      </div>
    </div>
  );
}
