"use client";

import { type HTMLAttributes, createContext, useContext } from "react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeContextType = {
  themed: boolean;
};

const BadgeContext = createContext<BadgeContextType | undefined>(undefined);

const useBadgeContext = () => {
  const context = useContext(BadgeContext);

  if (!context) {
    throw new Error("useBadgeContext must be used within a Badge");
  }

  return context;
};

export type AnnouncementProps = BadgeProps & {
  themed?: boolean;
};

export const Announcement = ({
  variant = "outline",
  themed = false,
  className,
  ...props
}: AnnouncementProps) => (
  <BadgeContext.Provider value={{ themed }}>
    <Badge
      variant={variant}
      className={cn(
        // `h-auto` melepas tinggi tetap Badge lokal (h-5) supaya padding internal
        // tag/title tak terpotong oleh `overflow-hidden`.
        "h-auto max-w-full gap-2 rounded-full bg-background px-3 py-0.5 font-medium shadow-sm transition-all",
        "hover:shadow-md",
        themed && "border-foreground/5",
        className,
      )}
      {...props}
    />
  </BadgeContext.Provider>
);

// span, bukan div: Announcement merender Badge sebagai <span> (inline) → anak block <div> jadi HTML
// invalid. span dgn class flex/truncate tetap tampil sama tapi valid di dalam badge.
export type AnnouncementTagProps = HTMLAttributes<HTMLSpanElement>;

export const AnnouncementTag = ({
  className,
  ...props
}: AnnouncementTagProps) => {
  const { themed } = useBadgeContext();

  return (
    <span
      className={cn(
        "-ml-2.5 shrink-0 truncate rounded-full bg-foreground/5 px-2.5 py-1 text-xs",
        themed && "bg-background/60",
        className,
      )}
      {...props}
    />
  );
};

export type AnnouncementTitleProps = HTMLAttributes<HTMLSpanElement>;

export const AnnouncementTitle = ({
  className,
  ...props
}: AnnouncementTitleProps) => (
  <span
    className={cn("flex items-center gap-1 truncate py-1", className)}
    {...props}
  />
);
