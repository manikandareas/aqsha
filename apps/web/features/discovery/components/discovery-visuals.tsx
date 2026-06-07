"use client";

import type { FeedVerdict } from "@aqsha/convex/feed";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  InfoIcon,
  XCircleIcon,
} from "@aqsha/ui/icons";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

// ── Verdict badge (graduated taxonomy, evidence-first) ────────────────────
type VerdictStyle = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
  accent: string; // strip / dot color
};

export const VERDICT_STYLE: Record<FeedVerdict, VerdictStyle> = {
  supported: {
    label: "Fakta",
    icon: CheckCircle2Icon,
    className: "bg-mint-soft text-mint-foreground border-mint-soft-border",
    accent: "bg-mint",
  },
  partially_supported: {
    label: "Sebagian benar",
    icon: AlertCircleIcon,
    className: "bg-lemon-soft text-lemon-foreground border-lemon-soft-border",
    accent: "bg-lemon",
  },
  needs_context: {
    label: "Perlu konteks",
    icon: InfoIcon,
    className: "bg-coral-soft text-coral-foreground border-coral-soft-border",
    accent: "bg-coral",
  },
  unverified: {
    label: "Belum terverifikasi",
    icon: HelpCircleIcon,
    className: "bg-muted text-muted-foreground border-border",
    accent: "bg-muted-foreground/40",
  },
  contradicted: {
    label: "Hoaks",
    icon: XCircleIcon,
    className: "bg-destructive/10 text-destructive border-destructive/25",
    accent: "bg-destructive",
  },
};

// SVG stroke colors for the fact-balance donut. `VERDICT_STYLE[v].accent` is a
// Tailwind `bg-*` class (fine for legend swatches), not a value usable as an SVG
// stroke — so the donut maps verdicts to raw CSS-var colors instead. `unverified`
// uses the full muted tone (not the /40 swatch) so the ring stays legible.
export const VERDICT_FILL: Record<FeedVerdict, string> = {
  supported: "var(--mint)",
  partially_supported: "var(--lemon)",
  needs_context: "var(--coral)",
  unverified: "var(--muted-foreground)",
  contradicted: "var(--destructive)",
};

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: FeedVerdict;
  className?: string;
}) {
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

// ── Evidence / stance tally (supporting vs contrasting) ───────────────────
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

// ── Sparkline (tiny inline trend chart for topic cards) ───────────────────
export function Sparkline({
  values,
  className,
  stroke = "var(--coral)",
}: {
  values: number[];
  className?: string;
  stroke?: string;
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
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden
    >
      <polyline points={areaPoints} fill="var(--coral-soft)" stroke="none" opacity={0.5} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Relevance dot (Scholar Inbox style triage signal) ─────────────────────
export function RelevanceDot({ score }: { score?: number }) {
  if (score === undefined || score <= 0) return null;
  const opacity = Math.max(0.35, Math.min(1, score / 100));
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full bg-mint"
      style={{ opacity }}
      title={`Relevansi untukmu: ${score}%`}
      aria-label={`Relevansi ${score} persen`}
    />
  );
}

// ── Score bar (idea novelty / feasibility) ────────────────────────────────
export function ScoreBar({
  label,
  value,
  tone = "mint",
}: {
  label: string;
  value: number;
  tone?: "mint" | "sky" | "lemon";
}) {
  const fill =
    tone === "sky" ? "bg-sky-foreground" : tone === "lemon" ? "bg-lemon" : "bg-mint";
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", fill)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

// ── Donut (segmented ring for small distributions) ────────────────────────
// One <circle> per segment sharing the same geometry; each is a single dash of
// length `fraction × circumference`, shifted by the cumulative offset. Rotated
// -90° so segments begin at 12 o'clock. A faint track keeps it reading as a ring
// even when nearly empty. Caller maps categories → CSS-var colors before passing.
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

  let consumed = 0; // cumulative fraction placed so far
  const arcs =
    total > 0
      ? segments.map((segment) => {
          const fraction = segment.count / total;
          const arc = {
            color: segment.color,
            dash: fraction * circumference,
            dashOffset: -(consumed * circumference),
          };
          consumed += fraction;
          return arc;
        })
      : [];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full" aria-hidden>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
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
          <span className="font-heading text-[20px] font-bold leading-none text-foreground">
            {centerLabel}
          </span>
          {centerCaption ? (
            <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">
              {centerCaption}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Composition bar (single-row segmented proportion) ─────────────────────
export function CompositionBar({
  segments,
  className,
}: {
  segments: Array<{ color: string; count: number; label: string }>;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (total <= 0) return null;
  return (
    <div
      className={cn(
        "flex h-2.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      {segments.map((segment) => (
        <div
          key={segment.label}
          className="h-full"
          style={{
            width: `${(segment.count / total) * 100}%`,
            backgroundColor: segment.color,
          }}
          title={`${segment.label}: ${segment.count}`}
        />
      ))}
    </div>
  );
}
