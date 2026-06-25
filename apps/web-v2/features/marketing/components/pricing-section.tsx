"use client";

import { m, useReducedMotion } from "motion/react";
import {
  PLAN_CATALOG,
  PUBLIC_PLAN_KEYS,
  type PublicPlanKey,
  UNLIMITED,
} from "@aqsha/services/plan";
import {
  ArrowDownIcon,
  BookOpen,
  FileText,
  GaugeIcon,
  Library,
  MessageSquare,
  Search,
  Sparkles,
} from "@aqsha/ui/icons";
import Link from "next/link";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const neutralPanelStyle: CSSProperties = {
  backgroundColor: "color-mix(in oklch, var(--card) 84%, var(--background))",
  backgroundImage:
    "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--foreground) 9%, transparent) 1px, transparent 0)",
  backgroundSize: "8px 8px",
};

const gradientPanelStyles = {
  free: {
    backgroundImage:
      "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.13) 1px, transparent 0), radial-gradient(circle at 18% 10%, #b9f6c9 0, transparent 30%), radial-gradient(circle at 76% 78%, #6fe7ff 0, transparent 31%), linear-gradient(135deg, #0c7a68 0%, #167e9b 52%, #16324f 100%)",
    backgroundSize: "7px 7px, 100% 100%, 100% 100%, 100% 100%",
  },
  starter: {
    backgroundImage:
      "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0), radial-gradient(circle at 22% 12%, #8fb6ff 0, transparent 29%), radial-gradient(circle at 72% 80%, #ffc57c 0, transparent 27%), linear-gradient(135deg, #2f65d4 0%, #b7281f 50%, #ef6d34 100%)",
    backgroundSize: "7px 7px, 100% 100%, 100% 100%, 100% 100%",
  },
  plus: {
    backgroundImage:
      "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.13) 1px, transparent 0), radial-gradient(circle at 18% 14%, #ffd08a 0, transparent 29%), radial-gradient(circle at 78% 78%, #ff8ab3 0, transparent 31%), linear-gradient(135deg, #8a2f55 0%, #bd463f 51%, #3f2438 100%)",
    backgroundSize: "7px 7px, 100% 100%, 100% 100%, 100% 100%",
  },
  ultra: {
    backgroundImage:
      "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0), radial-gradient(circle at 20% 12%, #c5b8ff 0, transparent 30%), radial-gradient(circle at 80% 80%, #7ce0d0 0, transparent 30%), linear-gradient(135deg, #3a2f7a 0%, #5b3aa6 50%, #18203f 100%)",
    backgroundSize: "7px 7px, 100% 100%, 100% 100%, 100% 100%",
  },
} satisfies Record<string, CSSProperties>;

const pricingPills = [
  "Mulai gratis",
  "Tagihan jelas",
  "Batal kapan aja",
  "Buka di browser",
] as const;

const planPresentation = {
  free: {
    gradient: gradientPanelStyles.free,
    href: "/sign-up",
    cta: "Mulai gratis",
    badge: null,
    includes: null,
  },
  starter: {
    gradient: gradientPanelStyles.starter,
    href: "/sign-up?plan=starter",
    cta: "Pilih Starter",
    badge: "Populer",
    includes: "Semua di Free, plus",
  },
  plus: {
    gradient: gradientPanelStyles.plus,
    href: "/sign-up?plan=plus",
    cta: "Pilih Plus",
    badge: null,
    includes: "Semua di Starter, plus",
  },
  ultra: {
    gradient: gradientPanelStyles.ultra,
    href: "/sign-up?plan=ultra",
    cta: "Pilih Ultra",
    badge: "Power",
    includes: "Semua di Plus, plus",
  },
} satisfies Record<
  PublicPlanKey,
  {
    gradient: CSSProperties;
    href: string;
    cta: string;
    badge: string | null;
    includes: string | null;
  }
>;

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
  const isTopTier = planKey === "plus" || planKey === "ultra";
  return [
    {
      icon: isTopTier ? GaugeIcon : MessageSquare,
      label: `${formatCount(plan.monthlyCredits)} credits per bulan`,
    },
    {
      icon: plan.deepResearchRuns > 0 ? Sparkles : Search,
      label:
        plan.deepResearchRuns === UNLIMITED
          ? "Deep Research tanpa batas"
          : plan.deepResearchRuns > 0
            ? `${formatCount(plan.deepResearchRuns)} Deep Research per bulan`
            : "Deep Research tidak termasuk",
    },
    {
      icon: Library,
      label:
        plan.workspaceLimit === UNLIMITED
          ? "Workspace tanpa batas"
          : `${formatCount(plan.workspaceLimit)} ${plan.workspaceLimit === 1 ? "workspace" : "workspaces"}`,
    },
    {
      icon: isTopTier ? BookOpen : FileText,
      label:
        plan.libraryItemLimit === UNLIMITED
          ? "Library tanpa batas"
          : `${formatCount(plan.libraryItemLimit)} library items`,
    },
  ];
}

