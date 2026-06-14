import type { ComponentType } from "react";
import type { FeedVerdict } from "@aqsha/convex/feed";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  InfoIcon,
  XCircleIcon,
} from "@aqsha/ui/icons";

export type VerdictStyle = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
  accent: string;
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
