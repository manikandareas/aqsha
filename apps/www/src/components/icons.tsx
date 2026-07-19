/**
 * Local Hugeicons adapter for `@aqsha/www`.
 *
 * Intentional fork of `packages/ui/src/icons.tsx` for Cloudflare Pages deploy
 * isolation — this app must not import `@aqsha/ui` or any other `@aqsha/*`
 * package. Do not add a third adapter; extend this file when www needs icons.
 */
import {
  Archive02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  BookOpen01Icon,
  Cancel01Icon,
  ChartUpIcon,
  CheckmarkCircle02Icon,
  DocumentValidationIcon,
  FileExportIcon,
  FileSearchIcon as HugeFileSearchIcon,
  Flag02Icon,
  Idea01Icon,
  InstagramIcon as HugeInstagramIcon,
  Menu01Icon,
  Moon02Icon,
  Mortarboard02Icon,
  NewTwitterIcon,
  PauseIcon as HugePauseIcon,
  Pen01Icon,
  PlayIcon as HugePlayIcon,
  QuoteDownIcon,
  Search01Icon,
  SparklesIcon as HugeSparklesIcon,
  Sun02Icon,
  ThreadsIcon as HugeThreadsIcon,
  TiktokIcon as HugeTiktokIcon,
  WorkHistoryIcon,
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

export const ArchiveIcon = createIcon(Archive02Icon);
export const ArrowDownIcon = createIcon(ArrowDown01Icon);
export const BookOpenIcon = createIcon(BookOpen01Icon);
export const CheckCircleIcon = createIcon(CheckmarkCircle02Icon);
export const FileExportedIcon = createIcon(FileExportIcon);
export const FileSearchIcon = createIcon(HugeFileSearchIcon);
export const FlagIcon = createIcon(Flag02Icon);
export const HistoryIcon = createIcon(WorkHistoryIcon);
export const SearchIcon = createIcon(Search01Icon);
export const ArrowLeftIcon = createIcon(ArrowLeft01Icon);
export const ArrowUpRightIcon = createIcon(ArrowUpRight01Icon);
export const GraduationCapIcon = createIcon(Mortarboard02Icon);
export const IdeaIcon = createIcon(Idea01Icon);
export const MenuIcon = createIcon(Menu01Icon);
export const MoonIcon = createIcon(Moon02Icon);
export const SunIcon = createIcon(Sun02Icon);
export const PenIcon = createIcon(Pen01Icon);
export const QuoteIcon = createIcon(QuoteDownIcon);
export const ShieldCheckIcon = createIcon(DocumentValidationIcon);
export const PauseIcon = createIcon(HugePauseIcon);
export const PlayIcon = createIcon(HugePlayIcon);
export const SparklesIcon = createIcon(HugeSparklesIcon);
export const TrendingUpIcon = createIcon(ChartUpIcon);
export const WrenchIcon = createIcon(Wrench01Icon);
export const XIcon = createIcon(Cancel01Icon);
export const InstagramIcon = createIcon(HugeInstagramIcon);
export const ThreadsIcon = createIcon(HugeThreadsIcon);
export const TiktokIcon = createIcon(HugeTiktokIcon);
export const XSocialIcon = createIcon(NewTwitterIcon);
