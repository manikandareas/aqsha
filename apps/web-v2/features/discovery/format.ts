// Pure formatters + verdict styling for the discovery mosaic. id-only (the surface
// is Indonesian-first, so the V1 lang param is dropped).

import type { ComponentType } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  InfoIcon,
  XCircleIcon,
} from "@aqsha/ui/icons";
import type { DiscoveryItem } from "./model";
import type { FeedVerdict } from "./types";

// ── Source / time / domain ────────────────────────────────────────────────
export function sourceName(item: { kind: string; authors?: string[]; sourceLabel: string }): string {
  if (item.kind === "paper" && item.authors && item.authors.length > 0) {
    return item.authors.length > 1 ? `${item.authors[0]} dkk.` : item.authors[0];
  }
  return item.sourceLabel;
}

export function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function relativeTime(ms: number | undefined): string | null {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return absoluteDate(ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return absoluteDate(ms);
}

function absoluteDate(ms: number): string | null {
  try {
    return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

export function buildSourceLine(item: DiscoveryItem): string {
  const parts: string[] = [];
  if (item.kind === "paper" && item.authors && item.authors.length > 0) {
    parts.push(item.authors.slice(0, 4).join(", "));
  } else {
    parts.push(item.sourceLabel);
  }
  const date =
    item.kind === "paper" && item.year && !item.publishedAt
      ? String(item.year)
      : (relativeTime(item.publishedAt) ?? (item.year ? String(item.year) : ""));
  if (date) parts.push(date);
  return parts.join(" · ");
}

export function formatCitationCount(value: number | undefined): string | null {
  if (value === undefined) return null;
  const count =
    value >= 1_000
      ? `${(value / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}rb`
      : value.toLocaleString("id-ID");
  return `${count} sitasi`;
}

export function topicBadgeClass(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("agent") || t.includes("reason")) return "bg-lavender-soft text-lavender-foreground";
  if (t.includes("world") || t.includes("robot")) return "bg-coral-soft text-coral-foreground";
  if (t.includes("image") || t.includes("video") || t.includes("3d")) return "bg-sky-soft text-sky-foreground";
  return "bg-lemon-soft text-lemon-foreground";
}

// ── Verdict styling (fact-check) ──────────────────────────────────────────
export type VerdictStyle = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
  accent: string;
};

export const VERDICT_STYLE: Record<FeedVerdict, VerdictStyle> = {
  supported: { label: "Fakta", icon: CheckCircle2Icon, className: "bg-mint-soft text-mint-foreground border-mint-soft-border", accent: "bg-mint" },
  partially_supported: { label: "Sebagian benar", icon: AlertCircleIcon, className: "bg-lemon-soft text-lemon-foreground border-lemon-soft-border", accent: "bg-lemon" },
  needs_context: { label: "Perlu konteks", icon: InfoIcon, className: "bg-coral-soft text-coral-foreground border-coral-soft-border", accent: "bg-coral" },
  unverified: { label: "Belum terverifikasi", icon: HelpCircleIcon, className: "bg-muted text-muted-foreground border-border", accent: "bg-muted-foreground/40" },
  contradicted: { label: "Hoaks", icon: XCircleIcon, className: "bg-destructive/10 text-destructive border-destructive/25", accent: "bg-destructive" },
};

// Raw CSS-var stroke colors for the fact-balance donut (Tailwind bg-* classes
// aren't usable as SVG strokes). `unverified` uses the full muted tone.
export const VERDICT_FILL: Record<FeedVerdict, string> = {
  supported: "var(--mint)",
  partially_supported: "var(--lemon)",
  needs_context: "var(--coral)",
  unverified: "var(--muted-foreground)",
  contradicted: "var(--destructive)",
};
