"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  PLAN_CATALOG,
  PUBLIC_PLAN_KEYS,
  type PublicPlanKey,
  UNLIMITED,
} from "@/data/plan-catalog";

import { MotionProvider } from "@/components/motion-provider";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const planPresentation = {
  free: { href: appUrl("/sign-up"), cta: "Mulai gratis", badge: null, includes: null },
  starter: {
    href: appUrl("/sign-up?plan=starter"),
    cta: "Pilih Starter",
    badge: "populer",
    includes: "semua di Free, plus",
  },
  plus: {
    href: appUrl("/sign-up?plan=plus"),
    cta: "Pilih Plus",
    badge: null,
    includes: "semua di Starter, plus",
  },
  ultra: {
    href: appUrl("/sign-up?plan=ultra"),
    cta: "Pilih Ultra",
    badge: "power",
    includes: "semua di Plus, plus",
  },
} satisfies Record<
  PublicPlanKey,
  { href: string; cta: string; badge: string | null; includes: string | null }
>;

/** Resting tilt per receipt — a row of struk laid loosely on the counter. */
const receiptTilts = [-1.1, 0.9, -0.7, 1.2] as const;

const pricingPills = [
  "Mulai gratis",
  "Tagihan jelas",
  "Batal kapan aja",
  "Buka di browser",
] as const;

const idrFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});
const idCountFormatter = new Intl.NumberFormat("id-ID");

function formatIdr(value: number) {
  return idrFormatter.format(value).replace(/\s+/g, "");
}

function formatCount(value: number) {
  return idCountFormatter.format(value);
}

function planFeatureRows(planKey: PublicPlanKey) {
  const plan = PLAN_CATALOG[planKey];
  return [
    { label: "Credits / bln", value: formatCount(plan.monthlyCredits) },
    {
      label: "Deep Research",
      value:
        plan.deepResearchRuns === UNLIMITED
          ? "∞"
          : plan.deepResearchRuns > 0
            ? formatCount(plan.deepResearchRuns)
            : "—",
    },
    {
      label: "Workspace",
      value:
        plan.workspaceLimit === UNLIMITED
          ? "∞"
          : formatCount(plan.workspaceLimit),
    },
    {
      label: "Library items",
      value:
        plan.libraryItemLimit === UNLIMITED
          ? "∞"
          : formatCount(plan.libraryItemLimit),
    },
  ];
}

/**
 * PriceOdometer — the price flips per character like an odometer when the
 * billing period changes. Reduced motion falls back to a single crossfade.
 */
function PriceOdometer({ label }: { label: string }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={label}
          className="inline-block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {label}
        </m.span>
      </AnimatePresence>
    );
  }

  return (
    <span className="inline-flex overflow-hidden py-0.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {label.split("").map((char, index) => (
          <m.span
            key={`${index}-${char}`}
            className="inline-block whitespace-pre"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: EASE_OUT,
              delay: index * 0.02,
            }}
          >
            {char}
          </m.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

type Billing = "monthly" | "annual";

/** Torn receipt bottom: zigzag teeth via clip-path (straight top, torn tail). */
const receiptClipPath = (() => {
  const teeth = 22;
  const points: string[] = ["0% 0%", "100% 0%"];
  for (let i = 0; i <= teeth * 2; i++) {
    const x = 100 - (i / (teeth * 2)) * 100;
    const y = i % 2 === 0 ? "100%" : "calc(100% - 8px)";
    points.push(`${x.toFixed(2)}% ${y}`);
  }
  return `polygon(${points.join(", ")})`;
})();

const printContainer = (reduce: boolean | null) =>
  ({
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.05 },
    },
  }) as const;

const printLine = (reduce: boolean | null) =>
  reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: -6 },
        show: { opacity: 1, y: 0, transition: { duration: 0.18 } },
      };

function ReceiptRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 text-[13px]">
      <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        aria-hidden
        className="mb-[3px] min-w-3 flex-1 self-end border-b border-dotted border-border"
      />
      <span className={cn("text-right", strong ? "font-semibold text-foreground" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

/**
 * PlanReceipt — one plan as an honest shop receipt: mono type, paper-grain,
 * dotted leaders, a torn zigzag tail. Hover picks one up (straightens + lifts).
 */
function PlanReceipt({
  planKey,
  billing,
  tilt,
  delay,
}: {
  planKey: PublicPlanKey;
  billing: Billing;
  tilt: number;
  delay: number;
}) {
  const reduce = useReducedMotion();
  const plan = PLAN_CATALOG[planKey];
  const presentation = planPresentation[planKey];
  const features = planFeatureRows(planKey);
  const highlight = presentation.badge === "populer";

  const priceLabel =
    billing === "monthly"
      ? plan.monthlyPriceIdr > 0
        ? formatIdr(plan.monthlyPriceIdr)
        : "Gratis"
      : plan.annualPriceIdr > 0
        ? formatIdr(plan.annualPriceIdr)
        : "Gratis";
  const totalLabel = billing === "monthly" ? "Total / bln" : "Total / thn";
  const footnote =
    billing === "monthly"
      ? plan.annualPriceIdr > 0
        ? `tahunan: ${formatIdr(plan.annualPriceIdr)}`
        : "tanpa kartu"
      : plan.annualPriceIdr > 0
        ? "ditagih sekali setahun"
        : "tanpa kartu";

  return (
    <m.div
      className={cn(
        "relative flex flex-col border-2 bg-background pb-8 font-mono",
        highlight ? "border-foreground/50" : "border-border",
      )}
      style={{ clipPath: receiptClipPath }}
      initial={reduce ? false : { opacity: 0, y: 28, rotate: tilt * 2.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: tilt }}
      whileHover={reduce ? undefined : { rotate: 0, y: -4 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ type: "spring", stiffness: 120, damping: 17, delay }}
    >
      <div className="paper-grain pointer-events-none absolute inset-0" />

      <div className="px-5 pb-4 pt-6 text-center sm:px-6">
        <p className="text-base font-semibold text-foreground">
          {plan.label}
          {presentation.badge ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {presentation.badge}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {presentation.includes ?? "struk harga · tanpa kejutan"}
        </p>
      </div>
      <div className="mx-5 border-t border-dashed border-border sm:mx-6" />

      <m.div
        className="px-5 pt-3 sm:px-6"
        variants={printContainer(reduce)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {features.map((feature) => (
          <m.div key={feature.label} variants={printLine(reduce)}>
            <ReceiptRow label={feature.label} value={feature.value} />
          </m.div>
        ))}
      </m.div>

      <div className="mt-auto px-5 pt-3 sm:px-6">
        <div className="border-t border-dashed border-border" />
        <div className="flex items-baseline justify-between gap-2 pt-3">
          <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
            {totalLabel}
          </span>
          <span className="whitespace-nowrap text-base font-semibold text-foreground xl:text-lg">
            <PriceOdometer label={priceLabel} />
          </span>
        </div>
        <p className="pb-1 text-right text-xs text-muted-foreground">
          {footnote}
        </p>
        <div className="pt-4">
          <Button
            asChild
            variant={highlight ? "default" : "outline"}
            className="h-11 w-full rounded-full font-sans text-sm font-medium"
          >
            <a href={presentation.href}>{presentation.cta}</a>
          </Button>
          <p className="pt-4 text-center text-xs text-muted-foreground">
            · · · terima kasih · · ·
          </p>
        </div>
      </div>
    </m.div>
  );
}

/**
 * PricingSection — all plans as mono receipts with a monthly/annual toggle.
 * Signature micro-interactions: receipts print lines on scroll-in; totals flip
 * per digit on billing switch.
 */
export function PricingSection() {
  const reduce = useReducedMotion();
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <MotionProvider>
      <section
        id="pricing"
        className="w-full scroll-mt-[72px] bg-background pb-24 sm:pb-32 lg:pb-40"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <m.div
              className="max-w-2xl"
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
            >
              <p className="text-[15px] leading-snug text-muted-foreground sm:text-base">
                Harga jujur
              </p>
              <h2 className="font-heading mt-3 text-[2.25rem] font-medium leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.5rem] sm:leading-[1.06] lg:text-[2.75rem] lg:leading-[1.05]">
                Tanpa kejutan. Batal kapan aja.
              </h2>
              <p className="mt-5 text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug">
                Aqsha jalan di browser — dibuka dari mana aja, kapan aja,
                tanpa instal apa-apa. Semua yang kamu bayar tercetak jelas
                di struknya.
              </p>
            </m.div>

            <div className="inline-flex rounded-full border-2 border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition-colors",
                  billing === "monthly"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={billing === "monthly"}
              >
                Bulanan
              </button>
              <button
                type="button"
                onClick={() => setBilling("annual")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition-colors",
                  billing === "annual"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={billing === "annual"}
              >
                Tahunan
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-6 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {PUBLIC_PLAN_KEYS.map((planKey, index) => (
              <PlanReceipt
                key={planKey}
                planKey={planKey}
                billing={billing}
                tilt={receiptTilts[index % receiptTilts.length] ?? 0}
                delay={reduce ? 0 : index * 0.08}
              />
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-2 sm:mt-12">
            {pricingPills.map((pill) => (
              <span
                key={pill}
                className="rounded-full border-2 border-border bg-muted/50 px-3.5 py-1.5 text-sm text-foreground"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>
    </MotionProvider>
  );
}
