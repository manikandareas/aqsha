import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  ChartUpIcon,
  DocumentValidationIcon,
  Idea01Icon,
  Menu01Icon,
  Mortarboard02Icon,
  PauseIcon as HugePauseIcon,
  Pen01Icon,
  PlayIcon as HugePlayIcon,
  QuoteDownIcon,
  SparklesIcon as HugeSparklesIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HugeiconsIconProps, IconSvgElement } from "@hugeicons/react";
import type { Ref } from "react";

type IconProps = Omit<HugeiconsIconProps, "icon" | "altIcon" | "strokeWidth"> & {
  strokeWidth?: string | number;
  ref?: Ref<SVGSVGElement>;
};

const createIcon = (icon: IconSvgElement) =>
  function Icon({ ref, strokeWidth, ...props }: IconProps) {
    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        strokeWidth={
          typeof strokeWidth === "string" ? Number(strokeWidth) : strokeWidth
        }
        {...props}
      />
    );
  };

export const ArrowDownIcon = createIcon(ArrowDown01Icon);
export const ArrowLeftIcon = createIcon(ArrowLeft01Icon);
export const ArrowUpRightIcon = createIcon(ArrowUpRight01Icon);
export const GraduationCapIcon = createIcon(Mortarboard02Icon);
export const IdeaIcon = createIcon(Idea01Icon);
export const MenuIcon = createIcon(Menu01Icon);
export const PenIcon = createIcon(Pen01Icon);
export const QuoteIcon = createIcon(QuoteDownIcon);
export const ShieldCheckIcon = createIcon(DocumentValidationIcon);
export const PauseIcon = createIcon(HugePauseIcon);
export const PlayIcon = createIcon(HugePlayIcon);
export const SparklesIcon = createIcon(HugeSparklesIcon);
export const TrendingUpIcon = createIcon(ChartUpIcon);
export const WrenchIcon = createIcon(Wrench01Icon);
export const XIcon = createIcon(Cancel01Icon);
