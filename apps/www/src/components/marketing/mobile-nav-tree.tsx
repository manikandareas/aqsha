"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";

import { ArrowDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { WAITLIST_PATH } from "@/lib/marketing/cta";
import { navTree } from "@/lib/marketing/nav";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

type MobileNavTreeProps = {
  openGroup: string | null;
  onOpenGroupChange: (label: string | null) => void;
  onNavigate: () => void;
  /** CTA copy — matches the desktop chrome waitlist label. */
  waitlistLabel: string;
};

/**
 * MobileNavTree — accordion over the same `navTree` as MegaNav: items with
 * description, footer links per menu, plus waitlist actions.
 */
export function MobileNavTree({
  openGroup,
  onOpenGroupChange,
  onNavigate,
  waitlistLabel,
}: MobileNavTreeProps) {
  const reduce = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background/95 shadow-xl backdrop-blur">
      <ul className="p-2">
        {navTree.map((item) =>
          item.type === "link" ? (
            <li key={item.label}>
              <a
                href={item.href}
                onClick={onNavigate}
                className="block rounded-xl px-4 py-3 text-base text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
            </li>
          ) : (
            <li key={item.label}>
              <button
                type="button"
                aria-expanded={openGroup === item.label}
                onClick={() =>
                  onOpenGroupChange(
                    openGroup === item.label ? null : item.label,
                  )
                }
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-base text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
                <ArrowDownIcon
                  size={16}
                  aria-hidden
                  className={cn(
                    "opacity-70 transition-transform duration-200",
                    openGroup === item.label && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {openGroup === item.label && (
                  <m.div
                    className="overflow-hidden"
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={
                      reduce
                        ? { opacity: 0 }
                        : {
                            height: 0,
                            opacity: 0,
                            transition: { duration: 0.18 },
                          }
                    }
                    transition={{
                      duration: 0.24,
                      ease: EASE_OUT,
                    }}
                  >
                    <ul className="pb-1">
                      {item.items.map((sub) => (
                        <li key={`${sub.href}-${sub.label}`}>
                          <a
                            href={sub.href}
                            onClick={onNavigate}
                            className="block rounded-xl py-2.5 pl-8 pr-4 transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <span className="block text-[15px] text-foreground/85">
                              {sub.label}
                            </span>
                            {sub.description ? (
                              <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
                                {sub.description}
                              </span>
                            ) : null}
                          </a>
                        </li>
                      ))}
                    </ul>
                    {item.footerLinks?.length ? (
                      <div className="mb-2 ml-8 mr-2 flex flex-wrap gap-1 border-t border-border/70 pt-2">
                        {item.footerLinks.map((link) => (
                          <a
                            key={`${link.href}-${link.label}`}
                            href={link.href}
                            onClick={onNavigate}
                            className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </m.div>
                )}
              </AnimatePresence>
            </li>
          ),
        )}
      </ul>
      <div className="border-t border-border/70 p-3">
        <Button asChild className="h-11 w-full rounded-xl text-sm">
          <a href={WAITLIST_PATH}>{waitlistLabel}</a>
        </Button>
      </div>
    </div>
  );
}
