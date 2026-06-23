"use client";

import { m, useReducedMotion } from "motion/react";
import { BookOpen, FileText, Library, MessageSquare, Search } from "@aqsha/ui/icons";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TechnicalCrosshairFrame } from "@/features/marketing/components/technical-crosshair-frame";

const integrations = [
  { name: "Focused threads", icon: MessageSquare },
  { name: "Paper imports", icon: FileText },
  { name: "Workspace memory", icon: Library },
  { name: "Source notes", icon: BookOpen },
  { name: "Cited drafts", icon: Search },
  { name: "Follow-up trails", icon: MessageSquare },
  { name: "Reusable artifacts", icon: FileText },
  { name: "Saved web sources", icon: BookOpen },
  { name: "Knowledge reuse", icon: Library },
] as const;

export function IntegrationHarnessSection() {
  const reduce = useReducedMotion();

  return (
    <section className="w-full bg-background py-12 sm:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-5">
          <m.p
            className="text-sm font-normal leading-snug text-foreground sm:text-base sm:leading-snug"
            initial={reduce ? false : { opacity: 0, x: -28, rotate: -0.35 }}
            whileInView={{ opacity: 1, x: 0, rotate: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
          >
            Keep every part of the research trail in reach
          </m.p>
          <m.div
            initial={reduce ? false : { opacity: 0, x: 36, scale: 0.94 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.06 }}
            whileHover={reduce ? undefined : { scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
          >
            <Button
              asChild
              variant="outline"
              className="h-10 w-fit shrink-0 rounded-full px-5 text-sm shadow-sm sm:h-11 sm:px-6 sm:text-base"
            >
              <Link href="#workflow">See the workflow</Link>
            </Button>
          </m.div>
        </div>

        <div className="relative -mx-4 mt-10 w-[calc(100%+2rem)] overflow-visible sm:-mx-6 sm:mt-12 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:mt-14 lg:w-[calc(100%+4rem)]">
          <TechnicalCrosshairFrame>
            <div className="grid w-full grid-cols-2 justify-items-center gap-x-4 gap-y-7 sm:gap-x-10 sm:gap-y-9 md:grid-cols-3 md:gap-x-10 md:gap-y-10 lg:gap-x-12">
              {integrations.map((integration, index) => {
                const Icon = integration.icon;
                const col = index % 3;
                const row = Math.floor(index / 3);
                const drift = (col - 1) * 6 + (row % 2 === 0 ? -4 : 4);
                const spin = index % 2 === 0 ? -2.5 : 2.5;

                return (
                  <m.div
                    key={integration.name}
                    className="group flex min-h-10 w-fit max-w-full min-w-0 items-center justify-center gap-3 sm:gap-3.5"
                    initial={
                      reduce
                        ? false
                        : {
                            opacity: 0,
                            y: 24 + row * 8,
                            x: drift,
                            rotate: spin * 0.15,
                          }
                    }
                    whileInView={{
                      opacity: 1,
                      y: 0,
                      x: 0,
                      rotate: 0,
                    }}
                    viewport={{ once: true, amount: 0.35, margin: "0px 0px -8% 0px" }}
                    transition={{
                      type: "spring",
                      stiffness: 280 + (index % 4) * 18,
                      damping: 20 + (index % 3),
                      mass: 0.72,
                      delay: index * 0.035,
                    }}
                    whileHover={
                      reduce
                        ? undefined
                        : {
                            y: -3,
                            transition: { type: "spring", stiffness: 400, damping: 18 },
                          }
                    }
                  >
                    <m.div
                      className="flex h-9 w-9 shrink-0 items-center justify-center sm:h-10 sm:w-10"
                      whileHover={
                        reduce
                          ? undefined
                          : { rotate: index % 2 === 0 ? -6 : 6, scale: 1.06 }
                      }
                      transition={{ type: "spring", stiffness: 420, damping: 16 }}
                    >
                      <Icon className="size-5 text-muted-foreground transition-colors duration-200 group-hover:text-foreground" />
                    </m.div>
                    <span className="min-w-0 text-left text-sm font-medium leading-snug tracking-normal text-muted-foreground opacity-90 transition-[color,opacity] duration-200 group-hover:text-foreground group-hover:opacity-100 sm:text-[15px]">
                      {integration.name}
                    </span>
                  </m.div>
                );
              })}
            </div>
          </TechnicalCrosshairFrame>
        </div>
      </div>
    </section>
  );
}
