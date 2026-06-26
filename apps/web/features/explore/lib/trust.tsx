// Trust badge (lapisan verification-first, PRD §7). Status dipetakan ke token
// semantik app. Untuk data nyata (FeedItem), status diturunkan dari
// retractionStatus + provider/venue (peer-reviewed vs preprint = aproksimasi —
// path nyata via metadata sumber, plan §7f).

import { cn } from "@/lib/utils";
import type { FeedItem } from "@/features/discovery/types";
import type { TrustStatus } from "../types";

const TRUST_META: Record<TrustStatus, { label: string; className: string }> = {
  "peer-reviewed": {
    label: "✓ peer-reviewed",
    className: "border-mint-soft-border bg-mint-soft text-mint-foreground",
  },
  preprint: {
    label: "preprint",
    className: "border-border bg-muted text-muted-foreground",
  },
  corrected: {
    label: "⚠ ada koreksi",
    className: "border-lemon-soft-border bg-lemon-soft text-lemon-foreground",
  },
  retracted: {
    label: "⚠ retraksi",
    className: "border-destructive/25 bg-destructive/10 text-destructive",
  },
};

export const TRUST_LEGEND: TrustStatus[] = ["peer-reviewed", "preprint", "corrected", "retracted"];

export function TrustBadge({ status, className }: { status: TrustStatus; className?: string }) {
  const meta = TRUST_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] border px-2 py-[3px] font-mono text-[10px] leading-none tracking-tight",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

const PREPRINT_RE = /arxiv|biorxiv|medrxiv|ssrn|preprint/i;

/** Status trust dari FeedItem nyata. `null` = tak relevan (mis. berita). */
export function deriveTrustFromItem(item: FeedItem): TrustStatus | null {
  if (item.retractionStatus === "retracted") return "retracted";
  if (item.retractionStatus === "concern") return "corrected";
  if (item.kind !== "paper") return null;
  if (PREPRINT_RE.test(item.provider) || (item.venue && PREPRINT_RE.test(item.venue))) {
    return "preprint";
  }
  return "peer-reviewed";
}
