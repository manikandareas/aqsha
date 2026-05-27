import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

type SectionMotion =
  | "preview"
  | "marquee"
  | "steps"
  | "video"
  | "grid"
  | "story"
  | "compact"
  | "pricing";

type ItemMotion =
  | "step"
  | "feature"
  | "story-image"
  | "story-copy"
  | "pricing-card"
  | "price-feature";

const sectionHidden: Record<SectionMotion, Record<string, number | string>> = {
  preview: { y: 18, scale: 0.985 },
  marquee: { x: 20 },
  steps: { x: -18 },
  video: { y: 26 },
  grid: { y: 24, scale: 0.985 },
  story: {},
  compact: { y: 10, scale: 0.99 },
  pricing: { y: 18, scale: 0.98 },
};

const itemHidden: Record<ItemMotion, Record<string, number | string>> = {
  step: { x: -18, scale: 0.98 },
  feature: { y: 22, scale: 0.97 },
  "story-image": { x: -26, y: 14, rotate: -1.6, scale: 0.97 },
  "story-copy": { x: 28 },
  "pricing-card": { y: 18, scale: 0.965 },
  "price-feature": { x: -10 },
};

const visible = {
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  opacity: 1,
};

const makeSectionVariants = (kind: SectionMotion): Variants => ({
  hidden: {
    ...visible,
    ...sectionHidden[kind],
  },
  visible: {
    ...visible,
    transition: {
      duration: kind === "compact" ? 0.22 : 0.36,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: kind === "grid" ? 0.035 : kind === "pricing" ? 0.02 : 0.04,
    },
  },
});

const makeItemVariants = (kind: ItemMotion): Variants => ({
  hidden: {
    ...visible,
    ...itemHidden[kind],
  },
  visible: {
    ...visible,
    transition: {
      duration: kind === "price-feature" ? 0.2 : 0.3,
      ease: [0.22, 1, 0.36, 1],
    },
  },
});

type MotionSectionProps = HTMLMotionProps<"section"> & {
  kind: SectionMotion;
};

export const MotionSection = ({
  kind,
  className,
  children,
  ...props
}: MotionSectionProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      data-motion={kind}
      className={className}
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.01, margin: "0px 0px -12% 0px" }}
      variants={makeSectionVariants(kind)}
      {...props}
    >
      {children}
    </motion.section>
  );
};

type MotionItemProps = HTMLMotionProps<"div"> & {
  kind: ItemMotion;
};

export const MotionItem = ({
  kind,
  className,
  children,
  ...props
}: MotionItemProps) => (
  <motion.div
    className={cn(className)}
    variants={makeItemVariants(kind)}
    {...props}
  >
    {children}
  </motion.div>
);
