"use client";

import { Loader2Icon } from "@aqsha/ui/icons";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type AppLoadingOverlayProps = {
  /** Primary line, shown larger and centered. */
  label?: string;
  /** Optional rotating hints below the label. Cycles when more than one. */
  messages?: string[];
  /**
   * `fixed` covers the whole viewport (use for full-app gates); `absolute`
   * fills the nearest positioned ancestor (use to cover a single page region).
   */
  variant?: "fixed" | "absolute";
  className?: string;
};

const DEFAULT_MESSAGES = [
  "Menyiapkan ruang kerja kamu",
  "Menautkan catatan dan sumber",
  "Sebentar lagi siap",
];

export function AppLoadingOverlay({
  label = "Memuat",
  messages = DEFAULT_MESSAGES,
  variant = "fixed",
  className,
}: AppLoadingOverlayProps) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  const cycle = messages.length > 1 && !reduceMotion;

  useEffect(() => {
    if (!cycle) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, 2200);
    return () => clearInterval(id);
  }, [cycle, messages.length]);

  const activeMessage = messages[cycle ? index : 0] ?? "";

  return (
    <output
      aria-live="polite"
      aria-label={label}
      className={cn(
        "z-50 flex w-full items-center justify-center bg-background/80 backdrop-blur-md",
        variant === "fixed" ? "fixed inset-0" : "absolute inset-0",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <Loader2Icon
          className={cn(
            "size-7 text-muted-foreground",
            !reduceMotion && "animate-spin",
          )}
        />

        <div className="flex flex-col items-center gap-2">
          <p className="font-heading text-lg font-semibold text-foreground">
            {label}
          </p>
          <div className="h-5 overflow-hidden">
            <AnimatePresence mode="wait">
              <m.p
                key={activeMessage}
                className="text-sm text-muted-foreground"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                {activeMessage}
              </m.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </output>
  );
}