const plans = PUBLIC_PLAN_KEYS.map((planKey) => {
  const plan = PLAN_CATALOG[planKey];
  const presentation = planPresentation[planKey];
  return {
    ...presentation,
    name: plan.label,
    price: formatIdr(plan.monthlyPriceIdr),
    priceSuffix: "per bulan",
    supportingPrice:
      plan.annualPriceIdr > 0
        ? `${formatIdr(plan.annualPriceIdr)} per tahun`
        : "Gratis selamanya",
    features: planFeatureRows(planKey),
  };
});

const inView = { once: true as const, amount: 0.12 as const };

export function PricingSection() {
  const reduce = useReducedMotion();

  const columnVariants = {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    visible: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 180,
        damping: 24,
        delay: reduce ? 0 : index * 0.06,
      },
    }),
  };

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="w-full scroll-mt-[72px] bg-background py-12 sm:py-16 lg:py-20"
    >
      <h2 id="pricing-title" className="sr-only">
        Harga
      </h2>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <m.div
          className="mb-10 max-w-2xl sm:mb-12"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={inView}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[15px] leading-snug text-muted-foreground sm:text-base">
            Harga jujur
          </p>
          <h2
            id="pricing-heading"
            className="font-heading mt-3 text-[2.75rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-5xl sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]"
          >
            Tanpa kejutan. Batal kapan aja.
          </h2>
          <p className="mt-5 text-pretty text-lg leading-snug text-foreground/85 sm:text-xl sm:leading-snug">
            Aqsha jalan di browser — dibuka dari mana aja, kapan aja, tanpa instal
            apa-apa. Kamu tahu persis yang dibayar dan bisa berhenti tanpa drama.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {pricingPills.map((pill) => (
              <span
                key={pill}
                className="rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-sm text-foreground"
              >
                {pill}
              </span>
            ))}
          </div>
        </m.div>

        <div className="relative -mx-4 w-[calc(100%+2rem)] overflow-visible sm:-mx-6 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:w-[calc(100%+4rem)]">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="grid divide-y divide-border bg-background lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              {plans.map((plan, index) => (
                <m.article
                  key={plan.name}
                  custom={index}
                  initial="hidden"
                  whileInView="visible"
                  viewport={inView}
                  variants={columnVariants}
                  className="group flex min-h-[480px] flex-col px-0 pb-6 pt-0 sm:pb-7 lg:min-h-[520px] lg:px-4 xl:px-5"
                >
                  <div
                    style={neutralPanelStyle}
                    className={cn(
                      "relative flex min-h-[170px] flex-col overflow-hidden rounded-[22px] border border-border p-5 shadow-sm sm:min-h-[184px] sm:p-6 lg:min-h-[190px]",
                      "transition-[border-color,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
                      "group-hover:border-transparent group-hover:shadow-sm",
                    )}
                  >
                    <div
                      aria-hidden
                      style={plan.gradient}
                      className="pointer-events-none absolute inset-0 scale-[1.015] opacity-0 blur-[3px] transition-[opacity,filter,transform] duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-100 group-hover:opacity-100 group-hover:blur-0"
                    />
                    <div className="relative z-10">
                      <h3 className="text-3xl font-normal leading-none tracking-normal text-foreground transition-colors duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:text-white sm:text-[2rem]">
                        {plan.name}
                      </h3>
                      {plan.badge ? (
                        <span className="mt-4 inline-flex h-7 items-center rounded-full border border-foreground/55 px-3 text-sm font-medium leading-none text-foreground transition-colors duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:border-white group-hover:text-white">
                          {plan.badge}
                        </span>
                      ) : null}
                    </div>

                    <div className="relative z-10 mt-auto">
                      <p
                        className="mb-1.5 text-xs leading-none text-muted-foreground transition-colors duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:text-white/75 sm:text-sm"
                      >
                        {plan.supportingPrice}
                      </p>
                      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                        <span className="text-3xl font-normal leading-none tracking-normal text-foreground transition-colors duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:text-white sm:text-[2rem]">
                          {plan.price}
                        </span>
                        <span className="pb-0.5 text-sm leading-none text-muted-foreground transition-colors duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:text-white/85">
                          {plan.priceSuffix}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    asChild
                    className="mt-5 h-12 w-full rounded-full bg-foreground text-sm font-normal text-background shadow-none hover:bg-foreground/90 sm:text-base dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>

                  <div className="mt-9 sm:mt-10 lg:mt-12">
                    {plan.includes ? (
                      <div className="flex min-h-10 items-center justify-between gap-4 border-b border-dotted border-border pb-3 text-sm leading-snug text-muted-foreground sm:text-base">
                        <span>{plan.includes}</span>
                        <ArrowDownIcon aria-hidden className="size-4 shrink-0" />
                      </div>
                    ) : null}

                    <div className={plan.includes ? "" : "pt-0"}>
                      {plan.features.map((feature) => {
                        const Icon = feature.icon;

                        return (
                          <div
                            key={feature.label}
                            className="grid min-h-[48px] grid-cols-[24px_1fr] items-center gap-3 border-b border-dotted border-border py-3 sm:min-h-[52px] sm:grid-cols-[26px_1fr]"
                          >
                            <Icon className="size-[18px] text-foreground sm:size-5" />
                            <span className="text-sm leading-snug tracking-normal text-foreground sm:text-base">
                              {feature.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </m.article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
