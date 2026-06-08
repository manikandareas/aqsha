"use client";

import {
  ChevronRightIcon,
  MessageSquareIcon,
  PanelLeftIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExploreBreadcrumb = {
  label: string;
  href?: string;
};

export function ExploreSurfaceHeader({
  breadcrumbs,
  chatOpen,
  onToggleChat,
  showLeftTrigger,
  onToggleLeftSidebar,
}: {
  breadcrumbs: ExploreBreadcrumb[];
  chatOpen?: boolean;
  onToggleChat?: () => void;
  showLeftTrigger: boolean;
  onToggleLeftSidebar: () => void;
}) {
  return (
    <header className="shrink-0 bg-background">
      <div
        className={cn(
          "flex min-h-14 w-full items-center justify-between gap-2 px-5 sm:px-8 lg:px-10",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {showLeftTrigger ? (
            <Button
              type="button"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onToggleLeftSidebar}
              aria-label="Buka sidebar kiri"
            >
              <PanelLeftIcon className="size-3.5" />
            </Button>
          ) : null}
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-[12px] font-medium text-muted-foreground"
          >
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                  {index > 0 ? <ChevronRightIcon className="size-3 shrink-0" /> : null}
                  {item.href && !isLast ? (
                    <Link href={item.href} className="truncate hover:text-foreground">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={cn("truncate", isLast && "font-semibold text-foreground")}>
                      {item.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        </div>
        {onToggleChat ? (
          <button
            type="button"
            onClick={onToggleChat}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
              chatOpen
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-label="Toggle panel chat"
          >
            <MessageSquareIcon className="size-3.5" />
            Chat
          </button>
        ) : null}
      </div>
    </header>
  );
}
