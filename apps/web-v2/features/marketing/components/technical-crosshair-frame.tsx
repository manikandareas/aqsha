"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TECHNICAL_FRAME_LINE_OUT = 48;
const TECHNICAL_FRAME_LINE_COLOR = "bg-border";

export function TechnicalFrameHorizontalRule() {
  const o = TECHNICAL_FRAME_LINE_OUT;

  return (
    <div
      className="relative shrink-0"
      style={{
        width: `calc(100% + ${o * 2}px)`,
        marginLeft: -o,
        marginRight: -o,
      }}
    >
      <div aria-hidden className={cn("h-px w-full", TECHNICAL_FRAME_LINE_COLOR)} />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 z-[1] size-[3px] -translate-x-1/2 -translate-y-1/2 bg-foreground"
        style={{ left: o }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 z-[1] size-[3px] translate-x-1/2 -translate-y-1/2 bg-foreground"
        style={{ right: o }}
      />
    </div>
  );
}

export function TechnicalCrosshairFrame({
  children,
  contentClassName,
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  const lineOut = TECHNICAL_FRAME_LINE_OUT;
  const lineColor = TECHNICAL_FRAME_LINE_COLOR;
  const hLineInset = { left: -lineOut, right: -lineOut };
  const vLineInset = { top: -lineOut, bottom: -lineOut };

  return (
    <div className="relative isolate w-full py-10 sm:py-12 lg:py-14">
      <span
        aria-hidden
        className={`pointer-events-none absolute top-0 z-0 h-px ${lineColor}`}
        style={hLineInset}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-0 z-0 h-px ${lineColor}`}
        style={hLineInset}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 z-0 w-px ${lineColor}`}
        style={vLineInset}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute right-0 z-0 w-px ${lineColor}`}
        style={vLineInset}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-0 size-[3px] -translate-x-1/2 -translate-y-1/2 bg-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 z-0 size-[3px] translate-x-1/2 -translate-y-1/2 bg-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 z-0 size-[3px] -translate-x-1/2 translate-y-1/2 bg-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 z-0 size-[3px] translate-x-1/2 translate-y-1/2 bg-foreground"
      />
      <div className={cn("relative z-10", contentClassName)}>{children}</div>
    </div>
  );
}
