"use client";

import { m, useReducedMotion } from "motion/react";

type LandingSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  titleParts?: readonly string[];
  className?: string;
};

const inView = { once: true as const, amount: 0.55 as const };

export function LandingSectionHeader({
  eyebrow,
  title,
  description,
  titleParts,
  className,
}: LandingSectionHeaderProps) {
  const reduce = useReducedMotion();
  const parts = titleParts ?? title.split(" ");

  return (
    <m.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <m.p
        className="text-[15px] leading-snug text-muted-foreground sm:text-base"
        initial={
          reduce ? false : { opacity: 0, clipPath: "inset(100% 0 0 0)", y: 6 }
        }
        whileInView={{ opacity: 1, clipPath: "inset(0% 0 0 0)", y: 0 }}
        viewport={inView}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {eyebrow}
      </m.p>
      <h2 className="font-heading mt-3 max-w-[min(100%,40rem)] text-[2.75rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-5xl sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]">
        {parts.map((part, i) => (
          <span key={`${part}-${i}`}>
            <m.span
              className="inline-block"
              initial={
                reduce
                  ? false
                  : {
                      opacity: 0,
                      x: i % 2 === 0 ? -28 : 28,
                      skewX: i === 1 ? 2 : 0,
                    }
              }
              whileInView={{ opacity: 1, x: 0, skewX: 0 }}
              viewport={inView}
              transition={{
                delay: i * 0.07,
                type: "spring",
                stiffness: 160,
                damping: 24,
                mass: 0.85,
              }}
            >
              {part}
            </m.span>
            {i < parts.length - 1 ? " " : null}
          </span>
        ))}
      </h2>
      {description ? (
        <p className="mt-5 max-w-2xl text-pretty text-lg leading-snug text-foreground/85 sm:text-xl sm:leading-snug">
          {description}
        </p>
      ) : null}
    </m.div>
  );
}
