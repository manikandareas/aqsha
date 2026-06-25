"use client";

import { cn } from "@/lib/utils";
import { VERDICT_STYLE } from "../format";
import type { FeedVerdict } from "../types";

export function VerdictBadge({ verdict, className }: { verdict: FeedVerdict; className?: string }) {
  const style = VERDICT_STYLE[verdict];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] border px-2 py-0.5 text-[11px] font-semibold leading-none",
        style.className,
        className,
      )}
    >
      <Icon className="size-3" />
      {style.label}
    </span>
  );
}

export function StanceTally({
  supporting,
  contrasting,
  className,
}: {
  supporting: number;
  contrasting: number;
  className?: string;
}) {
  const total = supporting + contrasting;
  if (total <= 0) return null;
  const supPct = Math.round((supporting / total) * 100);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-mint" style={{ width: `${supPct}%` }} />
        <div className="h-full bg-coral" style={{ width: `${100 - supPct}%` }} />
      </div>
      <p className="text-[11px] font-medium text-muted-foreground">
        <span className="text-mint-foreground">{supporting} mendukung</span>
        {" · "}
        <span className="text-coral-foreground">{contrasting} kontra</span>
      </p>
    </div>
  );
}

export function Sparkline({
  values,
  className,
  stroke = "var(--coral)",
  fill = "var(--coral-soft)",
}: {
  values: number[];
  className?: string;
  stroke?: string;
  fill?: string;
}) {
  if (!values || values.length < 2) return null;
  const width = 120;
  const height = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <polyline points={areaPoints} fill={fill} stroke="none" opacity={0.5} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Donut (segmented ring for small distributions) ────────────────────────
export function Donut({
  segments,
  total,
  size = 96,
  centerLabel,
  centerCaption,
}: {
  segments: Array<{ color: string; count: number }>;
  total: number;
  size?: number;
  centerLabel?: string;
  centerCaption?: string;
}) {
  const stroke = 12;
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let consumed = 0;
  const arcs =
    total > 0
      ? segments.map((segment) => {
          const fraction = segment.count / total;
          const arc = { color: segment.color, dash: fraction * circumference, dashOffset: -(consumed * circumference) };
          consumed += fraction;
          return arc;
        })
      : [];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full" aria-hidden>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {arcs.map((arc, index) => (
          <circle
            key={index}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={arc.dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </svg>
      {centerLabel ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-[20px] font-bold leading-none text-foreground">{centerLabel}</span>
          {centerCaption ? <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">{centerCaption}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
